// ESLint configuration for backend (Node.js)
module.exports = {
  env: {
    node: true,
    es2022: true,
    jest: true,
  },
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  extends: ['eslint:recommended'],
  rules: {
    // Error prevention
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    'no-undef': 'error',
    'no-console': ['warn', { allow: ['warn', 'error'] }], // Use logger instead of console.log
    'no-constant-condition': ['error', { checkLoops: false }],

    // Code style (warnings, not errors)
    'semi': ['warn', 'always'],
    'quotes': ['warn', 'single', { avoidEscape: true }],
    'indent': 'off', // Let Prettier handle this
    'comma-dangle': 'off',
    'no-trailing-spaces': 'warn',
    'eol-last': 'warn',

    // Best practices
    'eqeqeq': ['warn', 'smart'],
    'no-var': 'warn',
    'prefer-const': 'warn',
    'no-throw-literal': 'error',
    'no-return-await': 'warn',
    'require-await': 'warn',

    // Async handling
    'no-async-promise-executor': 'error',
    'no-await-in-loop': 'off', // Sometimes intentional for rate limiting

    // Allow some patterns common in this codebase
    'no-empty': ['error', { allowEmptyCatch: true }],
    'no-prototype-builtins': 'off',
    'no-case-declarations': 'warn',  // Allow lexical declarations in case blocks
    'no-useless-escape': 'warn',     // Often intentional in regex patterns
    'no-useless-catch': 'warn',      // May be placeholder for future error handling
  },
  ignorePatterns: [
    'node_modules/',
    'frontend/',
    'python/',
    'python-services/',
    'data/',
    '*.min.js',
    'dist/',
    'build/',
    'coverage_report/',
    'coverage/',
    '.playwright-mcp/',
    'scripts/',  // One-off scripts, less critical
  ],
};
