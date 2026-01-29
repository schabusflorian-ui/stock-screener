// fix-schema.js
const SchemaManager = require('./src/utils/schemaManager');

console.log('\n🔧 ROBUST SCHEMA FIX\n');
console.log('='.repeat(60));

const manager = new SchemaManager();

// Automatically add all missing columns
manager.ensureCalculatedMetricsSchema();

// Show final schema
manager.printSchema('calculated_metrics');

console.log('='.repeat(60));
console.log('✅ Schema is now complete and ready to use!');
console.log('='.repeat(60) + '\n');