import { Message, ChatSession, DataCollectionMetadata } from '../types';
import { v4 as uuidv4 } from 'uuid';

export interface TaggingOptions {
  includeUserAgent?: boolean;
  includeTimezone?: boolean;
  includeSessionLength?: boolean;
  customTags?: Record<string, string>;
}

export class DataTagger {
  private sessionId: string;
  private userId?: string;

  constructor(userId?: string) {
    this.sessionId = uuidv4();
    this.userId = userId;
  }

  generateSessionId(): string {
    return uuidv4();
  }

  generateMessageId(): string {
    return uuidv4();
  }

  tagMessage(text: string, isUser: boolean, options?: TaggingOptions): Message {
    return {
      id: this.generateMessageId(),
      text,
      isUser,
      timestamp: new Date(),
      ...options?.customTags
    };
  }

  createChatSession(initialMessage?: Message, options?: TaggingOptions): ChatSession {
    const session: ChatSession = {
      sessionId: this.sessionId,
      userId: this.userId,
      startTime: new Date(),
      messages: initialMessage ? [initialMessage] : [],
      metadata: {
        userAgent: options?.includeUserAgent ? navigator.userAgent : undefined,
        timezone: options?.includeTimezone ? Intl.DateTimeFormat().resolvedOptions().timeZone : undefined,
        ...options?.customTags
      }
    };

    return session;
  }

  addMessageToSession(session: ChatSession, message: Message): ChatSession {
    return {
      ...session,
      messages: [...session.messages, message]
    };
  }

  categorizeMessage(message: string): string {
    const lowerMessage = message.toLowerCase();
    
    if (lowerMessage.includes('error') || lowerMessage.includes('問題') || lowerMessage.includes('エラー')) {
      return 'error-report';
    }
    
    if (lowerMessage.includes('how') || lowerMessage.includes('what') || lowerMessage.includes('why') || 
        lowerMessage.includes('どう') || lowerMessage.includes('何') || lowerMessage.includes('なぜ')) {
      return 'question';
    }
    
    if (lowerMessage.includes('code') || lowerMessage.includes('function') || lowerMessage.includes('コード')) {
      return 'code-assistance';
    }
    
    if (lowerMessage.includes('explain') || lowerMessage.includes('teach') || lowerMessage.includes('説明')) {
      return 'explanation-request';
    }
    
    return 'general-query';
  }

  generateDataCollectionTags(
    userQuery: string,
    aiResponse: string,
    responseTime?: number,
    options?: TaggingOptions
  ): Record<string, string> {
    const category = this.categorizeMessage(userQuery);
    const baseDate = new Date().toISOString().split('T')[0];
    
    const tags: Record<string, string> = {
      'chat-data-type': 'conversation',
      'chat-data-category': category,
      'chat-data-session-id': this.sessionId,
      'chat-data-user-id': this.userId || 'anonymous',
      'chat-data-date': baseDate,
      'chat-data-has-response-time': responseTime ? 'true' : 'false',
      'chat-data-query-length': userQuery.length.toString(),
      'chat-data-response-length': aiResponse.length.toString()
    };

    if (options?.customTags) {
      Object.entries(options.customTags).forEach(([key, value]) => {
        tags[`chat-data-custom-${key}`] = value;
      });
    }

    return tags;
  }

  generateS3Metadata(
    userQuery: string,
    aiResponse: string,
    responseTime?: number,
    modelUsed?: string
  ): DataCollectionMetadata {
    return {
      sessionId: this.sessionId,
      userId: this.userId,
      timestamp: new Date(),
      category: this.categorizeMessage(userQuery),
      messageCount: 2,
      userQuery: userQuery.substring(0, 1000), // Truncate for metadata
      aiResponse: aiResponse.substring(0, 1000), // Truncate for metadata
      responseTime,
      modelUsed: modelUsed || 'bedrock-claude'
    };
  }

  tagForRAGPurpose(content: string, source: 'user' | 'ai'): Record<string, any> {
    return {
      content,
      source,
      timestamp: new Date().toISOString(),
      sessionId: this.sessionId,
      userId: this.userId,
      contentType: 'chat-message',
      category: this.categorizeMessage(content),
      wordCount: content.split(' ').length,
      language: this.detectLanguage(content)
    };
  }

  tagForFineTuningPurpose(
    userInput: string,
    expectedOutput: string,
    quality: 'high' | 'medium' | 'low' = 'medium'
  ): Record<string, any> {
    return {
      messages: [
        { role: 'user', content: userInput },
        { role: 'assistant', content: expectedOutput }
      ],
      metadata: {
        sessionId: this.sessionId,
        userId: this.userId,
        timestamp: new Date().toISOString(),
        quality,
        category: this.categorizeMessage(userInput),
        inputLength: userInput.length,
        outputLength: expectedOutput.length,
        language: this.detectLanguage(userInput)
      }
    };
  }

  private detectLanguage(text: string): string {
    const japaneseRegex = /[\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf]/;
    const englishRegex = /[a-zA-Z]/;
    
    const hasJapanese = japaneseRegex.test(text);
    const hasEnglish = englishRegex.test(text);
    
    if (hasJapanese && hasEnglish) {
      return 'mixed';
    } else if (hasJapanese) {
      return 'japanese';
    } else if (hasEnglish) {
      return 'english';
    }
    
    return 'unknown';
  }

  exportSessionForAnalysis(session: ChatSession): string {
    const analysisData = {
      session: {
        id: session.sessionId,
        userId: session.userId,
        startTime: session.startTime.toISOString(),
        duration: Date.now() - session.startTime.getTime(),
        messageCount: session.messages.length
      },
      messages: session.messages.map(msg => ({
        id: msg.id,
        isUser: msg.isUser,
        timestamp: msg.timestamp?.toISOString(),
        contentLength: msg.text.length,
        category: msg.isUser ? this.categorizeMessage(msg.text) : 'ai-response'
      })),
      statistics: {
        userMessages: session.messages.filter(m => m.isUser).length,
        aiResponses: session.messages.filter(m => !m.isUser).length,
        averageUserMessageLength: this.calculateAverageLength(session.messages.filter(m => m.isUser)),
        averageAIResponseLength: this.calculateAverageLength(session.messages.filter(m => !m.isUser))
      }
    };

    return JSON.stringify(analysisData, null, 2);
  }

  private calculateAverageLength(messages: Message[]): number {
    if (messages.length === 0) return 0;
    const total = messages.reduce((sum, msg) => sum + msg.text.length, 0);
    return Math.round(total / messages.length);
  }

  getSessionId(): string {
    return this.sessionId;
  }

  getUserId(): string | undefined {
    return this.userId;
  }

  setUserId(userId: string): void {
    this.userId = userId;
  }
}

// Install uuid if not already installed
// npm install uuid @types/uuid

export const createDataTagger = (userId?: string): DataTagger => {
  return new DataTagger(userId);
};