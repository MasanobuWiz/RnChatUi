export interface Message {
  text: string;
  isUser: boolean;
  timestamp?: Date;
  id?: string;
}

export interface ChatSession {
  sessionId: string;
  userId?: string;
  startTime: Date;
  messages: Message[];
  metadata?: Record<string, any>;
}

export interface DataCollectionMetadata {
  sessionId: string;
  userId?: string;
  timestamp: Date;
  category: string;
  messageCount: number;
  userQuery: string;
  aiResponse: string;
  responseTime?: number;
  modelUsed?: string;
}

export interface S3UploadConfig {
  bucket: string;
  key: string;
  tags: Record<string, string>;
  metadata: Record<string, string>;
}

export interface DataCollectionConfig {
  enabled: boolean;
  bucket: string;
  tagPrefix: string;
  categories: string[];
}
