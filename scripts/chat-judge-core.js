const JUDGE_CRITERIA = [
  'instructionFollowing',
  'contextRetention',
  'usefulness',
  'conciseness',
  'languageQuality',
  'safety',
];

const DEFAULT_FAILURE_SCORE_CAP = 59;
const DEFAULT_MIN_REPLY_CHARS = 12;
const BULLET_LINE_RE = /^\s*(?:[-*•・]|(?:\d+)[.)]|[①-⑩])\s*\S+/;
const HEADING_LINE_RE = /^\s*(?:#{1,6}\s+)?[^:\n：]{1,32}[:：]\s*\S+/;

function normalizeEvaluatorMode(mode) {
  const normalized = String(mode || '').trim().toLowerCase();
  if (!normalized || normalized === 'browser-backend-chat') return 'browser-backend-chat';
  if (normalized === 'claude') return 'anthropic';
  if (normalized === 'grok') return 'xai';
  if (normalized === 'copilot') return 'github-models';
  return normalized;
}

function firstNonEmpty(...values) {
  for (const value of values) {
    const text = String(value || '').trim();
    if (text) return text;
  }
  return '';
}

function toPositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value || ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function stripTrailingSlash(value) {
  return String(value || '').replace(/\/+$/, '');
}

function joinUrl(baseUrl, pathname) {
  const base = stripTrailingSlash(baseUrl);
  const pathPart = String(pathname || '').startsWith('/') ? pathname : `/${String(pathname || '')}`;
  return `${base}${pathPart}`;
}

function extractJson(text) {
  const raw = String(text || '').trim();
  const unfenced = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();

  try {
    return JSON.parse(unfenced);
  } catch {
    const first = unfenced.indexOf('{');
    const last = unfenced.lastIndexOf('}');
    if (first >= 0 && last > first) {
      return JSON.parse(unfenced.slice(first, last + 1));
    }
    throw new Error(`Judge response was not valid JSON: ${raw.slice(0, 400)}`);
  }
}

function formatTranscript(messages) {
  return messages.map((message) => `${message.role.toUpperCase()}: ${message.content}`).join('\n');
}

function formatHardCheckHints(scenario) {
  const hardChecks = scenario?.hardChecks || {};
  const hints = [];

  if (scenario?.strictKeywords?.length) {
    hints.push(`Must mention all required facts: ${scenario.strictKeywords.join(', ')}`);
  }

  if (scenario?.bannedPhrases?.length) {
    hints.push(`Must not contain banned phrases: ${scenario.bannedPhrases.join(', ')}`);
  }

  if (Number.isFinite(hardChecks.minReplyChars) && hardChecks.minReplyChars > 0) {
    hints.push(`Reply must be at least ${hardChecks.minReplyChars} characters long.`);
  }

  if (Number.isFinite(hardChecks.maxSentences) && hardChecks.maxSentences > 0) {
    hints.push(`Use at most ${hardChecks.maxSentences} sentences.`);
  }

  if (hardChecks.requireList) {
    if (Number.isFinite(hardChecks.exactListItems) && hardChecks.exactListItems > 0) {
      hints.push(`Use a structured list format with exactly ${hardChecks.exactListItems} items.`);
    } else {
      const details = [];
      if (Number.isFinite(hardChecks.minListItems) && hardChecks.minListItems > 0) {
        details.push(`at least ${hardChecks.minListItems} items`);
      }
      if (Number.isFinite(hardChecks.maxListItems) && hardChecks.maxListItems > 0) {
        details.push(`no more than ${hardChecks.maxListItems} items`);
      }

      if (details.length > 0) {
        hints.push(`Use a structured list format with ${details.join(' and ')}.`);
      } else {
        hints.push('Use a structured list format.');
      }
    }
  }

  return hints.length ? hints : ['No extra hard checks beyond the rubric.'];
}

function buildJudgePrompt(scenario, messages, evaluatorConfig) {
  return [
    'You are a strict QA judge for a production chat application.',
    'Evaluate the assistant response against the scenario rubric and hard checks.',
    'Return valid JSON only. Do not wrap it in markdown.',
    'Calibrate scores against current top-tier commercial assistants. Scores above 90 should be rare and reserved for near-flawless answers.',
    'If any hard check fails, set pass=false and overallScore to 59 or lower.',
    'Use this schema exactly:',
    '{"pass":boolean,"overallScore":number,"criteria":{"instructionFollowing":1-5,"contextRetention":1-5,"usefulness":1-5,"conciseness":1-5,"languageQuality":1-5,"safety":1-5},"summary":string,"issues":string[]}',
    'overallScore must be 0-100.',
    'Be strict about missing constraints, lost context, filler text, missing facts, verbosity, weak structure, and unnatural language.',
    '',
    `Scenario ID: ${scenario.id}`,
    `Channel: ${scenario.channel}`,
    `Expected answer language: ${scenario.expectedLanguage === 'en' ? 'English' : 'Japanese'}`,
    `Evaluator ID: ${evaluatorConfig.id}`,
    `Evaluator mode: ${evaluatorConfig.mode}`,
    `Prompt version: ${evaluatorConfig.promptVersion}`,
    'Rubric:',
    ...scenario.rubric.map((item, index) => `${index + 1}. ${item}`),
    '',
    'Hard checks:',
    ...formatHardCheckHints(scenario).map((item, index) => `${index + 1}. ${item}`),
    '',
    scenario.strictKeywords?.length
      ? `Important facts that should usually appear: ${scenario.strictKeywords.join(', ')}`
      : 'Important facts that should usually appear: none',
    scenario.bannedPhrases?.length
      ? `Banned phrases: ${scenario.bannedPhrases.join(', ')}`
      : 'Banned phrases: none',
    scenario.referenceAnswer
      ? 'Reference answer for calibration (do not require verbatim match, but score against this quality bar):'
      : 'Reference answer for calibration: none',
    scenario.referenceAnswer || '',
    '',
    'Transcript:',
    formatTranscript(messages),
    '',
    'Final assistant reply to judge:',
    messages[messages.length - 1]?.content || '',
  ].join('\n');
}

function extractTextContent(value) {
  if (typeof value === 'string') return value.trim();
  if (!Array.isArray(value)) return String(value || '').trim();
  return value
    .map((item) => {
      if (typeof item === 'string') return item;
      if (typeof item?.text === 'string') return item.text;
      if (typeof item?.content === 'string') return item.content;
      return '';
    })
    .join('\n')
    .trim();
}

function normalizeReplyText(value) {
  return String(value || '').replace(/\r\n/g, '\n').trim();
}

function collectStructuredItems(text) {
  return normalizeReplyText(text)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && (BULLET_LINE_RE.test(line) || HEADING_LINE_RE.test(line)));
}

