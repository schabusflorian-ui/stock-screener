// src/services/factors/factorFormulaParser.js
// Parse and evaluate user-defined factor formulas
// Supports arithmetic, functions, and metric references

/**
 * Token types for lexer
 */
const TokenType = {
  NUMBER: 'NUMBER',
  METRIC: 'METRIC',
  OPERATOR: 'OPERATOR',
  FUNCTION: 'FUNCTION',
  LPAREN: 'LPAREN',
  RPAREN: 'RPAREN',
  COMMA: 'COMMA',
  EOF: 'EOF'
};

/**
 * Supported functions and their implementations
 */
const FUNCTIONS = {
  log: Math.log,
  log10: Math.log10,
  sqrt: Math.sqrt,
  abs: Math.abs,
  sign: Math.sign,
  floor: Math.floor,
  ceil: Math.ceil,
  round: Math.round,
  max: Math.max,
  min: Math.min,
  pow: Math.pow,
  exp: Math.exp,
  // Custom functions
  zscore: (value, mean, std) => std === 0 ? 0 : (value - mean) / std,
  winsorize: (value, lower, upper) => Math.max(lower, Math.min(upper, value)),
  // Conditional
  if: (condition, trueVal, falseVal) => condition ? trueVal : falseVal,
  ifnan: (value, fallback) => isNaN(value) || value === null ? fallback : value,
  // Financial
  growth: (current, previous) => previous === 0 ? 0 : (current - previous) / Math.abs(previous),
  ratio: (numerator, denominator) => denominator === 0 ? null : numerator / denominator
};

const FUNCTION_ARITIES = {
  log: 1, log10: 1, sqrt: 1, abs: 1, sign: 1, floor: 1, ceil: 1, round: 1, exp: 1,
  max: 2, min: 2, pow: 2,
  zscore: 3, winsorize: 3,
  if: 3, ifnan: 2,
  growth: 2, ratio: 2
};

/**
 * Tokenize a formula string
 */
function tokenize(formula) {
  const tokens = [];
  let i = 0;
  const input = formula.replace(/\s+/g, ' ').trim();

  // Early validation for common edge cases
  if (!input) {
    throw new Error('Formula cannot be empty');
  }

  // Check for unbalanced parentheses
  let parenCount = 0;
  for (const c of input) {
    if (c === '(') parenCount++;
    if (c === ')') parenCount--;
    if (parenCount < 0) {
      throw new Error('Unbalanced parentheses: unexpected closing parenthesis');
    }
  }
  if (parenCount !== 0) {
    throw new Error('Unbalanced parentheses: missing closing parenthesis');
  }

  while (i < input.length) {
    const char = input[i];

    // Skip whitespace
    if (char === ' ') {
      i++;
      continue;
    }

    // Numbers (including decimals)
    if (/[0-9.]/.test(char)) {
      let num = '';
      const startPos = i;
      while (i < input.length && /[0-9.eE+-]/.test(input[i])) {
        // Handle scientific notation carefully
        if ((input[i] === '+' || input[i] === '-') && num.length > 0 && !/[eE]/.test(num[num.length - 1])) {
          break;
        }
        num += input[i];
        i++;
      }
      const parsed = parseFloat(num);
      if (isNaN(parsed)) {
        throw new Error(`Invalid number '${num}' at position ${startPos}`);
      }
      tokens.push({ type: TokenType.NUMBER, value: parsed });
      continue;
    }

    // Operators
    if (['+', '-', '*', '/', '^', '%', '>', '<', '=', '!'].includes(char)) {
      let op = char;
      // Handle two-character operators
      if (i + 1 < input.length) {
        const next = input[i + 1];
        if ((char === '>' || char === '<' || char === '=' || char === '!') && next === '=') {
          op += next;
          i++;
        } else if ((char === '&' && next === '&') || (char === '|' && next === '|')) {
          op += next;
          i++;
        }
      }
      // Check for consecutive operators (except unary minus/plus)
      const lastToken = tokens[tokens.length - 1];
      if (lastToken && lastToken.type === TokenType.OPERATOR &&
          !['-', '+'].includes(op)) {
        throw new Error(`Unexpected operator '${op}' after '${lastToken.value}' at position ${i}`);
      }
      tokens.push({ type: TokenType.OPERATOR, value: op });
      i++;
      continue;
    }

    // Parentheses
    if (char === '(') {
      tokens.push({ type: TokenType.LPAREN, value: '(' });
      i++;
      continue;
    }
    if (char === ')') {
      tokens.push({ type: TokenType.RPAREN, value: ')' });
      i++;
      continue;
    }

    // Comma
    if (char === ',') {
      tokens.push({ type: TokenType.COMMA, value: ',' });
      i++;
      continue;
    }

    // Identifiers (metrics or functions)
    if (/[a-zA-Z_]/.test(char)) {
      let ident = '';
      while (i < input.length && /[a-zA-Z0-9_]/.test(input[i])) {
        ident += input[i];
        i++;
      }
      // Check if it's a function
      if (FUNCTIONS.hasOwnProperty(ident.toLowerCase())) {
        tokens.push({ type: TokenType.FUNCTION, value: ident.toLowerCase() });
      } else {
        tokens.push({ type: TokenType.METRIC, value: ident.toLowerCase() });
      }
      continue;
    }

    // Provide helpful error messages for common mistakes
    const context = input.substring(Math.max(0, i - 5), Math.min(input.length, i + 5));
    if (char === '[' || char === ']') {
      throw new Error(`Square brackets are not supported. Use parentheses () instead. Near: '${context}'`);
    }
    if (char === '{' || char === '}') {
      throw new Error(`Curly braces are not supported. Use parentheses () instead. Near: '${context}'`);
    }
    if (char === ';') {
      throw new Error(`Semicolons are not supported. Use separate formulas or commas in functions. Near: '${context}'`);
    }
    if (char === ':') {
      throw new Error(`Colons are not supported. For conditional logic, use if(condition, true_val, false_val). Near: '${context}'`);
    }
    if (char === '$') {
      throw new Error(`Dollar signs are not supported. Just use metric names directly (e.g., 'pe_ratio' not '$pe_ratio'). Near: '${context}'`);
    }
    if (char === '@') {
      throw new Error(`@ symbol is not supported. Just use metric names directly. Near: '${context}'`);
    }
    if (char === '#') {
      throw new Error(`Hash/pound sign is not supported. Near: '${context}'`);
    }

    throw new Error(`Unexpected character '${char}' at position ${i}. Near: '${context}'`);
  }

  // Check for trailing operator
  const lastToken = tokens[tokens.length - 1];
  if (lastToken && lastToken.type === TokenType.OPERATOR) {
    throw new Error(`Formula cannot end with operator '${lastToken.value}'`);
  }

  tokens.push({ type: TokenType.EOF, value: null });
  return tokens;
}

