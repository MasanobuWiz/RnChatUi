import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';
import { EnvHttpProxyAgent, setGlobalDispatcher } from 'undici';
import {
  AdminCreateUserCommand,
  AdminDeleteUserCommand,
  AdminSetUserPasswordCommand,
  CognitoIdentityProviderClient,
} from '@aws-sdk/client-cognito-identity-provider';

const hasProxyEnv = [
  process.env.HTTPS_PROXY,
  process.env.https_proxy,
  process.env.HTTP_PROXY,
  process.env.http_proxy,
].some((value) => String(value || '').trim().length > 0);

if (hasProxyEnv) {
  setGlobalDispatcher(new EnvHttpProxyAgent());
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);
const {
  buildJudgePrompt,
  extractJson,
  extractTextContent,
  finalizeJudgeResult,
  firstNonEmpty,
  joinUrl,
  normalizeEvaluatorMode,
  toPositiveInt,
} = require('./chat-judge-core.js');
const {
  buildGithubModelsHeaders,
  requestGithubModelsJson,
  resolveGithubModelsToken,
} = require('./github-models-utils.js');

async function readJsonFileIfPresent(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return {};
    }
    throw error;
  }
}

const amplifyConfig = await readJsonFileIfPresent(path.resolve(__dirname, '..', 'amplifyconfiguration.json'));
const scenarioPath = path.resolve(__dirname, 'chat-judge-scenarios.json');
const scenarios = JSON.parse(await fs.readFile(scenarioPath, 'utf8'));

const args = process.argv.slice(2);
const scenarioIndex = args.indexOf('--scenario');
const scenarioId = scenarioIndex >= 0 ? String(args[scenarioIndex + 1] || '').trim() : '';

const evaluatorMode = normalizeEvaluatorMode(process.env.LLM_JUDGE_EVALUATOR_MODE || 'browser-backend-chat');

const baseUrl =
  process.env.LLM_JUDGE_APP_URL ||
  process.env.CHAT_SMOKE_URL ||
  `${String(amplifyConfig?.aws_content_delivery_url || 'https://d20kh7meb2dq3y.cloudfront.net').replace(/\/$/, '')}/`;
const apiBaseUrl =
  process.env.LLM_JUDGE_API_BASE_URL ||
  amplifyConfig?.aws_cloud_logic_custom?.[0]?.endpoint ||
  'https://y2vzd7zfti.execute-api.us-east-1.amazonaws.com/dev';
const region = process.env.LLM_JUDGE_AWS_REGION || amplifyConfig?.aws_project_region || 'us-east-1';
const userPoolId = process.env.LLM_JUDGE_USER_POOL_ID || amplifyConfig?.aws_user_pools_id || '';
const authProvisioner = String(process.env.LLM_JUDGE_AUTH_PROVISIONER || 'aws-cli').toLowerCase();
const evaluatorConfig = {
  id: process.env.LLM_JUDGE_EVALUATOR_ID || `${evaluatorMode}-judge-v1`,
  mode: evaluatorMode,
  model: firstNonEmpty(process.env.LLM_JUDGE_EVALUATOR_MODEL),
  baseUrl: firstNonEmpty(process.env.LLM_JUDGE_EVALUATOR_BASE_URL),
  timeoutMs: toPositiveInt(process.env.LLM_JUDGE_EVALUATOR_TIMEOUT_MS, 90000),
  maxTokens: toPositiveInt(process.env.LLM_JUDGE_EVALUATOR_MAX_TOKENS, 1200),
  promptVersion: '2026-04-03',
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function makeEmail() {
  const stamp = new Date().toISOString().replace(/[\W_]+/g, '').slice(0, 14);
  const suffix = Math.random().toString(36).slice(2, 8);
  return `copilot.judge+${stamp}${suffix}@example.com`;
}

function makePassword() {
  return `Judge!${Math.random().toString(36).slice(2, 10)}Aa1`;
}

function runAwsCli(args) {
  const result = spawnSync('aws', args, {
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });

  if (result.status !== 0) {
    const stderr = String(result.stderr || '').trim();
    const stdout = String(result.stdout || '').trim();
    throw new Error(stderr || stdout || `AWS CLI command failed: aws ${args.join(' ')}`);
  }

  return String(result.stdout || '').trim();
}

async function postJson(url, { headers, body, timeoutMs }) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const rawText = await response.text().catch(() => '');
    if (!response.ok) {
      throw new Error(`Evaluator request failed: ${response.status} ${rawText}`.trim());
    }

    try {
      return rawText ? JSON.parse(rawText) : {};
    } catch {
      throw new Error(`Evaluator response was not valid JSON: ${rawText.slice(0, 400)}`);
    }
  } finally {
    clearTimeout(timeoutId);
  }
}

