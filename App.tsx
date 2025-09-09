// App.tsx
import React, { useEffect, useState } from 'react';
import { Navigation } from './src/navigation';
import { Amplify } from 'aws-amplify';
import { completeHostedUISignIn } from './src/services/auth';
import { pingBedrock, sendMessageToBedrock } from './src/services/bedrock';

declare global {
  interface Window {
    checkAmplifyStatus?: () => boolean;
    getAmplifyConfig?: () => any;
    bedrockPing?: () => Promise<any>;
    bedrockTest?: (text?: string) => Promise<any>;
    diagDump?: () => { logs: any[] };
    clearDiag?: () => void;
    __appLog?: (level: 'DEBUG'|'INFO'|'WARN'|'ERROR', tag: string, msg: string, meta?: any) => void;
  }
}

/* -------------------- 超軽量ロガー -------------------- */
type Level = 'DEBUG'|'INFO'|'WARN'|'ERROR';
const __logs: Array<{ ts: string; level: Level; tag: string; msg: string; meta?: any }> = [];
function __appLog(level: Level, tag: string, msg: string, meta?: any) {
  const item = { ts: new Date().toISOString(), level, tag, msg, meta };
  __logs.push(item);
  if (__logs.length > 300) __logs.shift();
  const line = `[${item.ts}] [${tag}] ${msg}`;
  if (level === 'ERROR') console.error(line, meta);
  else if (level === 'WARN') console.warn(line, meta);
  else if (level === 'DEBUG') console.debug(line, meta);
  else console.info(line, meta);
}
if (typeof window !== 'undefined') {
  window.__appLog = __appLog;
  window.diagDump = () => ({ logs: [...__logs] });
  window.clearDiag = () => { __logs.length = 0; };
  window.onerror = (m, src, line, col, err) =>
    __appLog('ERROR', 'FRONT.UNCAUGHT', String(m), { src, line, col, stack: (err as any)?.stack });
  window.onunhandledrejection = (e: any) =>
    __appLog('ERROR', 'FRONT.PROMISE', 'unhandledrejection', { reason: String(e?.reason ?? e) });
}

/* -------------------- util: 配列 → v6 REST マップ -------------------- */
function toRestMap(input: any): Record<string, any> {
  const map: Record<string, any> = {};
  if (Array.isArray(input)) {
    input.forEach((e: any) => {
      if (e?.name && e?.endpoint) {
        map[e.name] = {
          endpoint: e.endpoint,
          region: e.region,
          ...(e.custom_header ? { custom_header: e.custom_header } : {}),
        };
      }
    });
  }
  return map;
}

/* -------------------- 設定読み込み -------------------- */
async function loadRawConfig(): Promise<any | null> {
  let v6: any = null;
  let v5: any = null;

  // 0) 新形式 amplify_outputs.json
  try {
    __appLog('DEBUG', 'BOOT.CONFIG', 'fetch /amplify_outputs.json start');
    const res = await fetch('/amplify_outputs.json', { cache: 'no-store' });
    if (res.ok) {
      const j = await res.json();
      __appLog('INFO', 'BOOT.CONFIG', 'loaded amplify_outputs.json', { keys: Object.keys(j || {}) });
      // Gen2 形式はプロジェクト依存、ここでは保持だけしておく
      v6 = j;
    }
  } catch {}

  // 1) v6: amplifyconfiguration.json
  try {
    __appLog('DEBUG', 'BOOT.CONFIG', 'fetch /amplifyconfiguration.json start');
    const res = await fetch('/amplifyconfiguration.json', { cache: 'no-store' });
    if (res.ok) {
      const j = await res.json();
      __appLog('INFO', 'BOOT.CONFIG', 'loaded amplifyconfiguration.json', { keys: Object.keys(j || {}) });
      v6 = j;
    } else {
      __appLog('WARN', 'BOOT.CONFIG', 'amplifyconfiguration.json not ok', { status: res.status });
    }
  } catch (e: any) {
    __appLog('WARN', 'BOOT.CONFIG', 'fetch amplifyconfiguration.json failed', { err: e?.message });
  }

  // 2) v5: aws-exports.js（存在すれば OAuth 情報を補完に使用）
  try {
    __appLog('DEBUG', 'BOOT.CONFIG', 'import ./src/aws-exports.js start');
    const mod: any = await import('./src/aws-exports.js');
    v5 = mod.default ?? mod;
    __appLog('INFO', 'BOOT.CONFIG', 'loaded aws-exports.js', { keys: Object.keys(v5 || {}) });
  } catch (e: any) {
    __appLog('WARN', 'BOOT.CONFIG', 'import aws-exports.js failed (optional)', { err: e?.message });
  }

  if (!v6 && !v5) {
    __appLog('ERROR', 'BOOT.CONFIG', 'no config source found');
    return null;
  }

  // 基本は v6 をベースに
  const base: any = v6 ? { ...v6 } : { ...v5 };

  // v6 が OAuth 欠落なら v5 から“安全に”補完（プール/クライアントIDが一致する場合だけ）
  const v6Pool = {
    poolId: base.aws_user_pools_id,
    clientId: base.aws_user_pools_web_client_id || base.aws_user_pools_client_id,
  };
  const v5Pool = {
    poolId: v5?.aws_user_pools_id,
    clientId: v5?.aws_user_pools_web_client_id || v5?.aws_user_pools_client_id,
  };

  const v6HasOauth = !!base.oauth?.domain;
  const canMergeOauth =
    !v6HasOauth &&
    v5?.oauth?.domain &&
    v6Pool.poolId &&
    v5Pool.poolId &&
    v6Pool.clientId &&
    v5Pool.clientId &&
    (v6Pool.poolId === v5Pool.poolId) &&
    (v6Pool.clientId === v5Pool.clientId);

  if (!v6HasOauth && v5?.oauth && canMergeOauth) {
    base.oauth = { ...v5.oauth };
    __appLog('INFO', 'BOOT.CONFIG', 'merged OAuth from aws-exports.js', {
      userPoolId: v6Pool.poolId,
      clientId: v6Pool.clientId,
      domain: v5.oauth.domain,
    });
  } else if (!v6HasOauth && v5?.oauth && !canMergeOauth) {
    __appLog('WARN', 'BOOT.CONFIG',
      'v6 oauth missing but v5 oauth exists; pool/client mismatch -> NOT merging', {
        v6Pool, v5Pool, v5Domain: v5.oauth?.domain,
      });
  }

  return base;
}

