// tests/middleware/validation.test.js
// Tests for input validation middleware - validates security against injection attacks

const { validate, schemas, fields } = require('../../src/middleware/validation');

describe('Validation Middleware', () => {
  describe('Field Validators', () => {
    test('symbol field should reject SQL injection attempts', () => {
      const testCases = [
        "'; DROP TABLE companies; --",
        "AAPL' OR '1'='1",
        "<script>alert('xss')</script>",
        'AAPL; DELETE FROM users',
        'UNION SELECT * FROM users'
      ];

      testCases.forEach(maliciousInput => {
        const result = fields.symbol.validate(maliciousInput);
        expect(result.error).toBeDefined();
      });
    });

    test('symbol field should accept valid symbols', () => {
      const validSymbols = ['AAPL', 'GOOGL', 'BRK.B', 'BF-B', 'MSFT'];

      validSymbols.forEach(symbol => {
        const result = fields.symbol.validate(symbol);
        expect(result.error).toBeUndefined();
        expect(result.value).toBe(symbol);
      });
    });

    test('name field should reject dangerous patterns', () => {
      const dangerousNames = [
        "<script>alert('xss')</script>",
        "admin'; DROP TABLE--",
        'test\x00null',
        '../../../etc/passwd'
      ];

      dangerousNames.forEach(name => {
        const result = fields.name.validate(name);
        expect(result.error).toBeDefined();
      });
    });

    test('name field should accept valid names', () => {
      const validNames = ['My Portfolio', 'Test-Strategy_1', 'Growth Portfolio 2024'];

      validNames.forEach(name => {
        const result = fields.name.validate(name);
        expect(result.error).toBeUndefined();
      });
    });

    test('percentage field should be between 0 and 1', () => {
      expect(fields.percentage.validate(-0.1).error).toBeDefined();
      expect(fields.percentage.validate(1.5).error).toBeDefined();
      expect(fields.percentage.validate(0.5).error).toBeUndefined();
      expect(fields.percentage.validate(0).error).toBeUndefined();
      expect(fields.percentage.validate(1).error).toBeUndefined();
    });

    test('amount field should be positive and reasonable', () => {
      expect(fields.amount.validate(-100).error).toBeDefined();
      expect(fields.amount.validate(0).error).toBeDefined();
      expect(fields.amount.validate(1000000001).error).toBeDefined(); // Over 1B
      expect(fields.amount.validate(1000000).error).toBeUndefined();
    });

    test('limit field should have reasonable bounds', () => {
      expect(fields.limit.validate(0).error).toBeDefined();
      expect(fields.limit.validate(1001).error).toBeDefined();
      expect(fields.limit.validate(50).error).toBeUndefined();
    });
  });

  describe('Agent Schemas', () => {
    test('createAgent should require name and strategy_type', () => {
      const result = schemas.createAgent.validate({});
      expect(result.error).toBeDefined();

      const validAgent = schemas.createAgent.validate({
        name: 'Test Agent',
        strategy_type: 'hybrid'
      });
      expect(validAgent.error).toBeUndefined();
    });

    test('createAgent should validate weight ranges', () => {
      const invalidWeights = schemas.createAgent.validate({
        name: 'Test Agent',
        strategy_type: 'hybrid',
        technical_weight: 1.5 // Over 100%
      });
      expect(invalidWeights.error).toBeDefined();
    });

    test('createAgent should strip unknown fields when using middleware options', () => {
      // Note: stripUnknown is applied by the middleware, not the schema itself
      const result = schemas.createAgent.validate({
        name: 'Test Agent',
        strategy_type: 'hybrid',
        malicious_field: 'should be stripped'
      }, { stripUnknown: true });
      expect(result.error).toBeUndefined();
      expect(result.value.malicious_field).toBeUndefined();
    });

    test('updateAgent should accept partial updates', () => {
      const result = schemas.updateAgent.validate({
        name: 'Updated Name'
      });
      expect(result.error).toBeUndefined();
    });
  });

  describe('Portfolio Schemas', () => {
    test('createPortfolio should require name', () => {
      const result = schemas.createPortfolio.validate({});
      expect(result.error).toBeDefined();
    });

    test('createPortfolio should default initial_cash', () => {
      const result = schemas.createPortfolio.validate({
        name: 'Test Portfolio'
      });
      expect(result.error).toBeUndefined();
      expect(result.value.initial_cash).toBe(100000);
    });

    test('createPortfolio should validate currency format', () => {
      const valid = schemas.createPortfolio.validate({
        name: 'Test',
        currency: 'USD'
      });
      expect(valid.error).toBeUndefined();

      const invalid = schemas.createPortfolio.validate({
        name: 'Test',
        currency: 'INVALID'
      });
      expect(invalid.error).toBeDefined();
    });
  });

  describe('Execution Schemas', () => {
    test('submitOrder should require all mandatory fields', () => {
      const result = schemas.submitOrder.validate({});
      expect(result.error).toBeDefined();
    });

    test('submitOrder should validate order types', () => {
      const validOrder = schemas.submitOrder.validate({
        symbol: 'AAPL',
        side: 'BUY',
        orderType: 'MARKET',
        quantity: 100
      });
      expect(validOrder.error).toBeUndefined();

      const invalidOrder = schemas.submitOrder.validate({
        symbol: 'AAPL',
        side: 'BUY',
        orderType: 'INVALID_TYPE',
        quantity: 100
      });
      expect(invalidOrder.error).toBeDefined();
    });

    test('submitOrder should require limitPrice for LIMIT orders', () => {
      const missingLimit = schemas.submitOrder.validate({
        symbol: 'AAPL',
        side: 'BUY',
        orderType: 'LIMIT',
        quantity: 100
      });
      expect(missingLimit.error).toBeDefined();

      const withLimit = schemas.submitOrder.validate({
        symbol: 'AAPL',
        side: 'BUY',
        orderType: 'LIMIT',
        quantity: 100,
        limitPrice: 150.00
      });
      expect(withLimit.error).toBeUndefined();
    });

    test('submitOrder should validate quantity bounds', () => {
      const tooLarge = schemas.submitOrder.validate({
        symbol: 'AAPL',
        side: 'BUY',
        orderType: 'MARKET',
        quantity: 1000001 // Over 1M
      });
      expect(tooLarge.error).toBeDefined();

      const negative = schemas.submitOrder.validate({
        symbol: 'AAPL',
        side: 'BUY',
        orderType: 'MARKET',
        quantity: -100
      });
      expect(negative.error).toBeDefined();
    });
  });

  describe('Validate Middleware Factory', () => {
    test('should validate request body by default', () => {
      const schema = schemas.createAgent;
      const middleware = validate(schema);

      const req = {
        body: { name: 'Test', strategy_type: 'hybrid' }
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      const next = jest.fn();

      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    test('should return 400 for invalid data', () => {
      const schema = schemas.createAgent;
      const middleware = validate(schema);

      const req = {
        body: { invalid: 'data' } // Missing required fields
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      const next = jest.fn();

      middleware(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
    });

    test('should validate query params when specified', () => {
      const schema = schemas.screeningQuery;
      const middleware = validate(schema, 'query');

      const req = {
        query: { limit: 50, offset: 0 }
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      const next = jest.fn();

      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    test('should sanitize input values', () => {
      const schema = schemas.createPortfolio;
      const middleware = validate(schema);

      const req = {
        body: {
          name: 'Test Portfolio',
          extra_field: 'should be stripped'
        }
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      const next = jest.fn();

      middleware(req, res, next);

      expect(req.body.extra_field).toBeUndefined();
      expect(req.body.name).toBe('Test Portfolio');
    });
  });
});
