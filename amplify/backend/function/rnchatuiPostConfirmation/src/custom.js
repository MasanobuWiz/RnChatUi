// amplify/backend/auth/<auth-resource>/custom.js
const {
  CognitoIdentityProviderClient,
  ListUsersCommand,
  AdminLinkProviderForUserCommand,
} = require("@aws-sdk/client-cognito-identity-provider");

const { DynamoDBClient, PutItemCommand } = require("@aws-sdk/client-dynamodb");

// v3 SDK クライアント（リージョンはLambdaの実行ロール環境に自動合致）
const idp = new CognitoIdentityProviderClient({});
const ddb = new DynamoDBClient({});

// ====== 入口（Cognito からは triggerSource で呼ばれる）======
exports.handler = async (event) => {
  const t = event.triggerSource;

  try {
    switch (t) {
      case "PreSignUp_SignUp":
      case "PreSignUp_AdminCreateUser":
      case "PreSignUp_ExternalProvider":
        return await preSignUpLinkAccounts(event);

      case "PostConfirmation_ConfirmSignUp":
      case "PostConfirmation_ConfirmForgotPassword":
        return await postConfirmationUpsertProfile(event);

      default:
        // 他のトリガーは素通し
        return event;
    }
  } catch (e) {
    console.error("custom.js error:", t, e);
    // 失敗させたくないので event を返して通す（要件に応じて throw に切り替え可能）
    return event;
  }
};

// ====== Pre Sign-up：同メールの既存CognitoユーザーにFederationユーザーをリンク ======
async function preSignUpLinkAccounts(event) {
  // デフォルト動作
  event.response.autoConfirmUser = false;
  event.response.autoVerifyEmail = false;

  const isExternal =
    event.triggerSource === "PreSignUp_ExternalProvider";

  const userPoolId = event.userPoolId;
  const userName = event.userName || ""; // 例: "Google_123456..." / "LoginWithAmazon_XXXX"
  const email = event.request?.userAttributes?.email;

  // ソーシャルの場合は自動確認＆メール検証OKに
  if (isExternal) {
    event.response.autoConfirmUser = true;
    event.response.autoVerifyEmail = true;
  }

  if (!email || !userPoolId) return event;

  // 既存のローカル（Cognito）ユーザーをメール一致で検索
  const list = await idp.send(
    new ListUsersCommand({
      UserPoolId: userPoolId,
      Filter: `email = "${email}"`,
      Limit: 1,
    })
  );
  const existing = (list.Users || [])[0];

  // 既存ユーザーがいれば Federated ユーザーをリンク
  if (existing?.Username && isExternal) {
    // userName: "Google_12345..." / "LoginWithAmazon_..."
    const [providerName, ...rest] = String(userName).split("_");
    const providerUserId = rest.join("_");

    // 失敗しても致命にはしない
    try {
      await idp.send(
        new AdminLinkProviderForUserCommand({
          UserPoolId: userPoolId,
          DestinationUser: {
            ProviderName: "Cognito",
            ProviderAttributeValue: existing.Username, // 既存Cognitoユーザー名
          },
          SourceUser: {
            ProviderName: providerName, // "Google" / "LoginWithAmazon"
            ProviderAttributeName: "Cognito_Subject",
            ProviderAttributeValue: providerUserId, // IdP側のsub
          },
        })
      );
      console.log("Linked IdP user to existing Cognito user:", {
        email,
        existingUsername: existing.Username,
        providerName,
      });
    } catch (e) {
      console.warn("AdminLinkProviderForUser warn:", e?.name, e?.message);
    }
  }

  return event;
}

// ====== Post Confirmation：AiApp にプロフィールを upsert ======
async function postConfirmationUpsertProfile(event) {
  const attrs = event.request?.userAttributes || {};
  const sub = attrs.sub;
  const email = attrs.email || "";
  const now = new Date().toISOString();

  // federated の場合、identities が JSON文字列で来る
  let providers = [];
  try {
    if (attrs.identities) {
      const idents = JSON.parse(attrs.identities);
      providers = Array.isArray(idents)
        ? idents.map((i) => i.providerName).filter(Boolean)
        : [];
    }
  } catch (_) {}

  const table = process.env.TABLE_NAME || "AiApp"; // 念のためデフォルトも
  if (!sub) return event;

  const item = {
    pk: { S: `USER#${sub}` },
    sk: { S: `PROFILE#v1` },
    email: { S: email },
    providers: { S: JSON.stringify(providers) },
    createdAt: { S: now },
    updatedAt: { S: now },
  };

  try {
    await ddb.send(
      new PutItemCommand({
        TableName: table,
        Item: item,
        // 既存でも上書きOK（必要なら ConditionExpression を付けて重複作成を防止）
      })
    );
    console.log("PROFILE upserted:", { pk: item.pk.S, sk: item.sk.S, email });
  } catch (e) {
    console.warn("DDB Put warn:", e?.name, e?.message);
  }

  return event;
}
