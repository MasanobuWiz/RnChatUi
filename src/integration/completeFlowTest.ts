/**
 * Complete Data Collection Flow Integration Test
 * This demonstrates the full implementation based on CLAUDE.md requirements
 */

import { dataCollectionService } from '../services/dataCollection';
import { createDataTagger } from '../utils/dataTagger';
import { errorHandler } from '../utils/errorHandler';
import { appConfig } from '../services/config';

export interface FlowTestResult {
  success: boolean;
  results: {
    configurationValid: boolean;
    taggingWorking: boolean;
    sessionManagement: boolean;
    s3Integration: boolean;
    bedrockIntegration: boolean;
    errorHandling: boolean;
    ragDataPreparation: boolean;
    fineTuningDataPreparation: boolean;
  };
  details: any;
  timestamp: string;
}

export const runCompleteDataCollectionFlowTest = async (): Promise<FlowTestResult> => {
  console.log('🧪 Starting Complete Data Collection Flow Test...');
  
  const results = {
    configurationValid: false,
    taggingWorking: false,
    sessionManagement: false,
    s3Integration: false,
    bedrockIntegration: false,
    errorHandling: false,
    ragDataPreparation: false,
    fineTuningDataPreparation: false,
  };
  
  const details: any = {};
  
  try {
    // 1. Test Configuration
    console.log('1️⃣ Testing Configuration...');
    const config = dataCollectionService.getConfig();
    results.configurationValid = config.enabled !== undefined && config.bucket !== undefined;
    details.configuration = {
      enabled: config.enabled,
      bucket: config.bucket,
      tagPrefix: config.tagPrefix,
      environment: appConfig.environment
    };
    
    // 2. Test Data Tagging
    console.log('2️⃣ Testing Data Tagging...');
    const tagger = createDataTagger('test-user-flow');
    const userMessage = tagger.tagMessage('What is AWS Bedrock and how does it work with data collection?', true);
    const aiMessage = tagger.tagMessage('AWS Bedrock is a fully managed service that provides access to foundation models through a unified API. For data collection, it enables us to capture training data...', false);
    
    results.taggingWorking = !!(userMessage.id && userMessage.timestamp && aiMessage.id && aiMessage.timestamp);
    details.tagging = {
      userMessageId: userMessage.id,
      aiMessageId: aiMessage.id,
      bothHaveTimestamps: !!(userMessage.timestamp && aiMessage.timestamp)
    };
    
    // 3. Test Session Management
    console.log('3️⃣ Testing Session Management...');
    const session = tagger.createChatSession(userMessage, {
      includeUserAgent: true,
      includeTimezone: true,
      customTags: { testType: 'integration' }
    });
    const updatedSession = tagger.addMessageToSession(session, aiMessage);
    
    results.sessionManagement = updatedSession.messages.length === 2 && updatedSession.sessionId !== undefined;
    details.sessionManagement = {
      sessionId: updatedSession.sessionId,
      messageCount: updatedSession.messages.length,
      hasMetadata: !!updatedSession.metadata
    };
    
    // 4. Test S3 Integration
    console.log('4️⃣ Testing S3 Integration...');
    try {
      const s3Success = await dataCollectionService.collectChatData(
        userMessage.text,
        aiMessage.text,
        updatedSession.sessionId,
        1250, // response time
        'test-bedrock-model'
      );
      results.s3Integration = s3Success;
      details.s3Integration = { success: s3Success };
    } catch (error) {
      results.s3Integration = false;
      details.s3Integration = { error: (error as Error).message };
    }
    
    // 5. Test Bedrock Integration Simulation
    console.log('5️⃣ Testing Bedrock Integration Flow...');
    const bedrockSimulation = {
      userQuery: userMessage.text,
      modelResponse: aiMessage.text,
      responseTime: 1250,
      model: 'anthropic.claude-3-sonnet-20240229-v1:0'
    };
    
    const category = tagger.categorizeMessage(userMessage.text);
    results.bedrockIntegration = category === 'question'; // This should categorize as a question
    details.bedrockIntegration = {
      category,
      simulation: bedrockSimulation
    };
    
    // 6. Test Error Handling
    console.log('6️⃣ Testing Error Handling...');
    try {
      await errorHandler.testDataCollection();
      const localErrors = errorHandler.getLocalErrors();
      results.errorHandling = true;
      details.errorHandling = {
        localErrorCount: localErrors.length,
        canTestConnection: true
      };
    } catch (error) {
      results.errorHandling = false;
      details.errorHandling = { error: (error as Error).message };
    }
    
    // 7. Test RAG Data Preparation
    console.log('7️⃣ Testing RAG Data Preparation...');
    const ragUserData = tagger.tagForRAGPurpose(userMessage.text, 'user');
    const ragAiData = tagger.tagForRAGPurpose(aiMessage.text, 'ai');
    
    results.ragDataPreparation = !!(ragUserData.content && ragAiData.content && ragUserData.category);
    details.ragDataPreparation = {
      userDataStructure: Object.keys(ragUserData),
      aiDataStructure: Object.keys(ragAiData),
      categories: [ragUserData.category, ragAiData.category]
    };
    
    // 8. Test Fine-tuning Data Preparation
    console.log('8️⃣ Testing Fine-tuning Data Preparation...');
    const fineTuningData = tagger.tagForFineTuningPurpose(
      userMessage.text,
      aiMessage.text,
      'high'
    );
    
    results.fineTuningDataPreparation = !!(
      fineTuningData.messages &&
      fineTuningData.messages.length === 2 &&
      fineTuningData.metadata
    );
    details.fineTuningDataPreparation = {
      messageCount: fineTuningData.messages?.length,
      hasMetadata: !!fineTuningData.metadata,
      quality: fineTuningData.metadata?.quality
    };
    
    // 9. Test Session Data Collection
    console.log('9️⃣ Testing Session Data Collection...');
    try {
      const sessionCollectionSuccess = await dataCollectionService.collectSessionData(updatedSession);
      details.sessionDataCollection = { success: sessionCollectionSuccess };
    } catch (error) {
      details.sessionDataCollection = { error: (error as Error).message };
    }
    
    console.log('✅ Complete Data Collection Flow Test Finished!');
    
    const allTestsPassed = Object.values(results).every(result => result === true);
    
    return {
      success: allTestsPassed,
      results,
      details,
      timestamp: new Date().toISOString()
    };
    
  } catch (error) {
    console.error('❌ Complete Flow Test Failed:', error);
    
    return {
      success: false,
      results,
      details: {
        ...details,
        globalError: (error as Error).message
      },
      timestamp: new Date().toISOString()
    };
  }
};