function resolveExternalEvaluator() {
  if (evaluatorConfig.mode === 'openai') {
    return {
      provider: 'openai',
      apiKey: firstNonEmpty(process.env.OPENAI_API_KEY, process.env.LLM_JUDGE_EVALUATOR_API_KEY),
      baseUrl: firstNonEmpty(process.env.OPENAI_BASE_URL, evaluatorConfig.baseUrl, 'https://api.openai.com/v1'),
      model: firstNonEmpty(process.env.OPENAI_MODEL, evaluatorConfig.model),
      endpointPath: '/chat/completions',
    };
  }

  if (evaluatorConfig.mode === 'xai') {
    return {
      provider: 'xai',
      apiKey: firstNonEmpty(process.env.XAI_API_KEY, process.env.LLM_JUDGE_EVALUATOR_API_KEY),
      baseUrl: firstNonEmpty(process.env.XAI_BASE_URL, evaluatorConfig.baseUrl, 'https://api.x.ai/v1'),
      model: firstNonEmpty(process.env.XAI_MODEL, evaluatorConfig.model),
      endpointPath: '/chat/completions',
    };
  }

  if (evaluatorConfig.mode === 'github-models') {
    const githubModelsOrg = firstNonEmpty(process.env.GITHUB_MODELS_ORG, process.env.GITHUB_MODELS_ORGANIZATION);
    const githubModelsBaseUrl = firstNonEmpty(
      process.env.GITHUB_MODELS_BASE_URL,
      process.env.GITHUB_MODELS_ENDPOINT,
      evaluatorConfig.baseUrl,
      'https://models.github.ai'
    );
    const githubModelsApiVersion = firstNonEmpty(process.env.GITHUB_MODELS_API_VERSION, '2026-03-10');
    const githubModelsToken = firstNonEmpty(
      process.env.GITHUB_TOKEN,
      process.env.GH_TOKEN,
      process.env.LLM_JUDGE_EVALUATOR_API_KEY,
      resolveGithubModelsToken()
    );

    return {
      provider: 'github-models',
      apiKey: githubModelsToken,
      baseUrl: githubModelsBaseUrl,
      model: firstNonEmpty(process.env.GITHUB_MODELS_MODEL, evaluatorConfig.model),
      endpointPath: githubModelsOrg
        ? `/orgs/${encodeURIComponent(githubModelsOrg)}/inference/chat/completions`
        : '/inference/chat/completions',
      headers: buildGithubModelsHeaders(githubModelsToken, githubModelsApiVersion),
    };
  }

  if (evaluatorConfig.mode === 'openai-compatible') {
    return {
      provider: 'openai-compatible',
      apiKey: firstNonEmpty(process.env.OPENAI_COMPAT_API_KEY, process.env.LLM_JUDGE_EVALUATOR_API_KEY),
      baseUrl: firstNonEmpty(process.env.OPENAI_COMPAT_BASE_URL, evaluatorConfig.baseUrl),
      model: firstNonEmpty(process.env.OPENAI_COMPAT_MODEL, evaluatorConfig.model),
      endpointPath: '/chat/completions',
    };
  }

  if (evaluatorConfig.mode === 'anthropic') {
    return {
      provider: 'anthropic',
      apiKey: firstNonEmpty(process.env.ANTHROPIC_API_KEY, process.env.LLM_JUDGE_EVALUATOR_API_KEY),
      baseUrl: firstNonEmpty(process.env.ANTHROPIC_BASE_URL, evaluatorConfig.baseUrl, 'https://api.anthropic.com/v1'),
      model: firstNonEmpty(process.env.ANTHROPIC_MODEL, evaluatorConfig.model),
      endpointPath: '/messages',
    };
  }

  throw new Error(`Unsupported judge evaluator mode: ${evaluatorConfig.mode}`);
}

function ensureExternalEvaluatorConfig(runtime) {
  if (!runtime.apiKey) {
    throw new Error(`Missing API key for evaluator mode "${evaluatorConfig.mode}".`);
  }
  if (!runtime.baseUrl) {
    throw new Error(`Missing base URL for evaluator mode "${evaluatorConfig.mode}".`);
  }
  if (!runtime.model) {
    if (evaluatorConfig.mode === 'github-models') {
      throw new Error(
        'Missing model for evaluator mode "github-models". Set LLM_JUDGE_EVALUATOR_MODEL or GITHUB_MODELS_MODEL to an exact catalog model ID such as openai/gpt-4.1. Run "npm run test:chat:judge:models" to list available model IDs.'
      );
    }

    throw new Error(`Missing model for evaluator mode "${evaluatorConfig.mode}". Set LLM_JUDGE_EVALUATOR_MODEL or the provider-specific model variable.`);
  }
}

