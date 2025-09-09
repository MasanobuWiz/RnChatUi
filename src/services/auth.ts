// src/services/auth.ts (hosted-ui direct redirect ver.)
import {
  signIn,
  signOut,
  signUp,
  confirmSignUp,
  fetchAuthSession,
  getCurrentUser,
  resendSignUpCode,
  resetPassword,
  confirmResetPassword,
  // signInWithRedirect,  // ← もう使わない
} from 'aws-amplify/auth';
import { Amplify } from 'aws-amplify';

/** 現在のオリジンにマッチする redirect_uri を選ぶ（なければ先頭） */
function pickRedirectUri(oauth: any): string | null {
  const raw = oauth?.redirectSignIn;
  const list: string[] = Array.isArray(raw)
    ? raw
    : typeof raw === 'string'
      ? raw.split(',').map((s) => s.trim()).filter(Boolean)
      : [];
  if (list.length === 0) return null;

  if (typeof window !== 'undefined') {
    const origin = window.location.origin + '/';
    const hit = list.find((u) => u.startsWith(origin));
    if (hit) return hit;
  }
  return list[0] || null;
}

/** Hosted UI 直URLを作る（identity_provider を付与可能） */
function buildHostedUiUrl(provider?: 'Google' | 'Amazon'): string | null {
  const snap = (Amplify as any).getConfig?.();
  const oauth = snap?.Auth?.Cognito?.loginWith?.oauth;
  const clientId = snap?.Auth?.Cognito?.userPoolClientId;
  const region = snap?.Auth?.Cognito?.region;

  if (!oauth?.domain || !clientId) return null;

  const domain = oauth.domain.replace(/^https?:\/\//, '').trim();
  const redirectUri = pickRedirectUri(oauth);
  if (!redirectUri) return null;

  const responseType = oauth.responseType || 'code';

  // scope はスペース区切りを URL エンコード（"+"は使わない）
  const scopesArr: string[] = Array.isArray(oauth.scopes)
    ? oauth.scopes
    : ['openid', 'email', 'profile'];
  const scopes = scopesArr.join(' ');

  const url = new URL(`https://${domain}/oauth2/authorize`);
  url.searchParams.set('response_type', responseType);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('scope', scopes);

  if (provider) {
    url.searchParams.set(
      'identity_provider',
      provider === 'Google' ? 'Google' : 'LoginWithAmazon'
    );
  }

  // デバッグに役立つ情報を出しておく（必要ならコメントアウト）
  console.info('[auth] buildHostedUiUrl', {
    region,
    domain,
    redirectUri,
    responseType,
    scopes,
    provider,
    url: url.toString(),
  });

  return url.toString();
}

// ---- ブラウザから手動で叩けるヘルパ（開発用） ----
if (typeof window !== 'undefined') {
  (window as any).authOpenHostedUI = (provider?: 'Google' | 'Amazon') => {
    const url = buildHostedUiUrl(provider);
    if (!url) {
      console.error('[authOpenHostedUI] oauth config not ready');
      return;
    }
    window.location.assign(url);
  };
}

// ====================== サインイン/サインアップ（ユーザー名/パスワード） ======================
export async function login(email: string, password: string) {
  try {
    return await signIn({ username: email, password });
  } catch (e: any) {
    console.error('[login] error', e);
    throw e;
  }
}

export async function register(email: string, password: string) {
  try {
    return await signUp({
      username: email,
      password,
      options: { userAttributes: { email } },
    });
  } catch (e: any) {
    console.error('[register] error', e);
    throw e;
  }
}

export async function confirm(email: string, code: string) {
  try {
    return await confirmSignUp({ username: email, confirmationCode: code });
  } catch (e: any) {
    console.error('[confirm] error', e);
    throw e;
  }
}

export async function resendCode(email: string) {
  try {
    return await resendSignUpCode({ username: email });
  } catch (e: any) {
    console.error('[resendCode] error', e);
    throw e;
  }
}

export async function logout() {
  try {
    await signOut();
  } catch (e: any) {
    console.error('[logout] error', e);
  }
}

// ====================== Hosted UI（ソーシャル） ======================
// 以降は “常に” 直URLで遷移させる。Cognitoの/ login は出さない。
export async function signInWithHostedUI() {
  const url = buildHostedUiUrl(); // プロバイダ未指定（Cognito画面を出したい場合だけ使う）
  if (!url) throw new Error('OAUTH_CONFIG_NOT_READY');
  window.location.assign(url);
}

export async function signInWithGoogle() {
  const url = buildHostedUiUrl('Google'); // 直で Google 認可画面へ
  if (!url) throw new Error('OAUTH_CONFIG_NOT_READY');
  window.location.assign(url);
}

export async function signInWithAmazon() {
  const url = buildHostedUiUrl('Amazon'); // 直で Amazon 認可画面へ
  if (!url) throw new Error('OAUTH_CONFIG_NOT_READY');
  window.location.assign(url);
}

export async function completeHostedUISignIn() {
  try {
    // code → tokens の交換
    await fetchAuthSession();

    // URL を綺麗にする（?code=... を除去）
    if (typeof window !== 'undefined') {
      const hasOAuthParams =
        window.location.search.includes('code=') ||
        window.location.search.includes('error=') ||
        window.location.search.includes('state=');
      if (hasOAuthParams) {
        const clean = window.location.origin + window.location.pathname;
        window.history.replaceState({}, document.title, clean);
        console.log('[completeHostedUISignIn] cleaned URL');
      }
    }
  } catch (e: any) {
    console.error('[completeHostedUISignIn] error', e);
    throw e;
  }
}

// ====================== セッション/トークン ======================
export async function getSession() {
  return fetchAuthSession();
}
export async function getIdToken(): Promise<string | null> {
  try {
    const s = await fetchAuthSession();
    return s.tokens?.idToken?.toString() ?? null;
  } catch (e) {
    console.error('ID Token取得エラー:', e);
    return null;
  }
}
export async function getAccessToken(): Promise<string | null> {
  try {
    const s = await fetchAuthSession();
    return s.tokens?.accessToken?.toString() ?? null;
  } catch {
    return null;
  }
}
export async function isAuthenticated(): Promise<boolean> {
  try {
    const s = await fetchAuthSession();
    return !!s.tokens?.idToken;
  } catch {
    return false;
  }
}
export async function getAuthHeader(): Promise<Record<string, string>> {
  const id = await getIdToken();
  return id ? { Authorization: `Bearer ${id}` } : {};
}
export async function requireAuth(): Promise<string> {
  const id = await getIdToken();
  if (!id) throw new Error('NOT_AUTHENTICATED');
  return id;
}

// ====================== ユーザー情報 ======================
export async function getUserSub(): Promise<string | null> {
  try {
    const u = await getCurrentUser();
    return u?.userId ?? null;
  } catch {
    return null;
  }
}
export async function getUserInfo(): Promise<{ sub?: string; email?: string } | null> {
  try {
    const s = await fetchAuthSession();
    const payload: any = s.tokens?.idToken?.payload || {};
    return { sub: payload?.sub, email: payload?.email };
  } catch {
    return null;
  }
}

// ====================== パスワードリセット ======================
export async function beginPasswordReset(email: string) {
  return resetPassword({ username: email });
}
export async function confirmPasswordReset(email: string, code: string, newPassword: string) {
  return confirmResetPassword({ username: email, confirmationCode: code, newPassword });
}