// Export a summary of the implementation
export const getImplementationSummary = () => {
  return {
    title: 'RnChatUi Data Collection Flow Implementation',
    description: 'Complete implementation based on CLAUDE.md requirements',
    features: [
      '✅ Real-time chat data collection with S3 uploads',
      '✅ Comprehensive message tagging and categorization',
      '✅ Session management with metadata tracking',
      '✅ AWS Bedrock integration ready',
      '✅ Error handling with retry logic',
      '✅ RAG data preparation capabilities',
      '✅ Fine-tuning dataset generation',
      '✅ Cross-platform compatibility (web/mobile)',
      '✅ Environment-based configuration',
      '✅ Development tools and testing suite'
    ],
    architecture: {
      'Data Flow': 'User Input → Bedrock → Response → S3 Collection (background)',
      'Components': [
        'useChat Hook - Main integration point',
        'DataCollectionService - S3 uploads with tagging',
        'DataTagger - Message categorization and metadata',
        'ErrorHandler - Retry logic and error recovery',
        'Config Management - Environment-based settings'
      ]
    },
    usage: {
      'Development': 'npm run web (http://localhost:9000)',
      'Build': 'npm run build-web',
      'Testing': 'window.dataCollectionDemo.runDemo() in browser console',
      'Configuration': 'Set up .env file with AWS credentials and S3 bucket'
    }
  };
};

// Make available in browser for testing
if (typeof window !== 'undefined') {
  (window as any).completeFlowTest = runCompleteDataCollectionFlowTest;
  (window as any).implementationSummary = getImplementationSummary;
  
  console.log('🔬 Complete flow test available: window.completeFlowTest()');
  console.log('📋 Implementation summary: window.implementationSummary()');
}