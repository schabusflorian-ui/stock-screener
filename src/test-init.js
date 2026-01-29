// Test database initialization
console.log('Starting database initialization test...');

try {
  const db = require('./database.js');
  console.log('Database module loaded');
  console.log('Database object:', db);
  console.log('Company count:', db.getCompanyCount());
} catch (error) {
  console.error('Error loading database:', error);
  console.error('Stack:', error.stack);
}
