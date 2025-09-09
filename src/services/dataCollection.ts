import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { Amplify } from 'aws-amplify';
import { 
  DataCollectionMetadata, 
  S3UploadConfig, 
  DataCollectionConfig, 
  ChatSession 
} from '../types';
import { appConfig } from './config';
import { errorHandler } from '../utils/errorHandler';

class DataCollectionService {
  private s3Client: S3Client | null = null;
  private config: DataCollectionConfig;

  constructor(config?: Partial<DataCollectionConfig>) {
    this.config = {
      enabled: appConfig.dataCollection.enabled,
      bucket: appConfig.dataCollection.bucket,
      tagPrefix: appConfig.dataCollection.tagPrefix,
      categories: ['query', 'response', 'session', 'error'],
      ...config
    };

    if (this.config.enabled) {
      this.initializeS3Client();
    }
  }

  private initializeS3Client(): void {
    try {
      const amplifyConfig = Amplify.getConfig();
      const credentials = amplifyConfig.Auth?.Cognito;
      
      if (credentials) {
        this.s3Client = new S3Client({
          region: appConfig.dataCollection.region,
          credentials: {
            accessKeyId: process.env.REACT_APP_AWS_ACCESS_KEY_ID || '',
            secretAccessKey: process.env.REACT_APP_AWS_SECRET_ACCESS_KEY || '',
          }
        });
      }
    } catch (error) {
      console.warn('Failed to initialize S3 client for data collection:', error);
      this.config.enabled = false;
    }
  }

  async collectChatData(
    userQuery: string,
    aiResponse: string,
    sessionId: string,
    responseTime?: number,
    modelUsed?: string
  ): Promise<boolean> {
    if (!this.config.enabled || !this.s3Client) {
      return false;
    }

    try {
      const metadata: DataCollectionMetadata = {
        sessionId,
        timestamp: new Date(),
        category: 'conversation',
        messageCount: 2, // user + AI response
        userQuery,
        aiResponse,
        responseTime,
        modelUsed: modelUsed || 'bedrock-claude'
      };

      const key = this.generateS3Key('conversation', sessionId, metadata.timestamp);
      const uploadConfig: S3UploadConfig = {
        bucket: this.config.bucket,
        key,
        tags: this.generateTags(metadata),
        metadata: this.generateMetadata(metadata)
      };

      await this.uploadToS3(uploadConfig, metadata);
      return true;
    } catch (error) {
      await errorHandler.handleDataCollectionError(error as Error, {
        action: 'collect-chat-data',
        sessionId,
        timestamp: new Date(),
        userQuery,
        metadata: { responseTime, modelUsed }
      });
      return false;
    }
  }

  async collectSessionData(session: ChatSession): Promise<boolean> {
    if (!this.config.enabled || !this.s3Client) {
      return false;
    }

    try {
      const key = this.generateS3Key('session', session.sessionId, session.startTime);
      const uploadConfig: S3UploadConfig = {
        bucket: this.config.bucket,
        key,
        tags: {
          [`${this.config.tagPrefix}-type`]: 'session',
          [`${this.config.tagPrefix}-session-id`]: session.sessionId,
          [`${this.config.tagPrefix}-message-count`]: session.messages.length.toString(),
          [`${this.config.tagPrefix}-date`]: session.startTime.toISOString().split('T')[0]
        },
        metadata: {
          'session-id': session.sessionId,
          'user-id': session.userId || 'anonymous',
          'start-time': session.startTime.toISOString(),
          'message-count': session.messages.length.toString()
        }
      };

      await this.uploadToS3(uploadConfig, session);
      return true;
    } catch (error) {
      await errorHandler.handleDataCollectionError(error as Error, {
        action: 'collect-session-data',
        sessionId: session.sessionId,
        userId: session.userId,
        timestamp: new Date(),
        metadata: { messageCount: session.messages.length }
      });
      return false;
    }
  }

  private generateS3Key(type: string, sessionId: string, timestamp: Date): string {
    const date = timestamp.toISOString().split('T')[0];
    const time = timestamp.toISOString().replace(/[:.]/g, '-');
    return `chat-data/${type}/${date}/${sessionId}-${time}.json`;
  }

  private generateTags(metadata: DataCollectionMetadata): Record<string, string> {
    return {
      [`${this.config.tagPrefix}-type`]: 'conversation',
      [`${this.config.tagPrefix}-category`]: metadata.category,
      [`${this.config.tagPrefix}-session-id`]: metadata.sessionId,
      [`${this.config.tagPrefix}-user-id`]: metadata.userId || 'anonymous',
      [`${this.config.tagPrefix}-date`]: metadata.timestamp.toISOString().split('T')[0],
      [`${this.config.tagPrefix}-model`]: metadata.modelUsed || 'unknown'
    };
  }

  private generateMetadata(metadata: DataCollectionMetadata): Record<string, string> {
    return {
      'session-id': metadata.sessionId,
      'user-id': metadata.userId || 'anonymous',
      'timestamp': metadata.timestamp.toISOString(),
      'category': metadata.category,
      'message-count': metadata.messageCount.toString(),
      'response-time': metadata.responseTime?.toString() || '0',
      'model-used': metadata.modelUsed || 'unknown'
    };
  }

  private async uploadToS3(config: S3UploadConfig, data: any): Promise<void> {
    if (!this.s3Client) {
      throw new Error('S3 client not initialized');
    }

    const command = new PutObjectCommand({
      Bucket: config.bucket,
      Key: config.key,
      Body: JSON.stringify(data, null, 2),
      ContentType: 'application/json',
      Metadata: config.metadata,
      Tagging: Object.entries(config.tags)
        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
        .join('&')
    });

    await this.s3Client.send(command);
  }

  async testConnection(): Promise<boolean> {
    if (!this.config.enabled || !this.s3Client) {
      return false;
    }

    try {
      const testData = {
        test: true,
        timestamp: new Date().toISOString()
      };
      
      const key = `test/connection-test-${Date.now()}.json`;
      const command = new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        Body: JSON.stringify(testData),
        ContentType: 'application/json',
        Metadata: {
          'test': 'true',
          'timestamp': new Date().toISOString()
        }
      });

      await this.s3Client.send(command);
      return true;
    } catch (error) {
      console.error('Data collection connection test failed:', error);
      return false;
    }
  }

  getConfig(): DataCollectionConfig {
    return { ...this.config };
  }

  updateConfig(newConfig: Partial<DataCollectionConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    if (this.config.enabled && !this.s3Client) {
      this.initializeS3Client();
    }
  }
}

export const dataCollectionService = new DataCollectionService();
export default DataCollectionService;