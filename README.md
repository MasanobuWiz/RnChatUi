# RnChatUi Project
## ディレクトリ構造
- components/: UIコンポーネント (common/汎用, layout/レイアウト)
- screens/: 画面ルート
- hooks/: 状態管理フック
- services/: AWS/外部API
- types/: 型定義
- constants/: 定数 (スタイルなど)
- utils/: ユーティリティ
- features/: Featureモジュール (例: chat/)
- navigation/: ルーティング

## 開発フロー
1. Amplifyバックエンド設定: `amplify push`
2. ローカルテスト: `npm run web`
3. ビルド/S3ホスト: `npm run build-web` & `aws s3 sync`