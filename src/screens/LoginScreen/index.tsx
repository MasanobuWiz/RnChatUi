// src/screens/LoginScreen/index.tsx

import React, { useState } from 'react';
import { AuthModal } from '../ChatScreen/AuthModal';

// AuthModalで返すerrorもここで受けて、全体画面上部に常時表示も可能
const LoginScreen: React.FC = () => {
  const [authModalVisible, setAuthModalVisible] = useState(true); // 起動時常時表示
  const [lastAuthError, setLastAuthError] = useState<string>("");

  const handleAuthSuccess = (user: any) => {
    setAuthModalVisible(false);
    // ここでAppやチャット画面に遷移、ユーザー情報をグローバル状態管理など
  };

  const handleAuthClose = () => {
    setAuthModalVisible(false);
    // 必要なら「閉じるだけ」「ログインしないと進めません」などメッセージ/再起動
    setLastAuthError("認証が完了しませんでした。もう一度ログインしてください。");
  };

  return (
    <div>
      <h2>ログインを完了してください</h2>
      {/* グローバルエラーメッセージ例 */}
      {lastAuthError && (
        <div style={{ color: 'red', marginBottom: 10 }}>{lastAuthError}</div>
      )}
      <button onClick={() => setAuthModalVisible(true)}>ログイン画面を開く</button>
      <AuthModal
        visible={authModalVisible}
        onClose={handleAuthClose}
        onAuthSuccess={handleAuthSuccess}
      />
    </div>
  );
};

export default LoginScreen;
