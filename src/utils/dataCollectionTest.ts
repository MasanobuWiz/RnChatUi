import { dataCollectionService } from '../services/dataCollection';
import { DataTagger, createDataTagger } from './dataTagger';
import { errorHandler } from './errorHandler';
import { appConfig } from '../services/config';

export interface TestResult {
  success: boolean;
  message: string;
  details?: any;
}

export class DataCollectionTester {
  private tagger: DataTagger;

  constructor(userId?: string) {
    this.tagger = createDataTagger(userId);
  }

  async runAllTests(): Promise<TestResult[]> {
    const results: TestResult[] = [];

    console.log('🧪 Starting data collection tests...');

    // Test 1: Configuration validation
    results.push(await this.testConfiguration());

    // Test 2: S3 connection
    results.push(await this.testS3Connection());

    // Test 3: Data tagging
    results.push(await this.testDataTagging());

    // Test 4: Chat data collection
    results.push(await this.testChatDataCollection());

    // Test 5: Session data collection
    results.push(await this.testSessionDataCollection());

    // Test 6: Error handling
    results.push(await this.testErrorHandling());

    console.log('✅ Data collection tests completed');
    
    return results;
  }

  private async testConfiguration(): Promise<TestResult> {
    try {
      const config = dataCollectionService.getConfig();
      
      if (!config.enabled) {
        return {
          success: true,
          message: 'Data collection is disabled',
          details: config
        };
      }

      const requiredFields = ['bucket', 'tagPrefix', 'categories'];
      const missingFields = requiredFields.filter(field => !config[field as keyof typeof config]);

      if (missingFields.length > 0) {
        return {
          success: false,
          message: `Missing configuration fields: ${missingFields.join(', ')}`,
          details: config
        };
      }

      return {
        success: true,
        message: 'Configuration is valid',
        details: {
          bucket: config.bucket,
          enabled: config.enabled,
          tagPrefix: config.tagPrefix
        }
      };
    } catch (error) {
      return {
        success: false,
        message: `Configuration test failed: ${(error as Error).message}`,
        details: error
      };
    }
  }

  private async testS3Connection(): Promise<TestResult> {
    try {
      const connectionSuccess = await dataCollectionService.testConnection();
      
      return {
        success: connectionSuccess,
        message: connectionSuccess 
          ? 'S3 connection successful'
          : 'S3 connection failed',
        details: {
          bucket: appConfig.dataCollection.bucket,
          region: appConfig.dataCollection.region
        }
      };
    } catch (error) {
      return {
        success: false,
        message: `S3 connection test failed: ${(error as Error).message}`,
        details: error
      };
    }
  }

  private async testDataTagging(): Promise<TestResult> {
    try {
      const userMessage = this.tagger.tagMessage('Test user message', true);
      const aiMessage = this.tagger.tagMessage('Test AI response', false);

      // Validate message structure
      const requiredMessageFields = ['id', 'text', 'isUser', 'timestamp'];
      const userMessageValid = requiredMessageFields.every(field => 
        userMessage[field as keyof typeof userMessage] !== undefined
      );
      const aiMessageValid = requiredMessageFields.every(field => 
        aiMessage[field as keyof typeof aiMessage] !== undefined
      );

      if (!userMessageValid || !aiMessageValid) {
        return {
          success: false,
          message: 'Message tagging failed validation',
          details: { userMessage, aiMessage }
        };
      }

      // Test session creation
      const session = this.tagger.createChatSession(userMessage);
      const sessionWithMessages = this.tagger.addMessageToSession(session, aiMessage);

      // Test categorization
      const category = this.tagger.categorizeMessage('How do I use this feature?');
      
      // Test data collection tags
      const tags = this.tagger.generateDataCollectionTags(
        'Test query',
        'Test response',
        500
      );

      return {
        success: true,
        message: 'Data tagging tests passed',
        details: {
          messageCount: sessionWithMessages.messages.length,
          category,
          tagCount: Object.keys(tags).length,
          sessionId: session.sessionId
        }
      };
    } catch (error) {
      return {
        success: false,
        message: `Data tagging test failed: ${(error as Error).message}`,
        details: error
      };
    }
  }