async function judgeWithBrowserBackend(page, judgePrompt) {
  const raw = await page.evaluate(async ({ endpoint, prompt }) => {
    const response = await fetch(`${endpoint}/free`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        input: prompt,
        modelInput: prompt,
        searchMode: 'off',
        requestMode: 'normal',
      }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Judge browser fetch failed: ${response.status} ${text}`.trim());
    }

    const payload = await response.json();
    return String(payload?.reply || '').trim();
  }, { endpoint: apiBaseUrl, prompt: judgePrompt });

  return { raw, modelId: 'app-chat-judge' };
}

async function judgeWithOpenAiCompatible(judgePrompt, runtime) {
  ensureExternalEvaluatorConfig(runtime);

  if (runtime.provider === 'github-models') {
    const response = await requestGithubModelsJson({
      url: joinUrl(runtime.baseUrl, runtime.endpointPath),
      method: 'POST',
      headers: runtime.headers || {
        Authorization: `Bearer ${runtime.apiKey}`,
        'content-type': 'application/json',
      },
      body: {
        model: runtime.model,
        temperature: 0,
        max_tokens: evaluatorConfig.maxTokens,
        messages: [
          {
            role: 'system',
            content: 'You are a strict QA judge for a production chat application. Return valid JSON only.',
          },
          {
            role: 'user',
            content: judgePrompt,
          },
        ],
      },
    });

    const raw = extractTextContent(response?.choices?.[0]?.message?.content);
    if (!raw) {
      throw new Error(`Evaluator "${runtime.provider}" returned an empty completion.`);
    }

    return {
      raw,
      modelId: String(response?.model || runtime.model),
    };
  }

  const response = await postJson(joinUrl(runtime.baseUrl, runtime.endpointPath), {
    headers: runtime.headers || {
      Authorization: `Bearer ${runtime.apiKey}`,
      'content-type': 'application/json',
    },
    body: {
      model: runtime.model,
      temperature: 0,
      max_tokens: evaluatorConfig.maxTokens,
      messages: [
        {
          role: 'system',
          content: 'You are a strict QA judge for a production chat application. Return valid JSON only.',
        },
        {
          role: 'user',
          content: judgePrompt,
        },
      ],
    },
    timeoutMs: evaluatorConfig.timeoutMs,
  });

  const raw = extractTextContent(response?.choices?.[0]?.message?.content);
  if (!raw) {
    throw new Error(`Evaluator "${runtime.provider}" returned an empty completion.`);
  }

  return {
    raw,
    modelId: String(response?.model || runtime.model),
  };
}

async function judgeWithAnthropic(judgePrompt, runtime) {
  ensureExternalEvaluatorConfig(runtime);

  const response = await postJson(joinUrl(runtime.baseUrl, runtime.endpointPath), {
    headers: {
      'content-type': 'application/json',
      'x-api-key': runtime.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: {
      model: runtime.model,
      temperature: 0,
      max_tokens: evaluatorConfig.maxTokens,
      system: 'You are a strict QA judge for a production chat application. Return valid JSON only.',
      messages: [
        {
          role: 'user',
          content: judgePrompt,
        },
      ],
    },
    timeoutMs: evaluatorConfig.timeoutMs,
  });

  const raw = extractTextContent(response?.content);
  if (!raw) {
    throw new Error('Evaluator "anthropic" returned an empty completion.');
  }

  return {
    raw,
    modelId: String(response?.model || runtime.model),
  };
}

async function withRetry(task) {
  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      if (attempt < 2) {
        await sleep(700 * (attempt + 1));
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Live judge request failed');
}

async function createAuthUser(cognitoClient) {
  if (!userPoolId) {
    throw new Error('Judge auth scenario requires user pool id.');
  }

  const username = makeEmail();
  const password = makePassword();

  if (authProvisioner === 'aws-cli') {
    runAwsCli([
      'cognito-idp',
      'admin-create-user',
      '--user-pool-id', userPoolId,
      '--username', username,
      '--temporary-password', 'TempPass123!',
      '--message-action', 'SUPPRESS',
      '--user-attributes', `Name=email,Value=${username}`, 'Name=email_verified,Value=true',
      '--region', region,
      '--output', 'json',
    ]);

    runAwsCli([
      'cognito-idp',
      'admin-set-user-password',
      '--user-pool-id', userPoolId,
      '--username', username,
      '--password', password,
      '--permanent',
      '--region', region,
      '--output', 'json',
    ]);
  } else {
    await cognitoClient.send(
      new AdminCreateUserCommand({
        UserPoolId: userPoolId,
        Username: username,
        TemporaryPassword: 'TempPass123!',
        MessageAction: 'SUPPRESS',
        UserAttributes: [
          { Name: 'email', Value: username },
          { Name: 'email_verified', Value: 'true' },
        ],
      })
    );

    await cognitoClient.send(
      new AdminSetUserPasswordCommand({
        UserPoolId: userPoolId,
        Username: username,
        Password: password,
        Permanent: true,
      })
    );
  }

  return { username, password };
}

async function deleteUser(cognitoClient, username) {
  try {
    if (authProvisioner === 'aws-cli') {
      runAwsCli([
        'cognito-idp',
        'admin-delete-user',
        '--user-pool-id', userPoolId,
        '--username', username,
        '--region', region,
        '--output', 'json',
      ]);
    } else {
      await cognitoClient.send(
        new AdminDeleteUserCommand({
          UserPoolId: userPoolId,
          Username: username,
        })
      );
    }
  } catch {
      // Ignore cleanup failures for disposable users.
  }
}

async function waitForSignedIn(page, username) {
  await page.waitForFunction(
    (email) => {
      const text = document.body?.innerText || '';
      const hasSignedInShell = text.includes('チャット') && text.includes('履歴');
      const hasProfileHint = text.includes(email) || text.includes('サインアウト');
      return (hasSignedInShell || hasProfileHint) && !text.includes('Sign in to your account');
    },
    username,
    { timeout: 90000 }
  );
}

async function signInThroughUi(page, username, password) {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.getByText('FintechStory', { exact: true }).waitFor({ timeout: 90000 });
  await page.getByText('Sign in', { exact: true }).first().click();
  await page.getByText('Sign in to your account', { exact: true }).waitFor({ timeout: 30000 });
  await page.getByPlaceholder('Email address').fill(username);
  await page.getByPlaceholder('Password').fill(password);
  await page.getByText('Sign in', { exact: true }).last().click();
  await waitForSignedIn(page, username);
  await page.waitForFunction(
    () => typeof window.bedrockListConversations === 'function' && typeof window.bedrockGetMessages === 'function',
    { timeout: 30000 }
  );
}

async function sendAuthenticatedPrompt(page, prompt) {
  const input = page.locator('[placeholder="What would you like to ask?"], [placeholder="メッセージを入力..."]').first();
  await input.waitFor({ timeout: 30000 });
  await input.fill(prompt);
  await page.locator('[aria-label="送信"], [aria-label="Send"]').first().click();
}

async function waitForAuthenticatedMessages(page, expectedPrompt) {
  const deadline = Date.now() + 180000;

  while (Date.now() < deadline) {
    const snapshot = await page.evaluate(async () => {
      if (typeof window.bedrockListConversations !== 'function' || typeof window.bedrockGetMessages !== 'function') {
        return { conversationId: '', messages: [] };
      }

      const conversations = await window.bedrockListConversations(10).catch(() => []);
      const conversationId = Array.isArray(conversations) ? String(conversations[0]?.conversationId || '') : '';
      if (!conversationId) {
        return { conversationId: '', messages: [] };
      }

      const items = await window.bedrockGetMessages(conversationId, 20, 'asc').catch(() => []);
      const messages = Array.isArray(items)
        ? items
            .map((item) => ({
              role: String(item?.role || ''),
              content: String(item?.content || '').trim(),
            }))
            .filter((item) => item.content)
        : [];

      return { conversationId, messages };
    });

    const hasExpectedPrompt = snapshot.messages.some(
      (message) => message.role === 'user' && message.content.includes(expectedPrompt)
    );
    const assistantMessages = snapshot.messages.filter((message) => message.role === 'assistant');
    const finalReply = assistantMessages[assistantMessages.length - 1]?.content || '';

    if (hasExpectedPrompt && finalReply) {
      return {
        conversationId: snapshot.conversationId,
        finalReply,
        messages: snapshot.messages,
      };
    }

    await sleep(1000);
  }

  throw new Error('Timed out waiting for authenticated conversation messages.');
}

async function runGuestScenario(page, scenario) {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.getByText('FintechStory', { exact: true }).waitFor({ timeout: 90000 });

  return page.evaluate(async ({ promptTurns, searchMode, endpoint }) => {
    const history = [];

    for (const turn of promptTurns) {
      const now = String(turn || '').trim();
      const lines = history.map((message) => {
        const label = message.role === 'assistant' ? 'Assistant' : 'User';
        return `${label}: ${String(message.content || '').trim()}`;
      });
      lines.push(`User: ${now}`);
      lines.push('Assistant:');
      const merged = lines.join('\n');
      const modelInput = merged.length <= 7000 ? merged : merged.slice(-7000);

      const response = await fetch(`${endpoint}/free`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          input: now,
          modelInput,
          searchMode,
          requestMode: 'normal',
        }),
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`Guest browser fetch failed: ${response.status} ${text}`.trim());
      }

      const payload = await response.json();
      const reply = String(payload?.reply || '').trim();
      if (!reply) {
        throw new Error('Guest browser fetch returned an empty reply');
      }

      history.push({ role: 'user', content: now });
      history.push({ role: 'assistant', content: reply });
    }

    return {
      finalReply: history[history.length - 1]?.content || '',
      messages: history,
    };
  }, { promptTurns: scenario.turns, searchMode: scenario.searchMode, endpoint: apiBaseUrl });
}

async function runAuthScenario(page, scenario, authUser) {
  await signInThroughUi(page, authUser.username, authUser.password);

  if (scenario.turns.length !== 1) {
    throw new Error('Auth judge scenarios currently support a single prompt turn.');
  }

  const prompt = scenario.turns[0];
  await sendAuthenticatedPrompt(page, prompt);
  const result = await waitForAuthenticatedMessages(page, prompt);

  return {
    finalReply: result.finalReply,
    messages: result.messages,
  };
}

async function judgeScenario(page, scenario, messages) {
  const finalReply = messages[messages.length - 1]?.content || '';
  const judgePrompt = buildJudgePrompt(scenario, messages, evaluatorConfig);
  let raw = '';
  let modelId = '';

  if (evaluatorConfig.mode === 'browser-backend-chat') {
    ({ raw, modelId } = await judgeWithBrowserBackend(page, judgePrompt));
  } else if (
    evaluatorConfig.mode === 'openai' ||
    evaluatorConfig.mode === 'xai' ||
    evaluatorConfig.mode === 'github-models' ||
    evaluatorConfig.mode === 'openai-compatible'
  ) {
    ({ raw, modelId } = await judgeWithOpenAiCompatible(judgePrompt, resolveExternalEvaluator()));
  } else if (evaluatorConfig.mode === 'anthropic') {
    ({ raw, modelId } = await judgeWithAnthropic(judgePrompt, resolveExternalEvaluator()));
  } else {
    throw new Error(`Unsupported judge evaluator mode: ${evaluatorConfig.mode}`);
  }

  const parsed = extractJson(raw);
  const normalized = finalizeJudgeResult(parsed, scenario, finalReply);
  return {
    ...normalized,
    modelId: modelId || 'unknown',
    evaluator: evaluatorConfig,
  };
}

async function runScenario(scenario, cognitoClient) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1080 } });
  let authUser = null;

  try {
    const run = await withRetry(async () => {
      if (scenario.channel === 'auth') {
        authUser = await createAuthUser(cognitoClient);
        return runAuthScenario(page, scenario, authUser);
      }
      return runGuestScenario(page, scenario);
    });

    const judge = await judgeScenario(page, scenario, run.messages);

    return {
      scenarioId: scenario.id,
      channel: scenario.channel,
      finalReply: run.finalReply,
      messages: run.messages,
      judge,
    };
  } finally {
    await browser.close();
    if (authUser?.username) {
      await deleteUser(cognitoClient, authUser.username);
    }
  }
}

const selectedScenario = scenarioId ? scenarios.find((scenario) => scenario.id === scenarioId) : null;

if (scenarioId && !selectedScenario) {
  console.error(`Unknown judge scenario: ${scenarioId}`);
  process.exit(1);
}

const cognitoClient = new CognitoIdentityProviderClient({ region });

try {
  const result = await runScenario(selectedScenario || scenarios[0], cognitoClient);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  const message = error instanceof Error
    ? `${error.name}: ${error.message}${error.cause ? `\n${String(error.cause)}` : ''}`
    : String(error);
  console.error(message);
  process.exitCode = 1;
} finally {
  cognitoClient.destroy();
}