/* -------------------- v6 形式へ正規化 -------------------- */
function normalizeToV6(raw: any) {
  const cfg: any = raw ?? {};
  cfg.API = cfg.API ?? {};

  if (cfg.API.REST && typeof cfg.API.REST === 'object' && !Array.isArray(cfg.API.REST)) {
    __appLog('DEBUG', 'BOOT.CONFIG', 'API already v6 map');
    return cfg;
  }
  if (Array.isArray(cfg.aws_cloud_logic_custom)) {
    cfg.API.REST = { ...(cfg.API.REST || {}), ...toRestMap(cfg.aws_cloud_logic_custom) };
    __appLog('DEBUG', 'BOOT.CONFIG', 'mapped aws_cloud_logic_custom -> API.REST');
    return cfg;
  }
  if (Array.isArray(cfg.API?.endpoints)) {
    cfg.API.REST = { ...(cfg.API.REST || {}), ...toRestMap(cfg.API.endpoints) };
    delete cfg.API.endpoints;
    __appLog('DEBUG', 'BOOT.CONFIG', 'mapped API.endpoints -> API.REST');
    return cfg;
  }
  __appLog('DEBUG', 'BOOT.CONFIG', 'no API mapping needed');
  return cfg;
}

/* -------------------- REST エンドポイントを必ず用意 -------------------- */
const FALLBACK = {
  name: 'myBedrockApi',
  endpoint: 'https://y2vzd7zfti.execute-api.us-east-1.amazonaws.com/dev',
  region: 'us-east-1',
};
function ensureMyApi(cfg: any) {
  cfg.API = cfg.API || {};
  cfg.API.REST = cfg.API.REST || {};
  if (!cfg.API.REST[FALLBACK.name]) {
    cfg.API.REST[FALLBACK.name] = { endpoint: FALLBACK.endpoint, region: FALLBACK.region };
    __appLog('WARN', 'BOOT.CONFIG', 'injected fallback REST endpoint for myBedrockApi', { endpoint: FALLBACK.endpoint });
  }
  return cfg;
}

