import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Message } from '../../../types';

export const MessageBubble = ({ message }: { message: Message }) => (
  <View style={message.isUser ? styles.userBubble : styles.botBubble}>
    <Text style={message.isUser ? styles.userText : styles.botText}>{message.text}</Text>
  </View>
);

const styles = StyleSheet.create({
  userBubble: { backgroundColor: '#E91E63', borderRadius: 18, padding: 12, marginVertical: 4, alignSelf: 'flex-end', maxWidth: '78%' },
  botBubble: { backgroundColor: '#FFF', borderRadius: 18, padding: 12, marginVertical: 4, alignSelf: 'flex-start', maxWidth: '78%', borderWidth: 1, borderColor: '#E0E0E0' },
  userText: { color: '#FFF', fontSize: 15 },
  botText: { color: '#222', fontSize: 15 },
});
