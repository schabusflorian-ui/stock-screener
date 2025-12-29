// src/database-migrations/add-analyst-conversations.js
// Creates tables for persisting AI analyst conversations

const Database = require('better-sqlite3');
const path = require('path');

function migrate(dbPath) {
  const db = new Database(dbPath || path.join(__dirname, '../../data/stocks.db'));

  console.log('\n🤖 Creating Analyst Conversation Tables\n');
  console.log('='.repeat(60));

  // Analyst Conversations - stores each conversation session
  db.exec(`
    CREATE TABLE IF NOT EXISTS analyst_conversations (
      id TEXT PRIMARY KEY,
      analyst_id TEXT NOT NULL,
      company_id INTEGER,
      company_symbol TEXT,
      title TEXT,
      summary TEXT,
      message_count INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      metadata TEXT DEFAULT '{}',

      FOREIGN KEY (company_id) REFERENCES companies(id)
    )
  `);
  console.log('  ✓ Created analyst_conversations table');

  // Conversation Messages - stores individual messages
  db.exec(`
    CREATE TABLE IF NOT EXISTS analyst_messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
      content TEXT NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      tokens_used INTEGER DEFAULT 0,
      model TEXT,
      metadata TEXT DEFAULT '{}',

      FOREIGN KEY (conversation_id) REFERENCES analyst_conversations(id) ON DELETE CASCADE
    )
  `);
  console.log('  ✓ Created analyst_messages table');

  // Create indexes
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_conversations_analyst
    ON analyst_conversations(analyst_id);

    CREATE INDEX IF NOT EXISTS idx_conversations_company
    ON analyst_conversations(company_id);

    CREATE INDEX IF NOT EXISTS idx_conversations_symbol
    ON analyst_conversations(company_symbol);

    CREATE INDEX IF NOT EXISTS idx_conversations_updated
    ON analyst_conversations(updated_at DESC);

    CREATE INDEX IF NOT EXISTS idx_messages_conversation
    ON analyst_messages(conversation_id);

    CREATE INDEX IF NOT EXISTS idx_messages_timestamp
    ON analyst_messages(timestamp);
  `);
  console.log('  ✓ Created indexes');

  // Create trigger to update conversation timestamp and message count
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS update_conversation_on_message
    AFTER INSERT ON analyst_messages
    BEGIN
      UPDATE analyst_conversations
      SET updated_at = CURRENT_TIMESTAMP,
          message_count = (
            SELECT COUNT(*) FROM analyst_messages
            WHERE conversation_id = NEW.conversation_id
          )
      WHERE id = NEW.conversation_id;
    END
  `);
  console.log('  ✓ Created update trigger');

  console.log('\n' + '='.repeat(60));
  console.log('✅ Analyst conversation tables created successfully!\n');

  db.close();
}

// Run migration
if (require.main === module) {
  const dbPath = process.argv[2];
  migrate(dbPath);
}

module.exports = { migrate };
