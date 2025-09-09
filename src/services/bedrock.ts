import { Amplify } from 'aws-amplify';
import { get, post } from 'aws-amplify/api';
import { fetchAuthSession } from 'aws-amplify/auth';
import { getIdToken } from './auth'; // ★ 追加: IDトークン取得

const API_NAME = 'myBedrockApi';
const PATH = '/free';

type BedrockOk = { reply?: string; plan?: string; model?: string };
type BedrockErr = { error?: string; message?: string; planTried?: string; modelTried?: string };

// ====== 429 リトライ設定 ======
const MAX_RETRY = 3;
const BASE_BACKOFF_MS = 500;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function is429(err: any): { hit: boolean; retryAfterMs?: number } {
  const status =
    err?.response?.status ??
    err?.$metadata?.httpStatusCode ??
    (typeof err?.name === 'string' && err.name.includes('429') ? 429 : undefined);

  const msg = String(err?.message || '').toLowerCase();
  const hit = status === 429 || msg.includes('too many') || msg.includes('throttl') || msg.includes('rate');

  let retryAfterMs: number | undefined;
  try {
    const hdr =
      err?.response?.headers?.get?.('retry-after') ??
      err?.response?.headers?.['retry-after'];
    if (hdr) {
      const sec = parseInt(String(hdr), 10);
      if (!Number.isNaN(sec)) retryAfterMs = sec * 1000;
    }
  } catch {}
  return { hit, retryAfterMs };
}

/** v6 正式(RESTはオブジェクトマップ)を優先しつつ、旧 endpoints 配列も保険で読む */
function restAsMap(rest: any): Record<string, any> | undefined {
  if (!rest) return undefined;
  if (typeof rest === 'object' && !Array.isArray(rest)) return rest; // v6 map

  const endpoints = (rest as any)?.endpoints; // v5 互換
  if (Array.isArray(endpoints)) {
    const map: Record<string, any> = {};
    for (const e of endpoints) if (e?.name) map[e.name] = e;
    return map;
  }
  return undefined;
}

/** Amplify 設定チェック */
function ensureAmplifyConfigured() {
  const snap = (Amplify as any).getConfig?.();
  if (!snap) {
    throw new Error('Amplify is not configured yet. Call Amplify.configure(...) first.');
  }
  const restMap = restAsMap(snap.API?.REST);
  const target = restMap?.[API_NAME];
  if (!target?.endpoint) {
    console.warn('[bedrock] REST snapshot:', restMap);
    throw new Error(`Amplify REST に "${API_NAME}" が見つかりません。App.tsx の Amplify.configure を確認してください。`);
  }
}

/** ★ Authorization ヘッダー（Cognito ユーザープールの ID トークン） */
async function authHeader(): Promise<Record<string, string>> {
  const id = await getIdToken();
  // Cognito User Pools Authorizer は "Bearer " なしのIDトークンでOK（両対応したいなら `Bearer ${id}` でも可）
  return id ? { Authorization: id } : {};
}

/** /free?ping=1 疎通確認 */
export async function pingBedrock(): Promise<any> {
  ensureAmplifyConfigured();

  try {
    const s = await fetchAuthSession();
    console.debug('[bedrock] ping() identityId=', s.identityId);
  } catch {}

  const op = get({
    apiName: API_NAME,
    path: PATH,
    options: {
      headers: await authHeader(),              // ★ 追加
      queryParams: { ping: '1' },
    },
  });

  const { statusCode, body } = await op.response;
  const data = await body.json().catch(() => ({}));
  console.debug('[bedrock] ping status=', statusCode, 'body=', data);
  return data;
}

/** チャット送信: POST /free { input }（429は指数バックオフ） */
export async function sendMessageToBedrock(input: string): Promise<string> {
  ensureAmplifyConfigured();
  try {
    const s = await fetchAuthSession();
    console.debug('[bedrock] identityId=', s.identityId);
  } catch (e) {
    console.warn('[bedrock] fetchAuthSession warn:', (e as any)?.message || e);
  }

  let lastErr: any;
  for (let i = 0; i <= MAX_RETRY; i++) {
    try {
      const op = post({
        apiName: API_NAME,
        path: PATH,
        options: {
          headers: { ...(await authHeader()), 'Content-Type': 'application/json' }, // ★ 追加
          body: { input },
        },
      });

      const { statusCode, body } = await op.response;
      const data = (await body.json().catch(() => ({}))) as BedrockOk | BedrockErr;

      console.debug('[bedrock] POST /free status=', statusCode, 'body=', data);

      if ((data as BedrockOk)?.reply) return (data as BedrockOk).reply!;

      throw new Error(
        (data as BedrockErr)?.message ||
        (data as BedrockErr)?.error ||
        `Unexpected response: ${JSON.stringify(data).slice(0, 400)}`
      );
    } catch (err: any) {
      lastErr = err;
      const { hit, retryAfterMs } = is429(err);
      if (hit && i < MAX_RETRY) {
        const exp = BASE_BACKOFF_MS * Math.pow(2, i) + Math.floor(Math.random() * 200);
        const wait = Math.max(exp, retryAfterMs ?? 0);
        console.warn(`[bedrock] 429 detected. retry #${i + 1} after ${wait}ms`);
        await sleep(wait);
        continue;
      }

      const msg = err?.message || String(err);
      if (msg.includes('InvalidApiName')) {
        throw new Error(`API name is invalid. Amplify.configure の API.REST に "${API_NAME}" 定義が必要です。`);
      }
      if (msg.includes('Amplify has not been configured')) {
        throw new Error('Amplify.configure() がまだ実行されていません。初期化順序を確認してください。');
      }
      if (msg.includes('NetworkError') || msg.includes('Failed to fetch')) {
        throw new Error('ネットワーク/エンドポイント到達に失敗（API Gateway URL / CORS / ネットワークを確認）。');
      }
      if (msg.includes('No credentials')) {
        throw new Error('未認証（ゲスト）資格情報を取得できません。Auth/Identity Pool の設定を確認してください。');
      }
      throw err;
    }
  }
  throw lastErr ?? new Error('Too many requests');
}

/** 利用状況: GET /usage */
export async function getUsage(month?: string): Promise<any> {
  ensureAmplifyConfigured();
  const op = get({
    apiName: API_NAME,
    path: '/usage',
    options: {
      headers: await authHeader(),                     // ★ 追加
      queryParams: month ? { month } : undefined,
    },
  });
  const { statusCode, body } = await op.response;
  const data = await body.json().catch(() => ({}));
  console.debug('[bedrock] GET /usage status=', statusCode, 'body=', data);
  return data;
}

// ブラウザ手動テスト用
if (typeof window !== 'undefined') {
  // @ts-ignore
  window.bedrockPing = () => pingBedrock();
  // @ts-ignore
  window.bedrockTest = (text = 'hello from console') => sendMessageToBedrock(text);
}
