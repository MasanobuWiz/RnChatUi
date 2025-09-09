/**
 * @type {import('@types/aws-lambda').APIGatewayProxyHandler}
 */
const { BedrockRuntimeClient, InvokeModelCommand } = require("@aws-sdk/client-bedrock-runtime");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { DynamoDBClient, GetItemCommand } = require("@aws-sdk/client-dynamodb");
const { TextDecoder } = require("util");

// ===== 設定（環境変数で上書き可能）=====
const REGION = process.env.AWS_REGION || "us-east-1";
const MODEL_ID_FREE = process.env.MODEL_ID_FREE || "anthropic.claude-3-5-sonnet-20240620-v1:0";
const INFERENCE_PROFILE_ARN = process.env.INFERENCE_PROFILE_ARN || ""; // Plus用 inference profile ARN（任意）
const CHAT_BUCKET = process.env.CHAT_BUCKET || "myapp-ui-production";
const CHAT_PREFIX = process.env.CHAT_PREFIX || "chats/";
const SUBS_TABLE = process.env.SUBS_TABLE || ""; // 例 "Subscriptions"
const PAID_FOR_AUTH = (process.env.PAID_FOR_AUTH || "false").toLowerCase() === "true";
const FREE_MAX_TOKENS = parseInt(process.env.FREE_MAX_TOKENS || "1500", 10);
const PLUS_MAX_TOKENS = parseInt(process.env.PLUS_MAX_TOKENS || "4000", 10);

// 可視化フラグ
const DEBUG_MODE = (process.env.DEBUG_MODE || "true").toLowerCase() === "true";

// === 429/5xx 向けリトライ制御（free でも有効化）===
const FREE_MAX_RETRY = parseInt(process.env.FREE_MAX_RETRY || "2", 10);   // free プランの最大再試行回数
const PLUS_MAX_RETRY = parseInt(process.env.PLUS_MAX_RETRY || "1", 10);   // plus プラン
const BASE_BACKOFF_MS = parseInt(process.env.BASE_BACKOFF_MS || "300", 10); // バックオフ基準（指数＋ジッタ）

// ===== クライアント =====
const bedrock = new BedrockRuntimeClient({ region: REGION });
const s3 = new S3Client({ region: REGION });
const ddb = SUBS_TABLE ? new DynamoDBClient({ region: REGION }) : null;

// 共通ヘッダー
const JSON_HEADERS = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
  "Access-Control-Allow-Methods": "OPTIONS,POST,GET"
};

// ユーティリティ
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const classifyError = (err) => {
  const http = err?.$metadata?.httpStatusCode;
  const name = (err?.name || "").toLowerCase();
  const msg = (err?.message || "").toLowerCase();
  const isThrottle =
    http === 429 || name.includes("throttl") || msg.includes("rate") || msg.includes("too many");
  const isRetryable =
    isThrottle ||
    http >= 500 ||
    name.includes("timeout") ||
    name.includes("internalserver") ||
    name.includes("serviceunavailable") ||
    msg.includes("timeout") ||
    msg.includes("unexpected error");
  return { http, isThrottle, isRetryable };
};

