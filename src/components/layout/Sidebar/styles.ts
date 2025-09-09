import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
  sidebar: { width: 220, backgroundColor: '#FFF', borderRightWidth: 1, borderColor: '#E0E0E0', padding: 16 },
  header: { fontSize: 18, fontWeight: '600', color: '#E91E63', marginBottom: 16 },
  item: { marginBottom: 16 },
  emoji: { fontSize: 17, marginRight: 5 },
  itemText: { fontSize: 14, fontWeight: '500', color: '#222' },
  subText: { fontSize: 12, color: '#666', lineHeight: 16 },
  divider: { height: 1, backgroundColor: '#E0E0E0', marginVertical: 14 },
  createPageBtn: { backgroundColor: '#333', borderRadius: 6, padding: 8, marginBottom: 8 },
  createPageText: { color: '#FFF', textAlign: 'center', fontSize: 14 },
});
