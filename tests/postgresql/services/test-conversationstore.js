// tests/postgresql/services/test-conversationstore.js
/**
 * PostgreSQL conversion tests for ConversationStore
 */

const { ConversationStore } = require('../../../src/services/conversationStore');
const {
  TestResults,
  testMethod,
  testDatabaseConnection,
  printTestHeader
} = require('../testUtils');

async function runConversationStoreTests() {
  printTestHeader('ConversationStore');
  const results = new TestResults('ConversationStore');

  // Test 1: Database connection
  await testDatabaseConnection(results);

  // Test 2: Service instantiation
  let service;
  await testMethod(results, 'Service instantiation', async () => {
    service = new ConversationStore();
    if (!service) {
      throw new Error('Failed to create service instance');
    }
  });

  if (!service) {
    console.log('\n⚠️  Cannot continue tests - service instantiation failed');
    return results.summary();
  }

  // Test 3: Create conversation
  const testConvId = `test-conv-${Date.now()}`;
  await testMethod(results, 'createConversation() creates conversation', async () => {
    const conv = await service.createConversation(
      testConvId,
      'test-analyst',
      null,
      'AAPL',
      'Test Conversation'
    );
    if (!conv || conv.id !== testConvId) {
      throw new Error('Failed to create conversation');
    }
  });

  // Test 4: Get conversation
  await testMethod(results, 'getConversation() retrieves conversation', async () => {
    const conv = await service.getConversation(testConvId);
    if (!conv || conv.id !== testConvId) {
      throw new Error('Failed to get conversation');
    }
  });

  // Test 5: Add message
  const testMsgId = `test-msg-${Date.now()}`;
  await testMethod(results, 'addMessage() adds message', async () => {
    const result = await service.addMessage(testConvId, {
      id: testMsgId,
      role: 'user',
      content: 'Test message content'
    });
    if (!result) {
      throw new Error('Failed to add message');
    }
  });

  // Test 6: Get conversation with messages
  await testMethod(results, 'getConversation() includes messages', async () => {
    const conv = await service.getConversation(testConvId);
    if (!conv || !Array.isArray(conv.messages) || conv.messages.length === 0) {
      throw new Error('Conversation should have messages');
    }
  });

  // Test 7: Update conversation
  await testMethod(results, 'updateConversation() updates fields', async () => {
    const result = await service.updateConversation(testConvId, {
      title: 'Updated Title',
      summary: 'Test summary'
    });
    if (!result) {
      throw new Error('Failed to update conversation');
    }
  });

  // Test 8: List conversations
  await testMethod(results, 'listConversations() returns list', async () => {
    const convs = await service.listConversations(10);
    if (!Array.isArray(convs)) {
      throw new Error('Expected array of conversations');
    }
  });

  // Test 9: List by company
  await testMethod(results, 'listByCompany() filters by symbol', async () => {
    const convs = await service.listByCompany('AAPL', 10);
    if (!Array.isArray(convs)) {
      throw new Error('Expected array of conversations');
    }
  });

  // Test 10: Get recent messages
  await testMethod(results, 'getRecentMessages() returns messages', async () => {
    const messages = await service.getRecentMessages(testConvId, 5);
    if (!Array.isArray(messages)) {
      throw new Error('Expected array of messages');
    }
  });

  // Test 11: Get stats
  await testMethod(results, 'getStats() returns statistics', async () => {
    const stats = await service.getStats();
    if (!stats || typeof stats.total_conversations === 'undefined') {
      throw new Error('Expected stats object with total_conversations');
    }
  });

  // Test 12: Delete conversation (cleanup)
  await testMethod(results, 'deleteConversation() removes conversation', async () => {
    const result = await service.deleteConversation(testConvId);
    if (!result) {
      throw new Error('Failed to delete conversation');
    }

    // Verify deletion
    const conv = await service.getConversation(testConvId);
    if (conv !== null) {
      throw new Error('Conversation should be deleted');
    }
  });

  return results.summary();
}

// Run if executed directly
if (require.main === module) {
  runConversationStoreTests()
    .then(summary => {
      process.exit(summary.success ? 0 : 1);
    })
    .catch(err => {
      console.error('Test runner error:', err);
      process.exit(1);
    });
}

module.exports = { runConversationStoreTests };
