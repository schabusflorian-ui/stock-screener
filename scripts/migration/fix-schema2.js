// fix-schema.js
const db = require('./src/database');
const database = db.getDatabase();

console.log('🔧 Adding missing fiscal_year column...\n');

try {
  database.exec(`
    ALTER TABLE calculated_metrics ADD COLUMN fiscal_year INTEGER;
  `);
  console.log('✅ Column added successfully!\n');
} catch (error) {
  if (error.message.includes('duplicate column')) {
    console.log('✅ Column already exists!\n');
  } else {
    console.error('❌ Error:', error.message);
  }
}