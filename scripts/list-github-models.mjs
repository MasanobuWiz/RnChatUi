import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { fetchGithubModelsCatalog } = require('./github-models-utils.js');

function readArgValue(args, name, fallback = '') {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  return String(args[index + 1] || '').trim();
}

function readArgValues(args, name) {
  const values = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === name) {
      const value = String(args[index + 1] || '').trim();
      if (value) values.push(value);
    }
  }
  return values;
}

function toPositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value || ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function formatRow(model) {
  const id = String(model?.id || '').padEnd(34, ' ');
  const publisher = String(model?.publisher || '').padEnd(10, ' ');
  const version = String(model?.version || '').padEnd(12, ' ');
  return `${id}  ${publisher}  ${version}  ${String(model?.name || '')}`;
}

const args = process.argv.slice(2);
const publishers = readArgValues(args, '--publisher').map((value) => value.toLowerCase());
const matchPattern = readArgValue(args, '--match');
const jsonOutput = args.includes('--json');
const idsOnly = args.includes('--ids-only');
const limit = toPositiveInt(readArgValue(args, '--limit', '200'), 200);

let matchRegex = null;
if (matchPattern) {
  try {
    matchRegex = new RegExp(matchPattern, 'i');
  } catch (error) {
    console.error(`Invalid --match regex: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

try {
  const models = await fetchGithubModelsCatalog({
    apiVersion: process.env.GITHUB_MODELS_API_VERSION || '2026-03-10',
    baseUrl: process.env.GITHUB_MODELS_BASE_URL || 'https://models.github.ai',
  });

  const filtered = models
    .filter((model) => {
      const publisher = String(model?.publisher || '').toLowerCase();
      const id = String(model?.id || '');
      const name = String(model?.name || '');

      if (publishers.length > 0 && !publishers.includes(publisher)) {
        return false;
      }

      if (matchRegex && !matchRegex.test(`${id}\n${name}\n${publisher}`)) {
        return false;
      }

      return true;
    })
    .sort((left, right) => String(left?.id || '').localeCompare(String(right?.id || '')))
    .slice(0, limit);

  if (jsonOutput) {
    process.stdout.write(`${JSON.stringify(filtered, null, 2)}\n`);
    process.exit(0);
  }

  if (idsOnly) {
    process.stdout.write(`${filtered.map((model) => String(model?.id || '')).join('\n')}\n`);
    process.exit(0);
  }

  process.stdout.write(`${filtered.map(formatRow).join('\n')}\n`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
}