  private async testChatDataCollection(): Promise<TestResult> {
    try {
      const testQuery = 'This is a test query for data collection';
      const testResponse = 'This is a test response from the AI';
      const sessionId = this.tagger.getSessionId();

      const success = await dataCollectionService.collectChatData(
        testQuery,
        testResponse,
        sessionId,
        1500,
        'test-model'
      );

      return {
        success,
        message: success 
          ? 'Chat data collection successful'
          : 'Chat data collection failed',
        details: {
          sessionId,
          queryLength: testQuery.length,
          responseLength: testResponse.length
        }
      };
    } catch (error) {
      return {
        success: false,
        message: `Chat data collection test failed: ${(error as Error).message}`,
        details: error
      };
    }
  }

  private async testSessionDataCollection(): Promise<TestResult> {
    try {
      const userMessage = this.tagger.tagMessage('Test session message', true);
      const aiMessage = this.tagger.tagMessage('Test session response', false);
      
      const session = this.tagger.createChatSession(userMessage);
      const finalSession = this.tagger.addMessageToSession(session, aiMessage);

      const success = await dataCollectionService.collectSessionData(finalSession);

      return {
        success,
        message: success 
          ? 'Session data collection successful'
          : 'Session data collection failed',
        details: {
          sessionId: finalSession.sessionId,
          messageCount: finalSession.messages.length,
          startTime: finalSession.startTime
        }
      };
    } catch (error) {
      return {
        success: false,
        message: `Session data collection test failed: ${(error as Error).message}`,
        details: error
      };
    }
  }

  private async testErrorHandling(): Promise<TestResult> {
    try {
      // Test error handler functionality
      const canTestConnection = await errorHandler.testDataCollection();
      
      // Get any stored errors
      const localErrors = errorHandler.getLocalErrors();
      
      // Test manual retry functionality
      const retriedCount = await errorHandler.retryFailedOperations();

      return {
        success: true,
        message: 'Error handling tests completed',
        details: {
          connectionTest: canTestConnection,
          storedErrorCount: localErrors.length,
          retriedOperations: retriedCount
        }
      };
    } catch (error) {
      return {
        success: false,
        message: `Error handling test failed: ${(error as Error).message}`,
        details: error
      };
    }
  }

  async generateTestReport(results: TestResult[]): Promise<string> {
    const totalTests = results.length;
    const passedTests = results.filter(r => r.success).length;
    const failedTests = totalTests - passedTests;

    const report = `
# Data Collection Test Report
Generated: ${new Date().toISOString()}

## Summary
- Total Tests: ${totalTests}
- Passed: ${passedTests}
- Failed: ${failedTests}
- Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%

## Test Results
${results.map((result, index) => `
### Test ${index + 1}: ${result.success ? '✅ PASS' : '❌ FAIL'}
**Message:** ${result.message}
${result.details ? `**Details:** ${JSON.stringify(result.details, null, 2)}` : ''}
`).join('\n')}

## Configuration
- Environment: ${appConfig.environment}
- Data Collection Enabled: ${appConfig.dataCollection.enabled}
- Bucket: ${appConfig.dataCollection.bucket}
- Region: ${appConfig.dataCollection.region}

## Recommendations
${this.generateRecommendations(results)}
`;

    return report;
  }

  private generateRecommendations(results: TestResult[]): string {
    const failedResults = results.filter(r => !r.success);
    
    if (failedResults.length === 0) {
      return '- All tests passed! Data collection is working correctly.';
    }

    const recommendations = [
      '- Review failed tests and address configuration issues.',
      '- Ensure AWS credentials are properly configured.',
      '- Verify S3 bucket permissions and accessibility.',
      '- Check network connectivity to AWS services.'
    ];

    if (failedResults.some(r => r.message.includes('S3'))) {
      recommendations.push('- Verify S3 bucket exists and has proper IAM permissions.');
    }

    if (failedResults.some(r => r.message.includes('configuration'))) {
      recommendations.push('- Review environment variables and configuration settings.');
    }

    return recommendations.map(rec => rec).join('\n');
  }
}

export const runDataCollectionTests = async (userId?: string): Promise<void> => {
  const tester = new DataCollectionTester(userId);
  const results = await tester.runAllTests();
  const report = await tester.generateTestReport(results);
  
  console.log(report);
  
  // Store test results for analysis
  try {
    localStorage.setItem('dataCollectionTestResults', JSON.stringify({
      timestamp: new Date().toISOString(),
      results,
      report
    }));
  } catch (error) {
    console.warn('Failed to store test results:', error);
  }
};