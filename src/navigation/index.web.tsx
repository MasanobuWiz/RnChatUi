// src/navigation/index.web.tsx
import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Sidebar } from '../components/layout/Sidebar';
import { ChatScreen } from '../screens/ChatScreen';
import { Header } from '../components/layout/Header/Header';
import { AuthModal } from '../screens/ChatScreen/AuthModal';

export const Navigation: React.FC = () => {
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [user, setUser] = useState<{ username: string; email: string } | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');

  const toggleSidebar = () => setIsCollapsed(!isCollapsed);

  const handleSignIn = () => {
    setAuthMode('signin');
    setShowAuthModal(true);
  };

  const handleSignUp = () => {
    setAuthMode('signup');
    setShowAuthModal(true);
  };

  const handleSignOut = () => {
    setUser(null);
  };

  const handleAuthSuccess = (authUser: any) => {
    setUser(authUser);
    setShowAuthModal(false);
  };

  return (
    <View style={styles.container}>
      {/* 固定ヘッダー */}
      <View style={styles.header}>
        <Header
          user={user}
          onSignIn={handleSignIn}
          onSignUp={handleSignUp}
          onSignOut={handleSignOut}
          onToggleSidebar={toggleSidebar}
          variant="default"
        />
      </View>

      <View style={styles.content}>
        {/* サイドバー */}
        {!isCollapsed && (
          <View style={styles.sidebar}>
            <Sidebar
              isCollapsed={isCollapsed}
              onToggle={toggleSidebar}
            />
          </View>
        )}

        {/* メインコンテンツ */}
        <View style={[
          styles.main,
          { marginLeft: isCollapsed ? 0 : 280 }
        ]}>
          <ChatScreen />
        </View>
      </View>

      {/* 認証モーダル */}
      <AuthModal
        visible={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onAuthSuccess={handleAuthSuccess}
        initialMode={authMode}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  header: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
  },
  content: {
    flex: 1,
    flexDirection: 'row',
    marginTop: 56, // ヘッダーの高さ分
  },
  sidebar: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    bottom: 0,
    width: 280,
    backgroundColor: '#ffffff',
    borderRightWidth: 1,
    borderRightColor: '#e1e1e1',
    zIndex: 900,
  },
  main: {
    flex: 1,
  },
});
