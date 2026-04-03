import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const jestBin = require.resolve('jest/bin/jest');
const args = [
  jestBin,
  '--runInBand',
  '--watch=false',
  '__tests__/chat.judge.unit.test.ts',
  '__tests__/chat.judge.test.ts',
];
const includeAuth = process.argv.includes('--include-auth');
const authOnly = process.argv.includes('--auth-only');
const scenarioFilterIndex = process.argv.indexOf('--scenario-filter');
const scenarioFilter = scenarioFilterIndex >= 0 ? String(process.argv[scenarioFilterIndex + 1] || '').trim() : '';

const env = {
  ...process.env,
  LLM_JUDGE_ENABLED: process.env.LLM_JUDGE_ENABLED || 'true',
  LLM_JUDGE_INCLUDE_AUTH: includeAuth ? 'true' : 'false',
  LLM_JUDGE_SCENARIO_FILTER: authOnly ? 'auth-' : scenarioFilter,
};

const result = spawnSync(process.execPath, args, {
  stdio: 'inherit',
  env,
});

if (typeof result.status === 'number') {
  process.exit(result.status);
}

process.exit(1);