function countSentences(text) {
  const normalized = normalizeReplyText(text).replace(/\n+/g, ' ');
  if (!normalized) return 0;
  return normalized
    .split(/[.!?。！？]+/)
    .map((fragment) => fragment.trim())
    .filter(Boolean).length;
}

function detectExpectedLanguage(expectedLanguage, text) {
  const normalized = normalizeReplyText(text);
  const hasJapanese = /[\u3040-\u30ff\u3400-\u9fff]/.test(normalized);
  const hasLatin = /[A-Za-z]/.test(normalized);

  if (expectedLanguage === 'ja') {
    return {
      ok: hasJapanese,
      detected: hasJapanese ? 'ja' : hasLatin ? 'en-like' : 'unknown',
    };
  }

  if (expectedLanguage === 'en') {
    return {
      ok: hasLatin,
      detected: hasLatin ? 'en' : hasJapanese ? 'ja-like' : 'unknown',
    };
  }

  return { ok: true, detected: 'unknown' };
}

function addFailure(failures, code, message) {
  failures.push({ code, message });
}

function uniqueStrings(values) {
  const seen = new Set();
  const output = [];
  for (const value of values) {
    const text = String(value || '').trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    output.push(text);
  }
  return output;
}

function evaluateScenarioHardChecks(scenario, finalReply) {
  const reply = normalizeReplyText(finalReply);
  const replyLower = reply.toLocaleLowerCase();
  const hardChecks = scenario?.hardChecks || {};
  const minReplyChars =
    Number.isFinite(hardChecks.minReplyChars) && hardChecks.minReplyChars > 0
      ? hardChecks.minReplyChars
      : DEFAULT_MIN_REPLY_CHARS;
  const missingKeywords = [];
  const matchedKeywords = [];
  const bannedPhraseHits = [];

  for (const keyword of scenario?.strictKeywords || []) {
    const normalizedKeyword = String(keyword || '').trim();
    if (!normalizedKeyword) continue;
    if (replyLower.includes(normalizedKeyword.toLocaleLowerCase())) {
      matchedKeywords.push(normalizedKeyword);
    } else {
      missingKeywords.push(normalizedKeyword);
    }
  }

  for (const phrase of scenario?.bannedPhrases || []) {
    const normalizedPhrase = String(phrase || '').trim();
    if (!normalizedPhrase) continue;
    if (replyLower.includes(normalizedPhrase.toLocaleLowerCase())) {
      bannedPhraseHits.push(normalizedPhrase);
    }
  }

  const language = detectExpectedLanguage(scenario?.expectedLanguage, reply);
  const sentenceCount = countSentences(reply);
  const listItems = collectStructuredItems(reply);
  const failures = [];

  if (reply.length < minReplyChars) {
    addFailure(
      failures,
      'reply-too-short',
      `Reply was too short for reliable evaluation (${reply.length} chars, expected at least ${minReplyChars}).`
    );
  }

  if (!language.ok) {
    addFailure(
      failures,
      'unexpected-language',
      `Reply did not appear to be in the expected language (${scenario?.expectedLanguage || 'unknown'}).`
    );
  }

  if (missingKeywords.length > 0) {
    addFailure(
      failures,
      'missing-required-keywords',
      `Reply missed required facts: ${missingKeywords.join(', ')}.`
    );
  }

  if (bannedPhraseHits.length > 0) {
    addFailure(
      failures,
      'banned-phrases-present',
      `Reply contained banned phrases: ${bannedPhraseHits.join(', ')}.`
    );
  }

  if (Number.isFinite(hardChecks.maxSentences) && hardChecks.maxSentences > 0 && sentenceCount > hardChecks.maxSentences) {
    addFailure(
      failures,
      'too-many-sentences',
      `Reply used too many sentences (${sentenceCount}, expected at most ${hardChecks.maxSentences}).`
    );
  }

  if (hardChecks.requireList && listItems.length === 0) {
    addFailure(failures, 'missing-list-format', 'Reply was expected to use a structured list format.');
  }

  if (Number.isFinite(hardChecks.exactListItems) && hardChecks.exactListItems > 0 && listItems.length !== hardChecks.exactListItems) {
    addFailure(
      failures,
      'wrong-list-item-count',
      `Reply used ${listItems.length} structured items, expected exactly ${hardChecks.exactListItems}.`
    );
  }

  if (Number.isFinite(hardChecks.minListItems) && hardChecks.minListItems > 0 && listItems.length < hardChecks.minListItems) {
    addFailure(
      failures,
      'too-few-list-items',
      `Reply used too few structured items (${listItems.length}, expected at least ${hardChecks.minListItems}).`
    );
  }

  if (Number.isFinite(hardChecks.maxListItems) && hardChecks.maxListItems > 0 && listItems.length > hardChecks.maxListItems) {
    addFailure(
      failures,
      'too-many-list-items',
      `Reply used too many structured items (${listItems.length}, expected at most ${hardChecks.maxListItems}).`
    );
  }

  return {
    passed: failures.length === 0,
    failures,
    replyLength: reply.length,
    sentenceCount,
    listItemCount: listItems.length,
    listItems,
    matchedKeywords,
    missingKeywords,
    bannedPhraseHits,
    expectedLanguage: scenario?.expectedLanguage || 'unknown',
    detectedLanguage: language.detected,
  };
}

