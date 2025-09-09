// rnchatuiPreSignup/src/custom.js
const {
  CognitoIdentityProviderClient,
  ListUsersCommand,
  AdminLinkProviderForUserCommand,
} = require("@aws-sdk/client-cognito-identity-provider");

const idp = new CognitoIdentityProviderClient({});

exports.handler = async (event) => {
  // 既定値
  event.response.autoConfirmUser = false;
  event.response.autoVerifyEmail = false;

  try {
    const trigger = event.triggerSource; // 例: PreSignUp_ExternalProvider
    const userPoolId = event.userPoolId;
    const userName = event.userName || "";  // "Google_123..." / "LoginWithAmazon_..."
    const email = event.request?.userAttributes?.email;

    const isExternal = trigger === "PreSignUp_ExternalProvider";
    if (isExternal) {
      // ソーシャルは自動確認 & メール検証
      event.response.autoConfirmUser = true;
      event.response.autoVerifyEmail = true;
    }

    if (!email || !userPoolId) return event;

    // 同じメールの既存 Cognito（ユー名/パスワード）ユーザーを検索
    const list = await idp.send(new ListUsersCommand({
      UserPoolId: userPoolId,
      Filter: `email = "${email}"`,
      Limit: 1,
    }));
    const existing = (list.Users || [])[0];

    // 既存ユーザーがいて、かつ今回が外部IdPならリンク
    if (existing?.Username && isExternal) {
      const [providerName, ...rest] = String(userName).split("_");
      const providerUserId = rest.join("_");

      try {
        await idp.send(new AdminLinkProviderForUserCommand({
          UserPoolId: userPoolId,
          DestinationUser: {
            ProviderName: "Cognito",
            ProviderAttributeValue: existing.Username,
          },
          SourceUser: {
            ProviderName: providerName,              // "Google" / "LoginWithAmazon"
            ProviderAttributeName: "Cognito_Subject",
            ProviderAttributeValue: providerUserId,  // IdP 側 sub
          },
        }));
        console.log("Linked:", { email, existing: existing.Username, providerName });
      } catch (e) {
        console.warn("AdminLinkProviderForUser warn:", e?.name, e?.message);
      }
    }

    return event;
  } catch (e) {
    console.error("PreSignup error:", e);
    // ここではサインアップを止めない方針
    return event;
  }
};
