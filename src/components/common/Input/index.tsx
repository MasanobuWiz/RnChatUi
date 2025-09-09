import React from 'react';
import { View, TextInput, TouchableOpacity, Text, StyleSheet } from 'react-native';

export const ChatInput = ({ value, onChangeText, onSend }: { value: string, onChangeText: (t: string) => void, onSend: () => void }) => (
  <View style={styles.inputArea}>
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder="アクアに話しかけてください"
      style={styles.input}
      multiline={false}
      maxLength={1000}
    />
    <TouchableOpacity style={styles.sendButton} onPress={onSend}>
      <Text style={styles.sendButtonText}>送信</Text>
    </TouchableOpacity>
  </View>
);

const styles = StyleSheet.create({
  inputArea: { flexDirection: 'row', alignItems: 'center', margin: 16, backgroundColor: '#FFF', borderRadius: 25, borderWidth: 1, borderColor: '#DDD', paddingHorizontal: 12, paddingVertical: 5 },
  input: { flex: 1, fontSize: 16, color: '#222', paddingVertical: 8 },
  sendButton: { backgroundColor: '#E91E63', borderRadius: 18, padding: 10, marginLeft: 6 },
  sendButtonText: { color: '#FFF', fontSize: 14, fontWeight: 'bold' },
});
