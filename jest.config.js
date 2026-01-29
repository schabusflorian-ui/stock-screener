// jest.config.js
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.js'],
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
