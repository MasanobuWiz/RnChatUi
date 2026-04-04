/**
 * @jest-environment node
 */

const {
  buildJudgePrompt,
  evaluateScenarioHardChecks,
  finalizeJudgeResult,
  textIncludesNormalized,
} = require('../scripts/chat-judge-core.js');

describe('chat judge core helpers', () => {
  const scenario = {
    id: 'unit-memory-summary-en',
    channel: 'guest',
    expectedLanguage: 'en',
    rubric: [
      'Keep the answer in English.',
      'Retain the key facts.',
      'Use a short bullet list.',
    ],
    strictKeywords: ['Emma', 'blue', 'Kyoto'],
    bannedPhrases: ['Thinking'],
    referenceAnswer: '- Name: Emma\n- Favorite color: blue\n- Destination: Kyoto',
    hardChecks: {
      minReplyChars: 20,
      requireList: true,
      minListItems: 2,
      maxListItems: 4,
    },
  };

  const jsonScenario = {
    id: 'unit-json-extract-ja',
    channel: 'guest',
    expectedLanguage: 'ja',
    rubric: [
      'Return JSON only.',
      'Use the required keys only.',
      'Keep the values aligned with the request.',
    ],
    strictKeywords: ['日帰り旅行', '京都', '30000円'],
    bannedPhrases: ['```'],
    referenceAnswer: '{"task":"日帰り旅行","destination":"京都","budget":"30000円","note":"朝は遅め"}',
    hardChecks: {
      minReplyChars: 20,
      requireJsonObject: true,
      exactJsonKeys: ['task', 'destination', 'budget', 'note'],
      jsonStringValuesOnly: true,
    },
  };

  it('builds a prompt with hard checks and a reference answer', () => {
    const prompt = buildJudgePrompt(
      scenario,
      [
        { role: 'user', content: 'Summarize my constraints.' },
        { role: 'assistant', content: '- Name: Emma\n- Destination: Kyoto' },
      ],
      { id: 'judge-v2', mode: 'github-models', promptVersion: '2026-04-03' }
    );

    expect(prompt).toContain('Hard checks:');
    expect(prompt).toContain('Must mention all required facts: Emma, blue, Kyoto');
    expect(prompt).toContain('Reference answer for calibration');
    expect(prompt).toContain('- Name: Emma');
    expect(prompt).toContain('If any hard check fails, set pass=false and overallScore to 59 or lower.');
  });

  it('detects deterministic hard-check failures', () => {
    const hardChecks = evaluateScenarioHardChecks(scenario, 'Thinking\nEmma likes blue.');

    expect(hardChecks.passed).toBe(false);
    expect(hardChecks.missingKeywords).toContain('Kyoto');
    expect(hardChecks.bannedPhraseHits).toContain('Thinking');
    expect(hardChecks.failures.map((failure) => failure.code)).toEqual(
      expect.arrayContaining(['banned-phrases-present', 'missing-required-keywords', 'missing-list-format', 'too-few-list-items'])
    );
  });

  it('builds a prompt with JSON-object hard checks', () => {
    const prompt = buildJudgePrompt(
      jsonScenario,
      [
        { role: 'user', content: 'Return the travel request as JSON.' },
        { role: 'assistant', content: '{"task":"日帰り旅行"}' },
      ],
      { id: 'judge-v2', mode: 'github-models', promptVersion: '2026-04-04' }
    );

    expect(prompt).toContain('Return a single JSON object with no explanatory text.');
    expect(prompt).toContain('JSON keys must be exactly: task, destination, budget, note.');
    expect(prompt).toContain('All JSON values must be strings.');
  });

  it('detects invalid JSON-object hard-check failures', () => {
    const hardChecks = evaluateScenarioHardChecks(
      jsonScenario,
      '{"task":"日帰り旅行","destination":"京都","budget":30000}'
    );

    expect(hardChecks.passed).toBe(false);
    expect(hardChecks.failures.map((failure) => failure.code)).toEqual(
      expect.arrayContaining(['missing-json-keys', 'unexpected-json-keys', 'non-string-json-values'])
    );
  });

  it('matches numeric facts despite comma separators', () => {
    expect(textIncludesNormalized('合計金額は3,680円です。', '3680円')).toBe(true);
    expect(textIncludesNormalized('The total is 30,000 yen.', '30000 yen')).toBe(true);
  });

  it('forces a failing verdict when hard checks fail', () => {
    const result = finalizeJudgeResult(
      {
        pass: true,
        overallScore: 96,
        criteria: {
          instructionFollowing: 5,
          contextRetention: 5,
          usefulness: 5,
          conciseness: 4,
          languageQuality: 5,
          safety: 5,
        },
        summary: 'Looks strong.',
        issues: [],
      },
      scenario,
      'Thinking\nEmma likes blue.'
    );

    expect(result.modelPass).toBe(true);
    expect(result.pass).toBe(false);
    expect(result.overallScore).toBeLessThanOrEqual(59);
    expect(result.criteria.instructionFollowing).toBeLessThanOrEqual(2);
    expect(result.criteria.languageQuality).toBeLessThanOrEqual(2);
    expect(result.issues.join(' ')).toContain('banned phrases');
  });

  it('forces a failing verdict when JSON hard checks fail', () => {
    const result = finalizeJudgeResult(
      {
        pass: true,
        overallScore: 92,
        criteria: {
          instructionFollowing: 5,
          contextRetention: 4,
          usefulness: 5,
          conciseness: 4,
          languageQuality: 5,
          safety: 5,
        },
        summary: 'Looks valid.',
        issues: [],
      },
      jsonScenario,
      '{"task":"日帰り旅行","destination":"京都","budget":30000}'
    );

    expect(result.pass).toBe(false);
    expect(result.overallScore).toBeLessThanOrEqual(59);
    expect(result.criteria.instructionFollowing).toBeLessThanOrEqual(1);
    expect(result.issues.join(' ')).toContain('JSON');
  });
});