/**
 * Parse tokens into an AST
 * Uses recursive descent with proper operator precedence
 */
class Parser {
  constructor(tokens) {
    this.tokens = tokens;
    this.pos = 0;
    this.metrics = new Set();
  }

  current() {
    return this.tokens[this.pos];
  }

  consume(expectedType) {
    const token = this.current();
    if (token.type !== expectedType) {
      throw new Error(`Expected ${expectedType} but got ${token.type}`);
    }
    this.pos++;
    return token;
  }

  parse() {
    const ast = this.expression();
    if (this.current().type !== TokenType.EOF) {
      throw new Error(`Unexpected token: ${this.current().value}`);
    }
    return { ast, metrics: Array.from(this.metrics) };
  }

  // Expression -> Comparison
  expression() {
    return this.comparison();
  }

  // Comparison -> Additive (('>' | '<' | '>=' | '<=' | '==' | '!=') Additive)*
  comparison() {
    let left = this.additive();

    while (this.current().type === TokenType.OPERATOR &&
           ['>', '<', '>=', '<=', '==', '!='].includes(this.current().value)) {
      const op = this.consume(TokenType.OPERATOR).value;
      const right = this.additive();
      left = { type: 'binary', operator: op, left, right };
    }

    return left;
  }

  // Additive -> Multiplicative (('+' | '-') Multiplicative)*
  additive() {
    let left = this.multiplicative();

    while (this.current().type === TokenType.OPERATOR &&
           ['+', '-'].includes(this.current().value)) {
      const op = this.consume(TokenType.OPERATOR).value;
      const right = this.multiplicative();
      left = { type: 'binary', operator: op, left, right };
    }

    return left;
  }

  // Multiplicative -> Power (('*' | '/' | '%') Power)*
  multiplicative() {
    let left = this.power();

    while (this.current().type === TokenType.OPERATOR &&
           ['*', '/', '%'].includes(this.current().value)) {
      const op = this.consume(TokenType.OPERATOR).value;
      const right = this.power();
      left = { type: 'binary', operator: op, left, right };
    }

    return left;
  }

  // Power -> Unary ('^' Unary)*
  power() {
    let left = this.unary();

    while (this.current().type === TokenType.OPERATOR && this.current().value === '^') {
      this.consume(TokenType.OPERATOR);
      const right = this.unary();
      left = { type: 'binary', operator: '^', left, right };
    }

    return left;
  }

