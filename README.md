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

## Judge Evaluators
- 既定の judge は `browser-backend-chat` です。
- 外部 evaluator は `LLM_JUDGE_EVALUATOR_MODE` で切り替えできます。対応モード: `openai`, `anthropic`, `xai`, `github-models`, `openai-compatible`。
- `copilot` は `github-models` のエイリアスとして扱います。
- judge の pass 判定は LLM 採点に加えて hard check でも補正されます。必須語、禁止語、期待言語、文数、箇条書き件数などはローカルで機械判定します。
- `scripts/chat-judge-scenarios.json` では `referenceAnswer` と `hardChecks` を定義できます。これで採点基準のブレを減らせます。
- `hardChecks` では JSON object 強制、exact key 検証、全値 string 制約も使えます。構造化出力や「余計な説明を付けない」系の judge を強める用途です。
- GitHub Models を使う場合は、Copilot UI の現在モデルには依存させず、`LLM_JUDGE_EVALUATOR_MODEL` に exact model ID を固定してください。
- exact model ID は `npm run test:chat:judge:models` で列挙できます。`GITHUB_TOKEN` / `GH_TOKEN` が未設定でも、`gh auth login` 済みなら GitHub CLI の token を使います。
- ローカル PAT 経路が不安定な場合は、`.github/workflows/chat-judge-github-models.yml` の Actions 実行を既定経路として使ってください。`models: read` 付きの `GITHUB_TOKEN` で judge を走らせます。
- 共通設定: `LLM_JUDGE_EVALUATOR_MODE`, `LLM_JUDGE_EVALUATOR_MODEL`
- OpenAI: `OPENAI_API_KEY`
- Claude/Anthropic: `ANTHROPIC_API_KEY`
- Grok/xAI: `XAI_API_KEY`
- GitHub Models: `GITHUB_TOKEN` または `GH_TOKEN`

PowerShell 例:

```powershell
$env:LLM_JUDGE_EVALUATOR_MODE = 'openai'
$env:LLM_JUDGE_EVALUATOR_MODEL = '<your-model>'
$env:OPENAI_API_KEY = '<your-api-key>'
node scripts/chat-judge-eval.mjs --scenario guest-rag-brief
```

GitHub Models 例:

```powershell
$env:LLM_JUDGE_EVALUATOR_MODE = 'github-models'
$env:LLM_JUDGE_EVALUATOR_MODEL = '<publisher/model_name>'
$env:GITHUB_TOKEN = '<your-token>'
node scripts/chat-judge-eval.mjs --scenario auth-short-plan
```

exact model ID の確認例:

```powershell
npm run test:chat:judge:models
node scripts/list-github-models.mjs --publisher OpenAI --publisher Anthropic --json
```

judge の集計レポートをローカルで出す例:

```powershell
$env:LLM_JUDGE_EVALUATOR_MODE = 'github-models'
$env:LLM_JUDGE_EVALUATOR_MODEL = 'openai/gpt-5-chat'
$env:GITHUB_TOKEN = '<your-token>'
npm run test:chat:judge:report -- --scenario-filter guest-rag --output reports/chat-judge/report.json --markdown-output reports/chat-judge/summary.md
```

GitHub Actions で pinned model judge を回す運用:

```text
Actions > Chat Judge GitHub Models > Run workflow
```

- 既定 model は `openai/gpt-5-chat` です。
- 結果は step summary と artifact `chat-judge-<run_id>` に保存されます。
- `include_auth=true` は runner 側に AWS 認証情報がある場合だけ使ってください。既定は guest scenario のみです。