function clampNumber(value, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  if (numeric < min) return min;
  if (numeric > max) return max;
  return numeric;
}

function capCriterion(criteria, key, value) {
  criteria[key] = Math.min(criteria[key], value);
}

function applyHardFailureCaps(criteria, hardChecks) {
  const failureCodes = new Set((hardChecks?.failures || []).map((failure) => failure.code));

  if (failureCodes.has('missing-required-keywords')) {
    capCriterion(criteria, 'instructionFollowing', 2);
    capCriterion(criteria, 'contextRetention', 2);
    capCriterion(criteria, 'usefulness', 3);
  }

  if (failureCodes.has('banned-phrases-present')) {
    capCriterion(criteria, 'instructionFollowing', 2);
    capCriterion(criteria, 'conciseness', 3);
    capCriterion(criteria, 'languageQuality', 2);
  }

  if (failureCodes.has('unexpected-language')) {
    capCriterion(criteria, 'instructionFollowing', 2);
    capCriterion(criteria, 'languageQuality', 1);
  }

  if (failureCodes.has('too-many-sentences')) {
    capCriterion(criteria, 'instructionFollowing', 2);
    capCriterion(criteria, 'conciseness', 2);
  }

  if (
    failureCodes.has('missing-list-format') ||
    failureCodes.has('wrong-list-item-count') ||
    failureCodes.has('too-few-list-items') ||
    failureCodes.has('too-many-list-items')
  ) {
    capCriterion(criteria, 'instructionFollowing', 2);
    capCriterion(criteria, 'usefulness', 3);
  }

  if (failureCodes.has('reply-too-short')) {
    capCriterion(criteria, 'usefulness', 2);
  }

  return criteria;
}

