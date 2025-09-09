import { runDataCollectionTests } from '../utils/dataCollectionTest';
import { dataCollectionService } from '../services/dataCollection';
import { createDataTagger } from '../utils/dataTagger';
import { errorHandler } from '../utils/errorHandler';

/**
 * Demo script to test the data collection flow
 * This can be imported and run in the browser console or during app startup
 */
export const runDataCollectionDemo = async () => {
  console.log('🚀 Starting Data Collection Demo...');
  
  try {
    // 1. Test configuration
    console.log('\n1. Testing Configuration...');
    const config = dataCollectionService.getConfig();
    console.log('Config:', config);
    
    // 2. Test data tagger
    console.log('\n2. Testing Data Tagger...');
    const tagger = createDataTagger('demo-user-123');
    const userMessage = tagger.tagMessage('Hello, how does data collection work?', true);
    const aiMessage = tagger.tagMessage('Data collection works by capturing and tagging chat interactions...', false);
    
    console.log('User Message:', userMessage);
    console.log('AI Message:', aiMessage);
    
    // 3. Test session creation
    console.log('\n3. Testing Session Creation...');
    const session = tagger.createChatSession(userMessage, {
      includeUserAgent: true,
      includeTimezone: true
    });
    const updatedSession = tagger.addMessageToSession(session, aiMessage);
    
    console.log('Session:', {
      id: updatedSession.sessionId,
      messageCount: updatedSession.messages.length,
      startTime: updatedSession.startTime
    });
    
    // 4. Test data collection tags
    console.log('\n4. Testing Data Collection Tags...');
    const tags = tagger.generateDataCollectionTags(
      userMessage.text,
      aiMessage.text,
      1500
    );
    console.log('Generated Tags:', tags);
    
    // 5. Test categorization
    console.log('\n5. Testing Message Categorization...');
    const testQueries = [
      'How do I write code?',
      'What is the error here?',
      'Can you explain this concept?',
      'Hello there!'
    ];
    
    testQueries.forEach(query => {
      const category = tagger.categorizeMessage(query);
      console.log(`"${query}" → Category: ${category}`);
    });
    
    // 6. Test data for RAG and fine-tuning
    console.log('\n6. Testing RAG and Fine-tuning Data Preparation...');
    const ragData = tagger.tagForRAGPurpose(userMessage.text, 'user');
    const fineTuningData = tagger.tagForFineTuningPurpose(
      userMessage.text,
      aiMessage.text,
      'high'
    );
    
    console.log('RAG Data Sample:', ragData);
    console.log('Fine-tuning Data Sample:', fineTuningData);
    
    // 7. Test error handling
    console.log('\n7. Testing Error Handling...');
    const localErrors = errorHandler.getLocalErrors();
    console.log(`Local errors stored: ${localErrors.length}`);
    
    // 8. Test session export
    console.log('\n8. Testing Session Export...');
    const exportedSession = tagger.exportSessionForAnalysis(updatedSession);
    console.log('Exported Session Analysis (first 200 chars):', 
      exportedSession.substring(0, 200) + '...'
    );
    
    // 9. Run comprehensive tests (only if config allows)
    if (config.enabled) {
      console.log('\n9. Running Comprehensive Tests...');
      await runDataCollectionTests('demo-user-123');
    } else {
      console.log('\n9. Skipping S3 tests (data collection disabled)');
    }
    
    console.log('\n✅ Data Collection Demo completed successfully!');
    
    return {
      success: true,
      sessionId: updatedSession.sessionId,
      messageCount: updatedSession.messages.length,
      tagsGenerated: Object.keys(tags).length,
      configEnabled: config.enabled
    };
    
  } catch (error) {
    console.error('❌ Data Collection Demo failed:', error);
    return {
      success: false,
      error: (error as Error).message
    };
  }
};

/**
 * Simulate a chat interaction with data collection
 */
export const simulateChatInteraction = async (
  userQuery: string = 'How does AWS Bedrock work?',
  aiResponse: string = 'AWS Bedrock is a fully managed service that makes foundation models available...'
) => {
  console.log('🎭 Simulating Chat Interaction...');
  
  try {
    const tagger = createDataTagger('simulation-user');
    const startTime = Date.now();
    
    // Create session
    const session = tagger.createChatSession(undefined, {
      includeUserAgent: true,
      customTags: { simulation: 'true' }
    });
    
    // Tag messages
    const userMessage = tagger.tagMessage(userQuery, true);
    const aiMessage = tagger.tagMessage(aiResponse, false);
    
    // Update session
    let updatedSession = tagger.addMessageToSession(session, userMessage);
    updatedSession = tagger.addMessageToSession(updatedSession, aiMessage);
    
    const responseTime = Date.now() - startTime;
    
    // Attempt data collection (will work if S3 is configured)
    const collectionSuccess = await dataCollectionService.collectChatData(
      userQuery,
      aiResponse,
      updatedSession.sessionId,
      responseTime,
      'simulation-model'
    );
    
    console.log('Simulation Results:', {
      sessionId: updatedSession.sessionId,
      responseTime,
      collectionSuccess,
      messageCount: updatedSession.messages.length
    });
    
    return {
      sessionId: updatedSession.sessionId,
      collectionSuccess,
      session: updatedSession
    };
    
  } catch (error) {
    console.error('Simulation failed:', error);
    throw error;
  }
};

// Export for browser console usage
if (typeof window !== 'undefined') {
  (window as any).dataCollectionDemo = {
    runDemo: runDataCollectionDemo,
    simulateChat: simulateChatInteraction,
    testConnection: () => errorHandler.testDataCollection(),
    getLocalErrors: () => errorHandler.getLocalErrors(),
    clearLocalErrors: () => errorHandler.clearLocalErrors()
  };
  
  console.log('📋 Data collection demo functions available globally:');
  console.log('- window.dataCollectionDemo.runDemo()');
  console.log('- window.dataCollectionDemo.simulateChat()');
  console.log('- window.dataCollectionDemo.testConnection()');
  console.log('- window.dataCollectionDemo.getLocalErrors()');
  console.log('- window.dataCollectionDemo.clearLocalErrors()');
}