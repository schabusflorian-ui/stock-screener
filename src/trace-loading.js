// Trace what happens when loading database.js
console.log('=== BEFORE requiring database.js ===');

// Intercept console.log
const originalLog = console.log;
const logs = [];
console.log = function(...args) {
  logs.push(args.join(' '));
  originalLog.apply(console, args);
};

console.log('=== REQUIRING database.js ===');
const db = require('./database.js');

console.log('=== AFTER requiring database.js ===');
console.log('Module exports keys:', Object.keys(db));
console.log('Total console.log calls during load:', logs.length);
console.log('\nLogs captured:');
logs.forEach((log, i) => console.log(`  ${i + 1}. ${log}`));

// Restore original console.log
console.log = originalLog;

console.log('\n=== Testing exported functions ===');
console.log('typeof getDatabase:', typeof db.getDatabase);
console.log('typeof getCompany:', typeof db.getCompany);
console.log('typeof getAllCompanies:', typeof db.getAllCompanies);
console.log('typeof getCompanyCount:', typeof db.getCompanyCount);