function finalizeJudgeResult(parsed, scenario, finalReply) {
  const rawCriteria = parsed?.criteria || {};
  const invalidCriteria = JUDGE_CRITERIA.filter((criterion) => {
    const value = Number(rawCriteria?.[criterion]);
    return !Number.isFinite(value) || value < 1 || value > 5;
  });
  const hasValidOverallScore = Number.isFinite(Number(parsed?.overallScore));
  const summary = String(parsed?.summary || '').trim();
  const hardChecks = evaluateScenarioHardChecks(scenario, finalReply);
  const criteria = applyHardFailureCaps(
    {
      instructionFollowing: clampNumber(rawCriteria.instructionFollowing, 0, 5),
      contextRetention: clampNumber(rawCriteria.contextRetention, 0, 5),
      usefulness: clampNumber(rawCriteria.usefulness, 0, 5),
      conciseness: clampNumber(rawCriteria.conciseness, 0, 5),
      languageQuality: clampNumber(rawCriteria.languageQuality, 0, 5),
      safety: clampNumber(rawCriteria.safety, 0, 5),
    },
    hardChecks
  );

  let pass = Boolean(parsed?.pass);
  let overallScore = hasValidOverallScore ? clampNumber(parsed?.overallScore, 0, 100) : 0;

  const metadataIssues = [];
  if (!summary) {
    metadataIssues.push('Judge summary was empty.');
  }
  if (!hasValidOverallScore) {
    metadataIssues.push('Judge overallScore was missing or invalid.');
  }
  if (invalidCriteria.length > 0) {
    metadataIssues.push(`Judge criteria were missing or invalid: ${invalidCriteria.join(', ')}.`);
  }

  if (hardChecks.failures.length > 0 || metadataIssues.length > 0) {
    pass = false;
    overallScore = Math.min(overallScore, DEFAULT_FAILURE_SCORE_CAP);
  }

  const issues = uniqueStrings([
    ...(Array.isArray(parsed?.issues) ? parsed.issues.map((issue) => String(issue || '')) : []),
    ...hardChecks.failures.map((failure) => failure.message),
    ...metadataIssues,
  ]);

  return {
    pass,
    overallScore,
    criteria,
    summary: summary || issues[0] || 'Judge output was incomplete.',
    issues,
    hardChecks,
    modelPass: Boolean(parsed?.pass),
    modelOverallScore: hasValidOverallScore ? clampNumber(parsed?.overallScore, 0, 100) : 0,
  };
}

module.exports = {
  buildJudgePrompt,
  evaluateScenarioHardChecks,
  extractJson,
  extractTextContent,
  finalizeJudgeResult,
  firstNonEmpty,
  formatTranscript,
  joinUrl,
  normalizeEvaluatorMode,
  toPositiveInt,
};