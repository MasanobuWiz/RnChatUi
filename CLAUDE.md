# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview
This project develops a web-based UI inspired by Microsoft Copilot's chat interface using React Native (with React Native Web for web compatibility). The application will be hosted on AWS using S3 and CloudFront, or optionally via AWS Amplify for simplified deployment and management. The core flow starts from the Copilot-style UI screen, where user inputs trigger real-time interactions with Amazon Bedrock to display AI-generated information. For data collection purposes, reference data (e.g., chat logs, user queries, and responses) will be gathered, tagged (e.g., with metadata like timestamps, user IDs, categories), and stored in S3 buckets. This collected data can serve as training/fine-tuning material for Bedrock models or enable Retrieval Augmented Generation (RAG) via knowledge bases. The frontend screen creation will be handled using React Native, emphasizing cross-platform compatibility starting with web focus but extensible to mobile (iOS/Android). To align with AWS best practices, ensure data preparation for fine-tuning uses high-quality, targeted datasets in JSONL format, with a focus on secure prompt handling and low-latency streaming responses.

### Clear Requirements Definition
- **Copilot-Style UI Design Specifics**: The UI mimics Microsoft Copilot's conversational UX with a clean, minimal palette, accordion-style architecture, and collapsible navigation pane. Key elements include a sidebar for quick access to features like "発言する" (Speak), "Labs" (experimental features), and breadcrumbs for navigation. The chat interface features message bubbles, typing indicators, and a bottom input bar for seamless interaction. Custom additions: Bamboo forest background with water droplet character animations for a unique, serene aesthetic. The flow begins with user input in the UI, which queries Bedrock and displays responses while collecting data in the background.
- **AWS Bedrock Integration Technical Requirements**: Use AWS SDK or Amplify API gateway to invoke Bedrock models (e.g., Claude) via `InvokeModel` API for real-time chat responses. Handle prompts securely, support streaming responses for low latency. Data collection: Serialize chat logs (inputs, outputs, metadata) and upload to S3 using AWS SDK, with tagging for organization (e.g., object metadata like 'user-id', 'session-id', 'category:query'). This tagged data can be used to create Bedrock knowledge bases for RAG, fine-tuning, or continued pre-training. Bedrock setup requires IAM roles for access, with monitoring for invocation costs. For AWS certification alignment, implement fine-tuning with datasets limited to high-quality records, experiment with hyperparameters like temperature and learning rate, and use Bedrock's built-in safeguards for content filtering.
- **Cross-Platform Compatibility Needs**: Prioritize web deployment via React Native Web, with optional mobile support. Use platform-specific conditional imports (e.g., `Platform.OS`) to handle differences. This enables code sharing while addressing native-specific features like gestures on mobile vs. browser events on web. Frontend screens (e.g., ChatScreen) will be built in React Native to manage the input-to-Bedrock-display flow.

## UI/UX Requirements Details
- **Sidebar Navigation**: Include a collapsible sidebar with options like "発言する" (initiate chat), "Labs" (experimental AI modes), "History" (past conversations), and "Settings". Use icons and hover effects for intuitiveness, inspired by Copilot's navigation menu.
- **Bamboo Forest Background + Water Droplet Character Design Specs**: Background: Subtle animated bamboo forest with soft green tones and gentle wind effects. Water droplet character: A cute, animated mascot (e.g., eyes, expressions) that reacts to user inputs (e.g., smiles on response, bubbles during typing). Use SVG or Lottie for animations, ensuring performance on web/mobile.
- **Chat Interface Copilot-Style Styling**: Message bubbles with user/AI distinction (e.g., right-aligned for user, left for AI), typing indicators, scrollable history, and input field with send button. Apply minimalistic design with rounded corners, shadows, and theme toggles (light/dark). The interface handles the input-Bedrock-response flow, displaying results while tagging and storing data in S3.

## Technical Constraints and Solutions
- **React Navigation Issues in Web and Workarounds**: React Navigation has compatibility issues on web (e.g., invalid 'children' prop errors, lack of native transitions). Solution: Use conditional imports in `navigation/index.tsx` to bypass React Navigation on web—opt for React Router or direct rendering. For mobile, retain full stack. Test with `Platform.OS === 'web'` checks.
- **Platform-Specific Conditional Branching Strategy**: Employ `Platform.OS` and `Platform.select` for branching: Web skips native modules (e.g., gestures via web events), mobile uses full features. Share components where possible, with platform-specific files (e.g., `.web.tsx` extensions).
- **AWS Integration Error Handling Techniques**: Implement try-catch for API calls, exponential backoff for throttling (e.g., ThrottlingException), retries (up to 3), and fallback messages (e.g., "Sorry, try again"). Use Sentry for logging, compress requests, and monitor rates. For Bedrock, handle validation errors and timeouts gracefully. For data tagging in S3, use object metadata or S3 tags during upload to categorize data for later retrieval or processing. To align with AWS best practices, prefer Pre-signed URLs for client-side uploads to avoid exposing credentials, generated via Lambda or API Gateway, and ensure retries use exponential backoff with jitter for reliability.

