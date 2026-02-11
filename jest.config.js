// jest.config.js
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.js'],
  // Skip PostgreSQL-dependent integration tests in CI (they need a migrated test DB)
  testPathIgnorePatterns: [
    '/node_modules/',
    ...(process.env.CI ? [
      'tests/integration/',  // Skip integration tests that need real DB
      'tests/portfolio/',    // Skip portfolio tests that use PostgreSQL
      'tests/factors/',      // Skip factor tests that use PostgreSQL
      'tests/agent/',        // Skip agent tests that use PostgreSQL
      'tests/api/execution.test.js'  // Uses in-memory SQLite; conflicts when CI sets DATABASE_URL=postgres
    ] : [])
  ],
  collectCoverageFrom: [
    'src/services/agent/**/*.js',
    'src/services/trading/**/*.js',
    'src/services/backtesting/**/*.js',
    'src/services/factors/**/*.js',
    'src/services/prism*.js',
    'src/services/dataFusionEngine.js',
    'src/services/qualitativeNarrativeService.js',
    'src/services/triangulatedValuationService.js',
    'src/api/routes/**/*.js',
    '!**/node_modules/**',
    '!**/index.js'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  verbose: true,
  testTimeout: 30000,
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  modulePathIgnorePatterns: ['<rootDir>/node_modules/'],
};
