// test-trends.js
const TrendAnalysis = require('./src/services/trendAnalysis');

const analyzer = new TrendAnalysis();

console.log('\n🔍 TREND ANALYSIS TOOL\n');
console.log('='.repeat(60));

// Test 1: Single company report
console.log('\n1️⃣  SINGLE COMPANY ANALYSIS:\n');
analyzer.generateCompanyReport('AAPL');
analyzer.generateCompanyReport('MSFT');

// Test 2: Compare all companies
console.log('\n2️⃣  COMPARATIVE ANALYSIS:\n');
analyzer.compareCompanies(['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'TSLA']);

// Test 3: Find best trends
console.log('\n3️⃣  BEST TRENDING STOCKS:\n');
analyzer.findBestTrends(2);

console.log('='.repeat(60) + '\n');