exports.handler = async (event, context) => {
  const t0 = Date.now();
  console.log(`EVENT: ${JSON.stringify({ method: event?.httpMethod, path: event?.path, query: event?.queryStringParameters })}`);

  // CORS / プリフライト
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: JSON_HEADERS, body: "" };
  }

  // ルート判定（/free を強制 free プランに）
  const path = event?.path || "";
  const forceFreeByPath = path.startsWith("/free");

  // ヘルスチェック（/bedrock?ping=1 でも /free?ping=1 でもOK）
  if (event.httpMethod === "GET" && (event.queryStringParameters?.ping === "1" || event.queryStringParameters?.debug === "1")) {
    const body = {
      ok: true,
      region: REGION,
      stage: event.requestContext?.stage,
      paidForAuth: PAID_FOR_AUTH,
      hasProfile: !!INFERENCE_PROFILE_ARN,
      modelFree: MODEL_ID_FREE,
      routeDetected: forceFreeByPath ? "free" : "default"
    };
    return { statusCode: 200, headers: JSON_HEADERS, body: JSON.stringify(body) };
  }

  // 入力取り出し（安全パース）
  let input = "";
  try {
    if (event?.body) {
      const bodyObj = typeof event.body === "string" ? JSON.parse(event.body) : event.body;
      input = bodyObj?.input ?? "";
    } else if (event?.queryStringParameters?.input) {
      input = event.queryStringParameters.input;
    }
  } catch (e) {
    console.error("Invalid JSON body:", event.body, e);
    return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: "Invalid JSON in body" }) };
  }

  if (!input) {
    return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: "Input is required" }) };
  }

  // ===== プラン判定（plus / free） =====
  const authType = event?.requestContext?.identity?.cognitoAuthenticationType || "unauthenticated";
  const identityId = event?.requestContext?.identity?.cognitoIdentityId || null;
  let plan = "free";

  // /free の時は強制 free
  if (!forceFreeByPath) {
    // 1) DynamoDB で購読確認（任意）
    if (ddb && identityId) {
      try {
        const out = await ddb.send(
          new GetItemCommand({
            TableName: SUBS_TABLE,
            Key: { userId: { S: identityId } },
            ProjectionExpression: "plan"
          })
        );
        const planVal = out?.Item?.plan?.S;
        if (planVal === "plus") plan = "plus";
      } catch (e) {
        console.warn("DDB get plan failed (continue as free):", e?.message || e);
      }
    }
    // 2) 暫定：認証ユーザーは Plus とみなす
    if (plan !== "plus" && PAID_FOR_AUTH && authType === "authenticated") {
      plan = "plus";
    }
  }

  // Plus だが profile 未設定 → free へフォールバック
  let useOpus = plan === "plus" && !!INFERENCE_PROFILE_ARN;
  const maxTokens = plan === "plus" ? PLUS_MAX_TOKENS : FREE_MAX_TOKENS;
  if (plan === "plus" && !INFERENCE_PROFILE_ARN) {
    console.warn("Plus 判定だが INFERENCE_PROFILE_ARN 未設定のため free にフォールバック");
    useOpus = false;
    plan = "free-fallback";
  }
  if (forceFreeByPath) {
    plan = "free";
    useOpus = false;
  }

  const debugInfo = {
    requestId: context?.awsRequestId,
    planResolved: plan,
    authType,
    identityId: identityId || null,
    region: REGION,
    usedProfile: useOpus,
    profileArn: useOpus ? INFERENCE_PROFILE_ARN : null,
    modelFree: MODEL_ID_FREE,
    attempts: []
  };

  const buildPayload = (tokens) => ({
    anthropic_version: "bedrock-2023-05-31",
    max_tokens: tokens,
    messages: [{ role: "user", content: [{ type: "text", text: input }] }],
    temperature: 0.7,
    top_p: 0.9
  });

  const invokeOnce = async (useProfile, tokens) => {
    const payload = buildPayload(tokens);
    const params = {
      modelId: useProfile ? INFERENCE_PROFILE_ARN : MODEL_ID_FREE,
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify(payload)
    };
    const t1 = Date.now();
    const res = await bedrock.send(new InvokeModelCommand(params));
    const json = new TextDecoder("utf-8").decode(res.body);
    const data = JSON.parse(json);

    const reply =
      Array.isArray(data?.content) &&
      data.content[0]?.type === "text" &&
      typeof data.content[0]?.text === "string"
        ? data.content[0].text
        : JSON.stringify(data);

    return {
      reply,
      modelLabel: useProfile ? "claude-opus-4.1 (profile)" : MODEL_ID_FREE,
      usedModelId: params.modelId,
      httpStatus: res?.$metadata?.httpStatusCode || 200,
      latencyMs: Date.now() - t1
    };
  };

  // === 汎用リトライ（429/5xx） free/plus 共通 ===
  const maxRetry = useOpus ? PLUS_MAX_RETRY : FREE_MAX_RETRY;
  let lastErr = null;
  let usedModelId = null;
  let usedModelLabel = null;
  let lastStatus = null;
  let retryAfterSecToTell = null;

  for (let attempt = 0; attempt <= maxRetry; attempt++) {
    try {
      const out = await invokeOnce(useOpus, maxTokens);
      debugInfo.attempts.push({
        try: attempt + 1,
        useProfile: useOpus,
        modelId: out.usedModelId,
        httpStatus: out.httpStatus,
        latencyMs: out.latencyMs
      });
      usedModelId = out.usedModelId;
      usedModelLabel = out.modelLabel;

      // S3 保存（失敗しても続行）
      try {
        const key = `${CHAT_PREFIX}${useOpus ? "plus" : "free"}-${Date.now()}.json`;
        await s3.send(new PutObjectCommand({
          Bucket: CHAT_BUCKET,
          Key: key,
          Body: JSON.stringify({
            input,
            reply: out.reply,
            plan,
            model: out.usedModelId,
            timestamp: new Date().toISOString()
          }),
          ContentType: "application/json"
        }));
        console.log(`💾 S3 put success: s3://${CHAT_BUCKET}/${key}`);
      } catch (e) {
        console.warn("⚠️ S3 put failed (continue):", e?.message || e);
      }

      const totalMs = Date.now() - t0;
      const body = { reply: out.reply, plan, model: out.modelLabel };
      if (DEBUG_MODE) body.__debug = { ...debugInfo, totalLatencyMs: totalMs };
      return { statusCode: 200, headers: JSON_HEADERS, body: JSON.stringify(body) };
    } catch (err) {
      lastErr = err;
      const { http, isThrottle, isRetryable } = classifyError(err);
      lastStatus = http || 500;

      debugInfo.attempts.push({
        try: attempt + 1,
        useProfile: useOpus,
        error: { name: err?.name, message: err?.message, http }
      });

      console.error("Attempt failed:", {
        attempt: attempt + 1,
        isThrottle,
        isRetryable,
        http,
        name: err?.name,
        message: err?.message
      });

      if (attempt < maxRetry && isRetryable) {
        // バックオフ計算（指数＋ジッタ）
        const backoff = Math.round(BASE_BACKOFF_MS * Math.pow(2, attempt) + Math.random() * 200);
        retryAfterSecToTell = Math.ceil(backoff / 1000);
        await sleep(backoff);
        continue;
      }

      // もうリトライしない
      break;
    }
  }

  // ここに来たら最終失敗
  const totalMs = Date.now() - t0;
  console.error("❌ Bedrock Error (final):", {
    name: lastErr?.name,
    message: lastErr?.message,
    code: lastErr?.code,
    statusCode: lastStatus
  });

  const respHeaders = { ...JSON_HEADERS };
  if (lastStatus === 429 && retryAfterSecToTell) {
    respHeaders["Retry-After"] = String(retryAfterSecToTell);
  }

  const body = {
    error: "Bedrock invocation error",
    message: lastErr?.message || "Unknown error",
    planTried: plan,
    modelTried: usedModelId || (useOpus ? "opus (profile)" : MODEL_ID_FREE)
  };
  if (DEBUG_MODE) {
    body.__debug = {
      ...debugInfo,
      totalLatencyMs: totalMs,
      finalError: {
        name: lastErr?.name,
        message: lastErr?.message,
        statusCode: lastStatus
      }
    };
  }

  return {
    statusCode: lastStatus || 500,
    headers: respHeaders,
    body: JSON.stringify(body)
  };
};