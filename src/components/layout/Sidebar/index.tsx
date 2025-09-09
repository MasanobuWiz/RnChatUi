// src/components/layout/Sidebar/index.tsx
import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';

interface SidebarProps {
  isCollapsed: boolean;
  onToggle: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isCollapsed, onToggle }) => {
  const menuItems = [
    { id: 'speak', icon: '💬', title: '発言する', subtitle: '何でもコメント・スピーシング' },
    { id: 'labs', icon: '🔬', title: 'Labs', subtitle: '試験的なAIアイデアラブ' },
    { id: 'bargain', icon: '💰', title: 'バーゲン', subtitle: '' },
  ];

  return (
    <View style={styles.container}>
      {/* Copilot ヘッダー */}
      <Text style={styles.header}>Copilot</Text>
      
      {/* メニューアイテム */}
      {menuItems.map(item => (
        <TouchableOpacity key={item.id} style={styles.menuItem}>
          <Text style={styles.itemIcon}>{item.icon}</Text>
          <View style={styles.itemContent}>
            <Text style={styles.itemTitle}>{item.title}</Text>
            {item.subtitle && (
              <Text style={styles.itemSubtitle}>{item.subtitle}</Text>
            )}
          </View>
        </TouchableOpacity>
      ))}
      
      {/* 会話履歴セクション */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>会話</Text>
        <Text style={styles.conversationItem}>今日</Text>
        <Text style={styles.conversationItem}>AWS Toolkit アクセス権とトラブルシュート</Text>
        <Text style={styles.conversationItem}>昨日</Text>
        <Text style={styles.conversationItem}>Copilotが無料利用の理由</Text>
      </View>
      
      {/* ページ作成ボタン */}
      <TouchableOpacity style={styles.createBtn}>
        <Text style={styles.createText}>ページ作成する</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRightWidth: 1,
    borderRightColor: '#e1e1e1',
    padding: 16,
  },
  header: {
    fontSize: 20,
    fontWeight: '600',
    color: '#0078d4',
    marginBottom: 20,
    marginTop: 60, // ハンバーガーアイコンのスペース確保
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 8,
    marginBottom: 4,
  },
  itemIcon: {
    fontSize: 18,
    width: 24,
    marginRight: 12,
  },
  itemContent: {
    flex: 1,
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#323130',
  },
  itemSubtitle: {
    fontSize: 12,
    color: '#605e5c',
    marginTop: 2,
  },
  section: {
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#f3f2f1',
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8a8886',
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  conversationItem: {
    fontSize: 13,
    color: '#323130',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 4,
  },
  createBtn: {
    backgroundColor: '#323130',
    borderRadius: 6,
    padding: 12,
    marginTop: 20,
    alignItems: 'center',
  },
  createText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '500',
  },
});
