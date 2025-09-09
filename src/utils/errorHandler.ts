import { dataCollectionService } from '../services/dataCollection';

export interface ErrorContext {
  action: string;
  sessionId?: string;
  userId?: string;
  timestamp: Date;
  userQuery?: string;
  metadata?: Record<string, any>;
}

export class DataCollectionError extends Error {
  public context: ErrorContext;
  public originalError?: Error;

  constructor(message: string, context: ErrorContext, originalError?: Error) {
    super(message);
    this.name = 'DataCollectionError';
    this.context = context;
    this.originalError = originalError;
  }
}

export class ErrorHandler {
  private static instance: ErrorHandler;
  private errorQueue: Array<{ error: Error; context: ErrorContext }> = [];
  private isProcessing = false;
  private retryAttempts = 3;
  private retryDelay = 1000; // 1 second

  static getInstance(): ErrorHandler {
    if (!ErrorHandler.instance) {
      ErrorHandler.instance = new ErrorHandler();
    }
    return ErrorHandler.instance;
  }

  async handleDataCollectionError(
    error: Error,
    context: ErrorContext
  ): Promise<void> {
    const dataCollectionError = new DataCollectionError(
      `Data collection failed: ${error.message}`,
      context,
      error
    );

    // Log error locally
    console.warn('Data collection error:', {
      message: dataCollectionError.message,
      context: dataCollectionError.context,
      originalError: error
    });

    // Queue error for potential retry
    this.errorQueue.push({ error: dataCollectionError, context });

    // Try to process error queue
    await this.processErrorQueue();
  }

  private async processErrorQueue(): Promise<void> {
    if (this.isProcessing || this.errorQueue.length === 0) {
      return;
    }

    this.isProcessing = true;

    while (this.errorQueue.length > 0) {
      const { error, context } = this.errorQueue.shift()!;
      
      try {
        await this.attemptErrorRecovery(error, context);
      } catch (recoveryError) {
        console.error('Failed to recover from error:', recoveryError);
        
        // If it's a critical data collection failure, you might want to
        // store it locally or send to an alternative logging service
        this.storeErrorLocally(error, context);
      }
    }

    this.isProcessing = false;
  }

  private async attemptErrorRecovery(
    error: Error,
    context: ErrorContext
  ): Promise<void> {
    let attempts = 0;
    
    while (attempts < this.retryAttempts) {
      try {
        // Try to collect error information for analysis
        if (context.userQuery) {
          await dataCollectionService.collectChatData(
            context.userQuery,
            `Error: ${error.message}`,
            context.sessionId || 'unknown',
            undefined,
            'error-recovery'
          );
        }
        
        return; // Success, exit retry loop
      } catch (retryError) {
        attempts++;
        
        if (attempts >= this.retryAttempts) {
          throw retryError;
        }
        
        // Exponential backoff
        await this.delay(this.retryDelay * Math.pow(2, attempts));
      }
    }
  }

  private storeErrorLocally(error: Error, context: ErrorContext): void {
    try {
      const errorData = {
        error: {
          message: error.message,
          name: error.name,
          stack: error.stack
        },
        context,
        timestamp: new Date().toISOString(),
        retryAttempts: this.retryAttempts
      };

      // Store in localStorage for later retry or manual analysis
      const existingErrors = this.getLocalErrors();
      existingErrors.push(errorData);
      
      // Keep only last 50 errors to avoid storage overflow
      const recentErrors = existingErrors.slice(-50);
      
      localStorage.setItem('dataCollectionErrors', JSON.stringify(recentErrors));
    } catch (storageError) {
      console.error('Failed to store error locally:', storageError);
    }
  }

  public getLocalErrors(): any[] {
    try {
      const stored = localStorage.getItem('dataCollectionErrors');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }

  public clearLocalErrors(): void {
    try {
      localStorage.removeItem('dataCollectionErrors');
    } catch (error) {
      console.warn('Failed to clear local errors:', error);
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Utility method to check if data collection is working
  public async testDataCollection(): Promise<boolean> {
    try {
      return await dataCollectionService.testConnection();
    } catch (error) {
      await this.handleDataCollectionError(error as Error, {
        action: 'test-connection',
        timestamp: new Date()
      });
      return false;
    }
  }

  // Method to manually retry failed operations
  public async retryFailedOperations(): Promise<number> {
    const localErrors = this.getLocalErrors();
    let successCount = 0;

    for (const errorData of localErrors) {
      try {
        if (errorData.context.userQuery) {
          await dataCollectionService.collectChatData(
            errorData.context.userQuery,
            'Retry: Previous collection failed',
            errorData.context.sessionId || 'retry',
            undefined,
            'manual-retry'
          );
          successCount++;
        }
      } catch (retryError) {
        console.warn('Manual retry failed:', retryError);
      }
    }

    if (successCount > 0) {
      this.clearLocalErrors();
    }

    return successCount;
  }
}

export const errorHandler = ErrorHandler.getInstance();