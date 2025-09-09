// src/components/layout/Header/styles.ts

import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
  // 既存のスタイル（そのまま保持）
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 56,
    paddingHorizontal: 16,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e1e1e1',
  },
  logoSection: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logoIcon: {
    fontSize: 24,
    marginRight: 8,
  },
  logoText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1a1a1a',
  },
  authSection: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  signInBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 4,
    backgroundColor: 'transparent',
    marginLeft: 8,
  },
  signInText: {
    fontSize: 14,
    color: '#1a1a1a',
    fontWeight: '500',
  },
  signUpBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 4,
    backgroundColor: '#1a1a1a',
  },
  signUpText: {
    fontSize: 14,
    color: '#ffffff',
    fontWeight: '600',
  },
  userSection: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  userName: {
    fontSize: 14,
    color: '#1a1a1a',
    marginRight: 12,
  },
  authBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 4,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#e1e1e1',
  },
  authBtnText: {
    fontSize: 14,
    color: '#666666',
  },

  // ハンバーガーアイコン用スタイル（新規追加）
  hamburger: {
    paddingVertical: 8,
    paddingHorizontal: 8,
    marginRight: 16,
    borderRadius: 4,
  },
  hamburgerIcon: {
    fontSize: 20,
    color: '#333333',
    fontWeight: '600',
  },
  spacer: {
    flex: 1,
  },

  // 新しく追加するスタイル（エラー解決用）
  overlayContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 50, // ステータスバー分
    paddingBottom: 16,
    zIndex: 10,
    backgroundColor: 'transparent',
  },
  overlayLogoText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ffffff',
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  guestSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  overlaySignInBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  overlaySignInText: {
    color: '#1a1a1a',
  },
  overlaySignUpBtn: {
    backgroundColor: '#1a1a1a',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  overlaySignUpText: {
    color: '#ffffff',
  },
  overlayUserSection: {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  userAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#007AFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  userInitial: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
  overlayUserName: {
    color: '#1a1a1a',
  },
  signOutBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#e1e1e1',
  },
  signOutText: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },
  overlaySignOutBtn: {
    backgroundColor: '#f0f0f0',
    borderColor: 'transparent',
  },
  overlaySignOutText: {
    color: '#666',
  },
});