/* -------------------- Auth（Cognito + OAuth）を v6 形式に整備 -------------------- */
function ensureAuth(cfg: any) {
  cfg.Auth = cfg.Auth || {};
  cfg.Auth.Cognito = cfg.Auth.Cognito || {};

  cfg.Auth.Cognito.userPoolId =
    cfg.Auth.Cognito.userPoolId || cfg.aws_user_pools_id;
  cfg.Auth.Cognito.userPoolClientId =
    cfg.Auth.Cognito.userPoolClientId || cfg.aws_user_pools_web_client_id || cfg.aws_user_pools_client_id;
  cfg.Auth.Cognito.identityPoolId =
    cfg.Auth.Cognito.identityPoolId || cfg.aws_cognito_identity_pool_id;
  cfg.Auth.Cognito.region =
    cfg.Auth.Cognito.region || cfg.aws_cognito_region || cfg.aws_project_region;

  const v5oauth = cfg.oauth || {};
  const v6oauth = (cfg.Auth.Cognito.loginWith && cfg.Auth.Cognito.loginWith.oauth) || {};

  const domain = (() => {
    const d = (v6oauth.domain ?? v5oauth.domain ?? '').trim();
    return d || undefined;
  })();
  const responseType = v6oauth.responseType || v5oauth.responseType || 'code';
  const scopes = v6oauth.scopes || v5oauth.scopes || v5oauth.scope || ['openid', 'email', 'profile'];

  const toArrAny = (v: any) => {
    if (Array.isArray(v)) return v.slice();
    if (typeof v === 'string') {
      return v.split(',').map((s) => s.trim()).filter(Boolean);
    }
    return [];
  };
  const rsIn = toArrAny(v6oauth.redirectSignIn || v5oauth.redirectSignIn);
  const rsOut = toArrAny(v6oauth.redirectSignOut || v5oauth.redirectSignOut);

  if (typeof window !== 'undefined') {
    const origin = window.location.origin + '/';
    if (!rsIn.includes(origin)) rsIn.push(origin);
    if (!rsOut.includes(origin)) rsOut.push(origin);
  }

  cfg.Auth.Cognito.loginWith = {
    ...(cfg.Auth.Cognito.loginWith || {}),
    oauth: { domain, redirectSignIn: rsIn, redirectSignOut: rsOut, responseType, scopes },
  };

  const missing: string[] = [];
  if (!cfg.Auth.Cognito.userPoolId)       missing.push('userPoolId');
  if (!cfg.Auth.Cognito.userPoolClientId) missing.push('userPoolClientId');
  if (!domain)                             missing.push('oauth.domain');

  if (missing.length) {
    __appLog('ERROR', 'Amplify/Auth', 'Missing keys', {
      missing,
      oauth: { domain, redirectSignIn: rsIn, redirectSignOut: rsOut, responseType, scopes },
      region: cfg.Auth.Cognito.region,
    });
  } else {
    __appLog('INFO', 'Amplify/Auth', 'Auth config ok', {
      userPoolId: cfg.Auth.Cognito.userPoolId,
      clientId: cfg.Auth.Cognito.userPoolClientId,
      domain,
      region: cfg.Auth.Cognito.region,
    });
  }
  return cfg;
}

/* -------------------- Amplify 初期化（単発） -------------------- */
let initPromise: Promise<void> | null = null;
async function configureAmplifyOnce() {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    try {
      const t0 = performance.now();
      const raw = await loadRawConfig();
      if (!raw) {
        __appLog('ERROR', 'BOOT', 'No config. Amplify.configure will be skipped');
        return;
      }
      let cfg = normalizeToV6(raw);
      cfg = ensureMyApi(cfg);
      cfg = ensureAuth(cfg);
      Amplify.configure(cfg);

      try {
        const snap = (Amplify as any).getConfig?.();
        __appLog('INFO', 'BOOT', 'Amplify configured', {
          api: !!snap?.API?.REST?.myBedrockApi,
          userPoolId: snap?.Auth?.Cognito?.userPoolId,
          clientId: snap?.Auth?.Cognito?.userPoolClientId,
          domain: snap?.Auth?.Cognito?.loginWith?.oauth?.domain,
        });
      } catch {}
      __appLog('DEBUG', 'BOOT', 'configureAmplifyOnce duration(ms)', { ms: Math.round(performance.now() - t0) });
    } catch (e: any) {
      __appLog('ERROR', 'BOOT', 'configureAmplifyOnce failed', { err: e?.message || String(e) });
    }
  })();
  return initPromise;
}

/* -------------------- React エントリ -------------------- */
export default function App() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      await configureAmplifyOnce();

      // Hosted UI リダイレクト直後の code→token 交換＆URLクリーン
      try {
        await completeHostedUISignIn();
        __appLog('INFO', 'FRONT.AUTH', 'completeHostedUISignIn ok');
      } catch (e: any) {
        __appLog('ERROR', 'FRONT.AUTH', 'completeHostedUISignIn failed', { err: e?.message || String(e) });
      }

      if (typeof window !== 'undefined') {
        window.checkAmplifyStatus = () => {
          const snap = (Amplify as any).getConfig?.();
          const ok = !!snap?.API?.REST?.myBedrockApi?.endpoint;
          __appLog('INFO', 'FRONT.BOOT', 'Amplify configured?', { apiPresent: ok });
          return ok;
        };
        window.getAmplifyConfig = () => (Amplify as any).getConfig?.();
        window.bedrockPing = () => pingBedrock();
        window.bedrockTest = (text?: string) => sendMessageToBedrock(text ?? 'hello');
      }

      if (process.env.NODE_ENV === 'development') {
        __appLog('INFO', 'FRONT.DEV', 'RnChatUi Development Mode', {
          tips: [
            'window.checkAmplifyStatus()',
            'window.getAmplifyConfig?.()',
            'window.diagDump?.()',
            'window.bedrockPing?.()',
            'window.bedrockTest?.("hello")',
          ],
        });
      }

      setReady(true);
    })();
  }, []);

  if (!ready) {
    return (
      <div
        style={{
          padding: 16,
          fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial',
        }}
      >
        Initializing…
      </div>
    );
  }

  return <Navigation />;
}
