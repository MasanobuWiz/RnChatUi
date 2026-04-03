const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EnvHttpProxyAgent, setGlobalDispatcher } = require('undici');

const hasProxyEnv = [
  process.env.HTTPS_PROXY,
  process.env.https_proxy,
  process.env.HTTP_PROXY,
  process.env.http_proxy,
].some((value) => String(value || '').trim().length > 0);

if (hasProxyEnv) {
  setGlobalDispatcher(new EnvHttpProxyAgent());
}

function firstNonEmpty(...values) {
  for (const value of values) {
    const text = String(value || '').trim();
    if (text) return text;
  }
  return '';
}

function tryReadGhAuthToken() {
  const result = spawnSync('gh', ['auth', 'token'], {
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });

  if (result.status !== 0) {
    return '';
  }

  return String(result.stdout || '').trim();
}

function resolveGithubModelsToken() {
  return firstNonEmpty(
    process.env.GITHUB_TOKEN,
    process.env.GH_TOKEN,
    process.env.LLM_JUDGE_EVALUATOR_API_KEY,
    tryReadGhAuthToken()
  );
}

function buildGithubModelsHeaders(apiKey, apiVersion) {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'X-GitHub-Api-Version': String(apiVersion || '2026-03-10'),
  };
}

function parseJsonOrThrow(rawText, contextLabel) {
  try {
    return rawText ? JSON.parse(rawText) : {};
  } catch {
    throw new Error(`${contextLabel} was not valid JSON: ${String(rawText || '').slice(0, 400)}`);
  }
}

function invokeGithubModelsWithPowerShell({ url, method, headers, body }) {
  let tempDirPath = '';
  let bodyFilePath = '';

  try {
    if (body !== undefined) {
      tempDirPath = fs.mkdtempSync(path.join(os.tmpdir(), 'gh-models-'));
      bodyFilePath = path.join(tempDirPath, 'request-body.json');
      fs.writeFileSync(bodyFilePath, JSON.stringify(body), 'utf8');
    }

    const script = [
      "$ErrorActionPreference = 'Stop'",
      "$url = $env:GITHUB_MODELS_REQUEST_URL",
      "$method = $env:GITHUB_MODELS_REQUEST_METHOD",
      "$headerJson = $env:GITHUB_MODELS_REQUEST_HEADERS",
      "$headerObject = $headerJson | ConvertFrom-Json",
      "$headers = @{}",
      "$headerObject.PSObject.Properties | ForEach-Object { $headers[$_.Name] = [string]$_.Value }",
      "$bodyPath = $env:GITHUB_MODELS_REQUEST_BODY_FILE",
      'try {',
      "  if ([string]::IsNullOrWhiteSpace($bodyPath)) {",
      '    $response = Invoke-RestMethod -Uri $url -Method $method -Headers $headers',
      '  } else {',
      '    $body = Get-Content -LiteralPath $bodyPath -Raw',
      '    $response = Invoke-RestMethod -Uri $url -Method $method -Headers $headers -Body $body',
      '  }',
      '  $response | ConvertTo-Json -Depth 100 -Compress',
      '} catch {',
      "  $detail = ''",
      '  if ($_.ErrorDetails -and $_.ErrorDetails.Message) { $detail = [string]$_.ErrorDetails.Message }',
      '  Write-Output "__GH_MODELS_ERROR__"',
      '  Write-Output ([string]$_.Exception.Message)',
      '  if (-not [string]::IsNullOrWhiteSpace($detail)) { Write-Output $detail }',
      '  exit 1',
      '}',
    ].join('; ');

    const result = spawnSync('powershell.exe', ['-NoProfile', '-Command', script], {
      encoding: 'utf8',
      env: {
        ...process.env,
        GITHUB_MODELS_REQUEST_URL: url,
        GITHUB_MODELS_REQUEST_METHOD: String(method || 'GET').toUpperCase(),
        GITHUB_MODELS_REQUEST_HEADERS: JSON.stringify(headers || {}),
        GITHUB_MODELS_REQUEST_BODY_FILE: bodyFilePath,
      },
    });

    const stdout = String(result.stdout || '').trim();
    const stderr = String(result.stderr || '').trim();

    if (result.status !== 0) {
      const errorLines = stdout.split(/\r?\n/).filter(Boolean);
      const markerIndex = errorLines.indexOf('__GH_MODELS_ERROR__');
      const fromMarker = markerIndex >= 0 ? errorLines.slice(markerIndex + 1).join('\n').trim() : '';
      throw new Error(fromMarker || stderr || stdout || 'GitHub Models PowerShell request failed');
    }

    return parseJsonOrThrow(stdout, 'GitHub Models PowerShell response');
  } finally {
    if (bodyFilePath && fs.existsSync(bodyFilePath)) {
      fs.unlinkSync(bodyFilePath);
    }
    if (tempDirPath && fs.existsSync(tempDirPath)) {
      fs.rmdirSync(tempDirPath);
    }
  }
}

async function requestGithubModelsJson({ url, method = 'GET', headers, body } = {}) {
  if (process.platform === 'win32') {
    return invokeGithubModelsWithPowerShell({ url, method, headers, body });
  }

  const response = await fetch(url, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  const rawText = await response.text().catch(() => '');
  if (!response.ok) {
    throw new Error(`GitHub Models request failed: ${response.status} ${rawText}`.trim());
  }

  return parseJsonOrThrow(rawText, 'GitHub Models response');
}

function normalizeGithubModelsCatalog(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

async function fetchGithubModelsCatalog({ apiKey, apiVersion, baseUrl } = {}) {
  const token = firstNonEmpty(apiKey, resolveGithubModelsToken());
  if (!token) {
    throw new Error('Missing GitHub Models token. Set GITHUB_TOKEN or GH_TOKEN, or authenticate with gh auth login.');
  }

  const rootUrl = String(baseUrl || 'https://models.github.ai').replace(/\/+$/, '');
  const parsed = await requestGithubModelsJson({
    url: `${rootUrl}/catalog/models`,
    method: 'GET',
    headers: buildGithubModelsHeaders(token, apiVersion),
  });

  return normalizeGithubModelsCatalog(parsed);
}

module.exports = {
  buildGithubModelsHeaders,
  fetchGithubModelsCatalog,
  requestGithubModelsJson,
  normalizeGithubModelsCatalog,
  resolveGithubModelsToken,
};