  // Unary -> ('-' | '+')? Primary
  unary() {
    if (this.current().type === TokenType.OPERATOR &&
        ['-', '+'].includes(this.current().value)) {
      const op = this.consume(TokenType.OPERATOR).value;
      const operand = this.unary();
      return { type: 'unary', operator: op, operand };
    }
    return this.primary();
  }

  // Primary -> NUMBER | METRIC | FUNCTION '(' args ')' | '(' Expression ')'
  primary() {
    const token = this.current();

    if (token.type === TokenType.NUMBER) {
      this.consume(TokenType.NUMBER);
      return { type: 'number', value: token.value };
    }

    if (token.type === TokenType.METRIC) {
      this.consume(TokenType.METRIC);
      this.metrics.add(token.value);
      return { type: 'metric', name: token.value };
    }

    if (token.type === TokenType.FUNCTION) {
      const funcName = this.consume(TokenType.FUNCTION).value;
      this.consume(TokenType.LPAREN);
      const args = this.argumentList();
      this.consume(TokenType.RPAREN);

      // Validate arity
      const expectedArity = FUNCTION_ARITIES[funcName];
      if (expectedArity !== undefined && args.length !== expectedArity) {
        throw new Error(`Function ${funcName} expects ${expectedArity} arguments, got ${args.length}`);
      }

      return { type: 'function', name: funcName, args };
    }

    if (token.type === TokenType.LPAREN) {
      this.consume(TokenType.LPAREN);
      const expr = this.expression();
      this.consume(TokenType.RPAREN);
      return expr;
    }

    throw new Error(`Unexpected token: ${token.type} (${token.value})`);
  }

  argumentList() {
    const args = [];
    if (this.current().type !== TokenType.RPAREN) {
      args.push(this.expression());
      while (this.current().type === TokenType.COMMA) {
        this.consume(TokenType.COMMA);
        args.push(this.expression());
      }
    }
    return args;
  }
}

/**
 * Evaluate AST with given metric values
 */
function evaluate(ast, metricValues) {
  switch (ast.type) {
    case 'number':
      return ast.value;

    case 'metric':
      const value = metricValues[ast.name];
      if (value === undefined || value === null) {
        return null; // Missing metric
      }
      return value;

    case 'binary': {
      const left = evaluate(ast.left, metricValues);
      const right = evaluate(ast.right, metricValues);

      // Propagate nulls
      if (left === null || right === null) {
        return null;
      }

      switch (ast.operator) {
        case '+': return left + right;
        case '-': return left - right;
        case '*': return left * right;
        case '/': return right === 0 ? null : left / right;
        case '%': return right === 0 ? null : left % right;
        case '^': return Math.pow(left, right);
        case '>': return left > right ? 1 : 0;
        case '<': return left < right ? 1 : 0;
        case '>=': return left >= right ? 1 : 0;
        case '<=': return left <= right ? 1 : 0;
        case '==': return left === right ? 1 : 0;
        case '!=': return left !== right ? 1 : 0;
        default:
          throw new Error(`Unknown operator: ${ast.operator}`);
      }
    }

    case 'unary': {
      const operand = evaluate(ast.operand, metricValues);
      if (operand === null) return null;
      return ast.operator === '-' ? -operand : operand;
    }

    case 'function': {
      const args = ast.args.map(arg => evaluate(arg, metricValues));

      // Special handling for functions that can handle nulls
      if (ast.name === 'ifnan') {
        return args[0] === null || isNaN(args[0]) ? args[1] : args[0];
      }

      // Propagate nulls for other functions
      if (args.some(a => a === null)) {
        return null;
      }

      const func = FUNCTIONS[ast.name];
      if (!func) {
        throw new Error(`Unknown function: ${ast.name}`);
      }

      return func(...args);
    }

    default:
      throw new Error(`Unknown AST node type: ${ast.type}`);
  }
}

/**
 * Generate SQL expression from AST (for database queries)
 */
