// src/screens/ChatScreen/styles.ts

import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
  // メインエリア全体
  mainArea: {
    flex: 1,
    backgroundColor: '#ffffff',
  },

  // ヘッダーセクション
  headerSection: {
    height: 300,
    width: '100%',
    maxWidth: 1200,        // Copilot本家と同じくらいの最大横幅
    alignSelf: 'center',   // 画面中央に寄せる
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },

  // 背景画像
  headerBackground: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24, // 余白
  },
  headerImageStyle: {
    opacity: 0.85,         // 少し透かす
  },

  // ヘッダー上のトグルアイコン
  headerToggle: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 32,
    height: 32,
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  toggleIcon: {
    fontSize: 18,
    color: '#ffffff',
  },

  // ヘッダー内オーバーレイコンテンツ
  headerOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 20,
  },
  character: {
    width: 110,
    height: 110,
    marginBottom: 18,
  },

  // 説明文ボックス
  descriptionBox: {
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 14,
    paddingVertical: 20,
    paddingHorizontal: 28,
    marginHorizontal: 28,
    marginBottom: 10,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  welcomeText: {
    fontSize: 19,
    fontWeight: '600',
    color: '#0067b8',
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: 0.2,
    lineHeight: 24,
  },
  subWelcomeText: {
    fontSize: 14,
    color: '#606060',
    textAlign: 'center',
    lineHeight: 20,
  },

  // Placeholder（メッセージなし時）
  placeholderContainer: {
    padding: 24,
    alignItems: 'center',
  },
  placeholderText: {
    fontSize: 16,
    color: '#888',
  },
});
