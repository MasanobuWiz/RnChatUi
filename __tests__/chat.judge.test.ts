/**
 * @jest-environment node
 */

import path from 'path';
import { spawnSync } from 'child_process';

const judgeCriteria = [
  'instructionFollowing',
  'contextRetention',
  'usefulness',
  'conciseness',
  'languageQuality',
  'safety',
] as const;
const judgeScenarios = require('../scripts/chat-judge-scenarios.json') as Array<{
  id: string;
  channel: 'guest' | 'auth';
  expectedLanguage: 'ja' | 'en';
  minOverallScore: number;
  minCriterionScore: number;
  strictKeywords?: string[];
  bannedPhrases?: string[];
}>;

const judgeEnabled = String(process.env.LLM_JUDGE_ENABLED || 'false').toLowerCase() === 'true';
const includeAuth = String(process.env.LLM_JUDGE_INCLUDE_AUTH || 'false').toLowerCase() === 'true';
const scenarioFilter = String(process.env.LLM_JUDGE_SCENARIO_FILTER || '').trim();
const baseScenarios = includeAuth
  ? judgeScenarios
  : judgeScenarios.filter((scenario) => scenario.channel !== 'auth');
const activeScenarios = scenarioFilter
  ? baseScenarios.filter((scenario) => scenario.id.includes(scenarioFilter))
  : baseScenarios;

const describeJudge = judgeEnabled ? describe : describe.skip;

function runJudgeScenario(scenarioId: string) {
  const scriptPath = path.resolve(__dirname, '..', 'scripts', 'chat-judge-eval.mjs');
  const result = spawnSync(process.execPath, [scriptPath, '--scenario', scenarioId], {
    env: process.env,
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    const stderr = String(result.stderr || '').trim();
    const stdout = String(result.stdout || '').trim();
    throw new Error(stderr || stdout || `Judge runner failed for ${scenarioId}`);
  }

  return JSON.parse(String(result.stdout || '{}')) as {
    scenarioId: string;
    finalReply: string;
    judge: {
      pass: boolean;
      modelPass: boolean;
      overallScore: number;
      modelOverallScore: number;
      criteria: Record<(typeof judgeCriteria)[number], number>;
      summary: string;
      issues: string[];
      hardChecks: {
        passed: boolean;
        failures: Array<{ code: string; message: string }>;
      };
      modelId: string;
    };
  };
}

function applyHardAssertions(scenario: (typeof judgeScenarios)[number], finalReply: string) {
  expect(finalReply.trim().length).toBeGreaterThan(12);
  const normalizedReply = finalReply.toLocaleLowerCase();

  for (const phrase of scenario.bannedPhrases || []) {
    expect(finalReply).not.toContain(phrase);
  }

  for (const keyword of scenario.strictKeywords || []) {
    expect(normalizedReply).toContain(String(keyword).toLocaleLowerCase());
  }

  if (scenario.expectedLanguage === 'ja') {
    expect(/[\u3040-\u30ff\u3400-\u9fff]/.test(finalReply)).toBe(true);
  }

  if (scenario.expectedLanguage === 'en') {
    expect(/[A-Za-z]/.test(finalReply)).toBe(true);
  }
}

describeJudge('chat llm judge automation', () => {
  jest.setTimeout(420000);

  it('has at least one active judge scenario', () => {
    expect(activeScenarios.length).toBeGreaterThan(0);
  });

  for (const scenario of activeScenarios) {
    it(`scores ${scenario.id}`, () => {
      const run = runJudgeScenario(scenario.id);
      applyHardAssertions(scenario, run.finalReply);

      const result = run.judge;

      if (!result.hardChecks?.passed) {
        throw new Error(
          `LLM judge hard checks failed for ${scenario.id}\nmodel=${result.modelId}\nhardFailures=${result.hardChecks.failures.map((failure) => `${failure.code}:${failure.message}`).join(' | ')}\nsummary=${result.summary}\nfinalReply=${run.finalReply}`
        );
      }

      if (result.overallScore < scenario.minOverallScore) {
        throw new Error(
          `LLM judge failed for ${scenario.id}\nmodel=${result.modelId}\noverallScore=${result.overallScore}\nsummary=${result.summary}\nissues=${result.issues.join(' | ')}\nfinalReply=${run.finalReply}`
        );
      }

      for (const criterion of judgeCriteria) {
        if ((result.criteria[criterion] || 0) < scenario.minCriterionScore) {
          throw new Error(
            `LLM judge failed for ${scenario.id}\nmodel=${result.modelId}\ncriterion=${criterion}\nvalue=${result.criteria[criterion]}\nsummary=${result.summary}\nissues=${result.issues.join(' | ')}\nfinalReply=${run.finalReply}`
          );
        }
      }

      if (!result.pass) {
        throw new Error(
          `LLM judge failed for ${scenario.id}\nmodel=${result.modelId}\noverallScore=${result.overallScore}\nsummary=${result.summary}\nissues=${result.issues.join(' | ')}\nfinalReply=${run.finalReply}`
        );
      }
    });
  }
});