## Architecture Purpose Clarification
- **Web Version**: Avoid React Navigation for stability; use direct component rendering or lightweight routers to ensure smooth browser performance and SEO compatibility.
- **Mobile Version**: Implement full React Navigation stack with NavigationContainer for native-like transitions, gestures, and deep linking.
- **AWS Integration**: Enable real-time AI conversations via Bedrock, with prompt engineering for context-aware responses. Server-side Lambda optional for secure invocations. Data flow: User input → Bedrock query → Display response → Tag and store data in S3 for collection purposes. For AWS best practices, use Lambda to generate Pre-signed URLs for S3 uploads, integrate Cognito Identity Pools for temporary credentials, and apply Bedrock's content filtering and guardrails for secure AI interactions.

This CLAUDE.md ensures:
- ✅ Clear, non-deviating requirements as a specification document.
- ✅ Documented solutions for technical constraints (e.g., React Navigation issues).
- ✅ Defined implementation guidelines for AWS integration and Copilot-style UI.
- ✅ Established cross-platform development guidelines.

## Development Commands

### Core Development
- `npm run web` - Start webpack dev server for web development (port 9000)
- `npm run android` - Run on Android device/emulator
- `npm run ios` - Run on iOS device/simulator
- `npm start` - Start React Native Metro bundler

### Build and Deploy
- `npm run build-web` - Build production web bundle to `web-build/`
- `npm run lint` - Run ESLint
- `npm test` - Run Jest tests

### AWS Amplify
- `amplify init` - Initialize Amplify project
- `amplify add hosting` - Add S3/CloudFront hosting
- `amplify push` - Deploy backend changes
- `amplify publish` - Deploy frontend
- `amplify status` - Check deployment status
- Manual S3/CloudFront: `aws s3 sync web-build/ s3://bucket --delete`

## Key Components Structure
```
src/
├── components/ # 再利用可能なUIコンポーネント
│   ├── common/ # 汎用コンポーネント
│   │   ├── Button/
│   │   │   ├── index.tsx
│   │   │   └── styles.ts
│   │   ├── Input/
│   │   │   ├── index.tsx
│   │   │   └── styles.ts
│   │   └── MessageBubble/
│   │       ├── index.tsx
│   │       └── styles.ts
│   └── layout/ # レイアウトコンポーネント
│       ├── Sidebar/
│       │   ├── index.tsx
│       │   └── styles.ts
│       └── ChatArea/
│           ├── index.tsx
│           └── styles.ts
├── screens/ # 画面コンポーネント
│   └── ChatScreen/
│       ├── index.tsx
│       └── styles.ts
├── hooks/ # カスタムフック
│   ├── useChat.ts
│   └── useMessages.ts
├── services/ # API・外部サービス
│   └── bedrock.ts
├── types/ # TypeScript型定義
│   └── index.ts
├── constants/ # 定数
│   └── styles.ts # グローバルスタイルテーマ
├── utils/ # ユーティリティ関数
│   └── helpers.ts
├── features/ # Featureベースのモジュール化 (チャット機能集約)
│   └── chat/
│       ├── components/ # Feature固有コンポーネント
│       ├── hooks/ # Feature固有フック
│       └── services/ # Feature固有サービス
├── navigation/ # ナビゲーション設定
│   └── index.tsx
├── amplifyconfiguration.json # Amplify設定
└── App.tsx # エントリーポイント
```

## State Management
- React hooks (e.g., `useChat`) for message arrays (`text`, `isUser`, `timestamp`).
- Error handling: Retries, fallbacks.

## Web-Specific Configuration
- Webpack: Entry `index.web.js`, aliases for web compatibility.

## Development Notes
- Conventions: `index.tsx` and `styles.ts` per component.
- TypeScript: Strict checking.
- Testing: Jest with mocks for Bedrock.
- Security: IAM roles, data anonymization. For S3 data collection, ensure tags are applied during upload (e.g., via AWS SDK's `putObject` with Metadata or Tags parameters) for easy querying and organization. Align with AWS Well-Architected Framework by implementing least privilege access via IAM policies, using Cognito for authentication and temporary credentials, encrypting data in transit/rest, and monitoring with CloudWatch. For Bedrock, apply content safety filters, log invocations, and optimize costs by batching data for fine-tuning/RAG. Use multi-tenancy strategies like metadata filtering in knowledge bases for RAG scalability.