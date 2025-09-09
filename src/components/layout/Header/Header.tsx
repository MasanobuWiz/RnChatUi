// src/components/layout/Header/Header.tsx (拡張版)
import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { styles } from './styles';

export interface HeaderProps {
  user?: { username: string; email: string } | null;
  onSignIn: () => void;
  onSignUp: () => void;
  onSignOut: () => void;
  onToggleSidebar?: () => void; // ← サイドバー開閉機能追加
  showAuthButtons?: boolean;
  variant?: 'default' | 'overlay';
}

export const Header: React.FC<HeaderProps> = ({
  user,
  onSignIn,
  onSignUp,
  onSignOut,
  onToggleSidebar, // ← 追加
  showAuthButtons = true,
  variant = 'default'
}) => {
  const containerStyle = variant === 'overlay' ? styles.overlayContainer : styles.container;
  const logoTextStyle = variant === 'overlay' ? styles.overlayLogoText : styles.logoText;

  return (
    <View style={containerStyle}>
      {/* ハンバーガーアイコン（左端） */}
      {onToggleSidebar && (
        <TouchableOpacity onPress={onToggleSidebar} style={styles.hamburger}>
          <Text style={styles.hamburgerIcon}>☰</Text>
        </TouchableOpacity>
      )}

      {/* スペーサー */}
      <View style={styles.spacer} />

      {/* 右端：認証ボタン */}
      {showAuthButtons && (
        <View style={styles.authSection}>
          {user ? (
            <View style={[
              styles.userSection, 
              variant === 'overlay' && styles.overlayUserSection
            ]}>
              <View style={styles.userAvatar}>
                <Text style={styles.userInitial}>
                  {user.email.charAt(0).toUpperCase()}
                </Text>
              </View>
              <Text style={[
                styles.userName,
                variant === 'overlay' && styles.overlayUserName
              ]}>
                {user.username}
              </Text>
              <TouchableOpacity 
                style={[
                  styles.signOutBtn,
                  variant === 'overlay' && styles.overlaySignOutBtn
                ]} 
                onPress={onSignOut}
              >
                <Text style={[
                  styles.signOutText,
                  variant === 'overlay' && styles.overlaySignOutText
                ]}>
                  サインアウト
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.guestSection}>
              <TouchableOpacity 
                style={[
                  styles.signInBtn,
                  variant === 'overlay' && styles.overlaySignInBtn
                ]} 
                onPress={onSignIn}
              >
                <Text style={[
                  styles.signInText,
                  variant === 'overlay' && styles.overlaySignInText
                ]}>
                  サインイン
                </Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[
                  styles.signUpBtn,
                  variant === 'overlay' && styles.overlaySignUpBtn
                ]} 
                onPress={onSignUp}
              >
                <Text style={[
                  styles.signUpText,
                  variant === 'overlay' && styles.overlaySignUpText
                ]}>
                  サインアップ
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}
    </View>
  );
};
