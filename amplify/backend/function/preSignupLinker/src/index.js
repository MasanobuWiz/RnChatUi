// preSignupLinker/src/index.js
const {
  CognitoIdentityProviderClient,
  ListUsersCommand,
  AdminLinkProviderForUserCommand,
} = require('@aws-sdk/client-cognito-identity-provider');

const idp = new CognitoIdentityProviderClient({});

exports.handler = async (event) => {
  // 既定は何もしない
  event.response.autoConfirmUser = false;
  event.response.autoVerifyEmail = false;

  const trigger = event.triggerSource;
  const userPoolId = event.userPoolId;
  const userName = event.userName; // 例: "Google_1234567890" / "LoginWithAmazon_XXXX"
  const email = event.request?.userAttributes?.email;

  try {
    // ソーシャル経由のサインイン時のみ自動確認＆メール検証を有効化
    if (trigger === 'PreSignUp_ExternalProvider') {
      event.response.autoConfirmUser = true;
      event.response.autoVerifyEmail = true;

      // 既存ユーザー（Cognito ネイティブ登録）をメール一致で検索 → 存在すればリンク
      if (email) {
        const list = await idp.send(new ListUsersCommand({
          UserPoolId: userPoolId,
          Filter: `email = "${email}"`,
          Limit: 1,
        }));
        const existing = (list.Users || [])[0];

        if (existing?.Username) {
          // ProviderName / ProviderUserId を event.userName から抽出
          // "Google_12345..." / "LoginWithAmazon_..." という形式
          const [providerName, ...rest] = String(userName).split('_');
          const providerUserId = rest.join('_');

          // すでにリンク済みでも失敗させないように try/catch
          try {
            await idp.send(new AdminLinkProviderForUserCommand({
              UserPoolId: userPoolId,
              DestinationUser: {
                ProviderName: 'Cognito',
                ProviderAttributeValue: existing.Username, // 既存 Cognito ユーザー名
              },
              SourceUser: {
                ProviderName: providerName,                  // Google / LoginWithAmazon など
                ProviderAttributeName: 'Cognito_Subject',
                ProviderAttributeValue: providerUserId,      // IdP 側の subject
              },
            }));
            console.log('Linked IdP user to existing Cognito user:', {
              email, existingUsername: existing.Username, providerName,
            });
          } catch (e) {
            // すでにリンク済み／一時的エラーなどはログだけ出して続行
            console.warn('AdminLinkProviderForUser warn:', e?.name, e?.message);
          }
        }
      }
    }

    return event;
  } catch (e) {
    console.error('preSignupLinker error:', e);
    // 失敗してもサインアップ自体は継続（必要なら fail させる設計に変更）
    return event;
  }
};
