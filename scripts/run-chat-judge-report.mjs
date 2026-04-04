import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);
const scenarios = require('./chat-judge-scenarios.json');
const { textIncludesNormalized } = require('./chat-judge-core.js');

const judgeCriteria = [
  'instructionFollowing',
  'contextRetention',
  'usefulness',
  'conciseness',
  'languageQuality',
  'safety',
];

function readArgValue(args, name, fallback = '') {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  return String(args[index + 1] || '').trim();
}

function ensureParentDir(filePath) {
  if (!filePath) return Promise.resolve();
  return fs.mkdir(path.dirname(filePath), { recursive: true });
}

function buildScenarioSelection(allScenarios, { includeAuth, authOnly, scenarioFilter }) {
  const baseScenarios = includeAuth ? allScenarios : allScenarios.filter((scenario) => scenario.channel !== 'auth');
  const scopedScenarios = authOnly
    ? baseScenarios.filter((scenario) => scenario.channel === 'auth')
    : baseScenarios;

  return scenarioFilter
    ? scopedScenarios.filter((scenario) => String(scenario.id || '').includes(scenarioFilter))
    : scopedScenarios;
}

function runJudgeScenario(scenarioId) {
  const scriptPath = path.resolve(__dirname, 'chat-judge-eval.mjs');
  const startedAt = Date.now();
  const result = spawnSync(process.execPath, [scriptPath, '--scenario', scenarioId], {
    env: process.env,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
  const durationMs = Date.now() - startedAt;
  const stderr = String(result.stderr || '').trim();
  const stdout = String(result.stdout || '').trim();

  if (result.status !== 0) {
    return {
      ok: false,
      durationMs,
      error: stderr || stdout || `Judge runner failed for ${scenarioId}`,
      rawOutput: stdout,
    };
  }

  try {
    return {
      ok: true,
      durationMs,
      payload: JSON.parse(stdout || '{}'),
    };
  } catch (error) {
    return {
      ok: false,
      durationMs,
      error: `Judge runner returned invalid JSON for ${scenarioId}: ${error instanceof Error ? error.message : String(error)}`,
      rawOutput: stdout,
    };
  }
}

function collectScenarioFailures(scenario, run) {
  const failures = [];
  const finalReply = String(run?.finalReply || '');
  const result = run?.judge || {};

  if (finalReply.trim().length <= 12) {
    failures.push('finalReply must be longer than 12 characters.');
  }

  for (const phrase of scenario.bannedPhrases || []) {
    if (textIncludesNormalized(finalReply, phrase)) {
      failures.push(`finalReply contains banned phrase: ${phrase}`);
    }
  }

  for (const keyword of scenario.strictKeywords || []) {
    if (!textIncludesNormalized(finalReply, keyword)) {
      failures.push(`finalReply is missing strict keyword: ${keyword}`);
    }
  }

  if (scenario.expectedLanguage === 'ja' && !/[\u3040-\u30ff\u3400-\u9fff]/.test(finalReply)) {
    failures.push('finalReply does not look like Japanese text.');
  }

  if (scenario.expectedLanguage === 'en' && !/[A-Za-z]/.test(finalReply)) {
    failures.push('finalReply does not look like English text.');
  }

  if (!result.hardChecks?.passed) {
    const hardFailures = Array.isArray(result.hardChecks?.failures)
      ? result.hardChecks.failures.map((failure) => `${failure.code}:${failure.message}`).join(' | ')
      : 'unknown hard check failure';
    failures.push(`hard checks failed: ${hardFailures}`);
  }

  if (Number(result.overallScore || 0) < Number(scenario.minOverallScore || 0)) {
    failures.push(`overallScore ${result.overallScore} is below threshold ${scenario.minOverallScore}`);
  }

  for (const criterion of judgeCriteria) {
    const value = Number(result.criteria?.[criterion] || 0);
    if (value < Number(scenario.minCriterionScore || 0)) {
      failures.push(`criterion ${criterion} scored ${value} below threshold ${scenario.minCriterionScore}`);
    }
  }

  if (!result.pass) {
    failures.push(`judge returned pass=false: ${String(result.summary || 'no summary')}`);
  }

  return failures;
}

function buildMarkdownReport(report) {
  const lines = [
    '# Chat Judge Report',
    '',
    `- Generated at: ${report.generatedAt}`,
    `- Evaluator mode: ${report.evaluator.mode}`,
    `- Evaluator model: ${report.evaluator.model}`,
    `- Evaluator id: ${report.evaluator.id}`,
    `- Passed: ${report.summary.passed}/${report.summary.total}`,
    `- Failed: ${report.summary.failed}/${report.summary.total}`,
    '',
    '| Scenario | Channel | Status | Score | Model | Duration |',
    '| --- | --- | --- | --- | --- | --- |',
  ];

  for (const item of report.results) {
    const score = item.judge ? `${item.judge.overallScore}` : '-';
    const modelId = item.judge ? String(item.judge.modelId || '-') : '-';
    lines.push(`| ${item.scenarioId} | ${item.channel} | ${item.status} | ${score} | ${modelId} | ${item.durationMs}ms |`);
  }

  const failures = report.results.filter((item) => item.status !== 'passed');
  if (failures.length > 0) {
    lines.push('', '## Failures', '');
    for (const item of failures) {
      lines.push(`### ${item.scenarioId}`, '');
      for (const failure of item.failures) {
        lines.push(`- ${failure}`);
      }
      if (item.finalReply) {
        lines.push(`- finalReply: ${item.finalReply.replace(/\r?\n+/g, ' / ')}`);
      }
      if (item.error) {
        lines.push(`- error: ${item.error.replace(/\r?\n+/g, ' / ')}`);
      }
      lines.push('');
    }
  }

  return `${lines.join('\n').trim()}\n`;
}

const args = process.argv.slice(2);
const includeAuth = args.includes('--include-auth');
const authOnly = args.includes('--auth-only');
const scenarioId = readArgValue(args, '--scenario');
const scenarioFilter = readArgValue(args, '--scenario-filter');
const outputPath = readArgValue(args, '--output');
const markdownOutputPath = readArgValue(args, '--markdown-output');
let activeScenarios = buildScenarioSelection(scenarios, { includeAuth, authOnly, scenarioFilter });

if (scenarioId) {
  activeScenarios = activeScenarios.filter((scenario) => scenario.id === scenarioId);
}

if (activeScenarios.length === 0) {
  console.error('No judge scenarios matched the current filters.');
  process.exit(1);
}

const results = [];

for (const scenario of activeScenarios) {
  const execution = runJudgeScenario(scenario.id);
  if (!execution.ok) {
    results.push({
      scenarioId: scenario.id,
      channel: scenario.channel,
      status: 'failed',
      durationMs: execution.durationMs,
      judge: null,
      finalReply: '',
      failures: [execution.error],
      error: execution.error,
    });
    continue;
  }

  const payload = execution.payload || {};
  const failures = collectScenarioFailures(scenario, payload);

  results.push({
    scenarioId: scenario.id,
    channel: scenario.channel,
    status: failures.length === 0 ? 'passed' : 'failed',
    durationMs: execution.durationMs,
    judge: payload.judge || null,
    finalReply: String(payload.finalReply || ''),
    failures,
    error: '',
  });
}

const passed = results.filter((item) => item.status === 'passed').length;
const failed = results.length - passed;
const report = {
  generatedAt: new Date().toISOString(),
  evaluator: {
    mode: String(process.env.LLM_JUDGE_EVALUATOR_MODE || 'browser-backend-chat'),
    model: String(process.env.LLM_JUDGE_EVALUATOR_MODEL || process.env.GITHUB_MODELS_MODEL || '').trim() || '(not set)',
    id: String(process.env.LLM_JUDGE_EVALUATOR_ID || '').trim() || '(default)',
  },
  filters: {
    includeAuth,
    authOnly,
    scenarioId,
    scenarioFilter,
  },
  summary: {
    total: results.length,
    passed,
    failed,
  },
  results,
};

const markdown = buildMarkdownReport(report);

if (outputPath) {
  await ensureParentDir(outputPath);
  await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

if (markdownOutputPath) {
  await ensureParentDir(markdownOutputPath);
  await fs.writeFile(markdownOutputPath, markdown, 'utf8');
}

process.stdout.write(markdown);

if (failed > 0) {
  process.exitCode = 1;
}