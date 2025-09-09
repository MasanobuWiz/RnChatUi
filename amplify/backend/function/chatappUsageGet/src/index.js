/* Amplify Params - DO NOT EDIT
	ENV
	REGION
Amplify Params - DO NOT EDIT *//* Amplify Params - DO NOT EDIT
  ENV
  REGION
  TABLE_NAME
  ALLOW_ORIGIN
  TZ_REGION
  FREE_LIMIT
  FREE_FAST_LIMIT
Amplify Params - DO NOT EDIT */

const { DynamoDBClient, GetItemCommand } = require("@aws-sdk/client-dynamodb");
const ddb = new DynamoDBClient({});

const getClaims = (event) =>
  (event?.requestContext?.authorizer &&
    (event.requestContext.authorizer.jwt?.claims || event.requestContext.authorizer.claims)) || {};

const monthKey = (tz) => {
  const d = new Date();
  const parts = new Intl.DateTimeFormat("ja-JP", { timeZone: tz, year: "numeric", month: "2-digit" }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  return `${y}-${m}`;
};

const toNum = (av) => (av?.N ? Number(av.N) : 0);

exports.handler = async (event) => {
  const allow = process.env.ALLOW_ORIGIN || "*";
  try {
    const claims = getClaims(event);
    const sub = claims?.sub;
    const tier = claims?.["custom:tier"] || "free";
    if (!sub) {
      return {
        statusCode: 401,
        headers: { "Access-Control-Allow-Origin": allow, "Access-Control-Allow-Credentials": "true" },
        body: JSON.stringify({ message: "Unauthorized" }),
      };
    }

    const month = event?.queryStringParameters?.month?.match(/^\d{4}-\d{2}$/)
      ? event.queryStringParameters.month
      : monthKey(process.env.TZ_REGION || "UTC");

    const out = await ddb.send(new GetItemCommand({
      TableName: process.env.TABLE_NAME,
      Key: { pk: { S: `USER#${sub}` }, sk: { S: `USAGE#${month}` } },
    }));

    const it = out.Item || {};
    const isPro = String(tier).toLowerCase() === "pro";
    const limit     = isPro ? undefined : Number(process.env.FREE_LIMIT || "500");
    const fastLimit = isPro ? undefined : (process.env.FREE_FAST_LIMIT ? Number(process.env.FREE_FAST_LIMIT) : undefined);

    const payload = {
      month,
      chats: toNum(it.chats),
      ...(limit != null ? { limit } : {}),
      ...(fastLimit != null ? { fastLimit } : {}),
      ...(it.fastUsed     ? { fastUsed: toNum(it.fastUsed) }       : {}),
      ...(it.contextUsed  ? { contextUsed: toNum(it.contextUsed) } : {}),
      ...(it.updatedAt?.S ? { updatedAt: it.updatedAt.S }          : {}),
    };

    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": allow,
        "Access-Control-Allow-Credentials": "true",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    };
  } catch (e) {
    console.error(e);
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": allow, "Access-Control-Allow-Credentials": "true" },
      body: JSON.stringify({ message: "Internal Server Error" }),
    };
  }
};