function toSQL(ast, tableAlias = 'c') {
  switch (ast.type) {
    case 'number':
      return ast.value.toString();

    case 'metric':
      return `${tableAlias}.${ast.name}`;

    case 'binary': {
      const left = toSQL(ast.left, tableAlias);
      const right = toSQL(ast.right, tableAlias);

      // Handle division with NULLIF to avoid divide by zero
      if (ast.operator === '/') {
        return `(${left} / NULLIF(${right}, 0))`;
      }

      return `(${left} ${ast.operator} ${right})`;
    }

    case 'unary':
      return `(${ast.operator}${toSQL(ast.operand, tableAlias)})`;

    case 'function': {
      const args = ast.args.map(arg => toSQL(arg, tableAlias));

      // Map functions to SQL equivalents
      switch (ast.name) {
        case 'abs': return `ABS(${args[0]})`;
        case 'sqrt': return `SQRT(${args[0]})`;
        case 'log': return `LOG(${args[0]})`;
        case 'log10': return `LOG10(${args[0]})`;
        case 'round': return `ROUND(${args[0]})`;
        case 'floor': return `FLOOR(${args[0]})`;
        case 'ceil': return `CEIL(${args[0]})`;
        case 'max': return `MAX(${args.join(', ')})`;
        case 'min': return `MIN(${args.join(', ')})`;
        case 'pow': return `POWER(${args[0]}, ${args[1]})`;
        case 'exp': return `EXP(${args[0]})`;
        case 'sign': return `SIGN(${args[0]})`;
        case 'if': return `CASE WHEN ${args[0]} THEN ${args[1]} ELSE ${args[2]} END`;
        case 'ifnan': return `COALESCE(NULLIF(${args[0]}, ${args[0]}), ${args[1]})`; // Returns fallback if NaN
        case 'ratio': return `(${args[0]} / NULLIF(${args[1]}, 0))`;
        case 'growth': return `((${args[0]} - ${args[1]}) / NULLIF(ABS(${args[1]}), 0))`;
        default:
          throw new Error(`Function ${ast.name} cannot be converted to SQL`);
      }
    }

    default:
      throw new Error(`Cannot convert AST node type ${ast.type} to SQL`);
  }
}

/**
 * Main parser class
 */
class FactorFormulaParser {
  constructor(formula) {
    this.formula = formula;
    this.ast = null;
    this.metrics = [];
    this.error = null;
  }

  /**
   * Parse the formula and extract required metrics
   */
  parse() {
    try {
      const tokens = tokenize(this.formula);
      const parser = new Parser(tokens);
      const result = parser.parse();
      this.ast = result.ast;
      this.metrics = result.metrics;
      return true;
    } catch (err) {
      this.error = err.message;
      return false;
    }
  }

  /**
   * Validate formula against available metrics
   */
  validate(availableMetrics) {
    if (!this.ast) {
      if (!this.parse()) {
        return { valid: false, error: this.error };
      }
    }

    const missing = this.metrics.filter(m => !availableMetrics.includes(m));
    if (missing.length > 0) {
      return {
        valid: false,
        error: `Unknown metrics: ${missing.join(', ')}`,
        unknownMetrics: missing
      };
    }

    return { valid: true, requiredMetrics: this.metrics };
  }

  /**
   * Calculate factor value for a stock
   */
  calculate(metricValues) {
    if (!this.ast) {
      throw new Error('Formula not parsed');
    }
    return evaluate(this.ast, metricValues);
  }

  /**
   * Generate SQL expression
   */
  toSQL(tableAlias = 'c') {
    if (!this.ast) {
      throw new Error('Formula not parsed');
    }
    return toSQL(this.ast, tableAlias);
  }

  /**
   * Get required metrics
   */
  getRequiredMetrics() {
    return this.metrics;
  }

  /**
   * Get human-readable description
   */
  describe() {
    if (!this.ast) {
      return 'Unparsed formula';
    }
    return this._describeNode(this.ast);
  }

  _describeNode(node) {
    switch (node.type) {
      case 'number':
        return node.value.toString();
      case 'metric':
        return node.name.toUpperCase();
      case 'binary':
        return `(${this._describeNode(node.left)} ${node.operator} ${this._describeNode(node.right)})`;
      case 'unary':
        return `${node.operator}${this._describeNode(node.operand)}`;
      case 'function':
        return `${node.name}(${node.args.map(a => this._describeNode(a)).join(', ')})`;
      default:
        return '?';
    }
  }
}

/**
 * Factory function for creating a parser
 */
function createParser(formula) {
  const parser = new FactorFormulaParser(formula);
  parser.parse();
  return parser;
}

/**
 * Quick validation function
 */
function validateFormula(formula, availableMetrics) {
  const parser = new FactorFormulaParser(formula);
  if (!parser.parse()) {
    return { valid: false, error: parser.error };
  }
  return parser.validate(availableMetrics);
}

/**
 * Quick calculation function
 */
function calculateFormula(formula, metricValues) {
  const parser = createParser(formula);
  if (parser.error) {
    throw new Error(parser.error);
  }
  return parser.calculate(metricValues);
}

module.exports = {
  FactorFormulaParser,
  createParser,
  validateFormula,
  calculateFormula,
  FUNCTIONS,
  FUNCTION_ARITIES
};
