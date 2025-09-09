import React from 'react';
import { View, ScrollView, Text, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Message } from '../../../types';
import { MessageBubble } from '../../common/MessageBubble';
import { styles } from './styles';

interface ChatAreaProps {
  messages: Message[];
  input: string;
  onInputChange: (text: string) => void;
  onSend: () => void;
  isLoading?: boolean;
}

export const ChatArea: React.FC<ChatAreaProps> = ({
  messages,
  input,
  onInputChange,
  onSend,
  isLoading = false
}) => {
  return (
    <View style={styles.container}>
      <ScrollView 
        style={styles.messagesContainer}
        contentContainerStyle={styles.messagesContent}
      >
        {messages.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>チャットを開始してください</Text>
          </View>
        )}
        
        {messages.map((message, index) => (
          <MessageBubble
            key={message.id || `message-${index}`}
            message={message}
          />
        ))}
        
        {isLoading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color="#007AFF" />
            <Text style={styles.loadingText}>応答を生成中...</Text>
          </View>
        )}
      </ScrollView>
      
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.textInput}
          value={input}
          onChangeText={onInputChange}
          placeholder="メッセージを入力..."
          placeholderTextColor="#999"
          multiline
          maxLength={2000}
        />
        <TouchableOpacity 
          style={[styles.sendButton, (!input.trim() || isLoading) && styles.sendButtonDisabled]}
          onPress={onSend}
          disabled={!input.trim() || isLoading}
        >
          <Text style={[styles.sendButtonText, (!input.trim() || isLoading) && styles.sendButtonTextDisabled]}>
            送信
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};