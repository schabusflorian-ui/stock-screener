# PostgreSQL Conversion Patterns - Quick Reference

This is a quick reference guide for common conversion patterns when migrating services from SQLite to PostgreSQL.

---

## 🔧 Basic Patterns

### Pattern 1: Service Class Header

**Before (SQLite):**
```javascript
const { getDatabase } = require('../database');

class MyService {
  constructor() {
    this.db = getDatabase();
  }

  // methods...
}

module.exports = new MyService();
```

**After (PostgreSQL):**
```javascript
const { getDatabaseAsync } = require('../database');

class MyService {
  // No constructor needed!

  // methods...
}

module.exports = new MyService();
```

---

### Pattern 2: Simple SELECT (single row)

**Before:**
```javascript
getData(id) {
  const sql = `SELECT * FROM table WHERE id = ?`;
  return this.db.prepare(sql).get(id);
}
```

**After:**
```javascript
async getData(id) {
  const database = await getDatabaseAsync();
  const sql = `SELECT * FROM table WHERE id = $1`;
  const result = await database.query(sql, [id]);
  return result.rows[0];
}
```

---

### Pattern 3: SELECT Multiple Rows

**Before:**
```javascript
getAllData(limit) {
  const sql = `SELECT * FROM table LIMIT ?`;
  return this.db.prepare(sql).all(limit);
}
```

**After:**
```javascript
async getAllData(limit) {
  const database = await getDatabaseAsync();
  const sql = `SELECT * FROM table LIMIT $1`;
  const result = await database.query(sql, [limit]);
  return result.rows;
}
```

---

### Pattern 4: INSERT with ID Return

**Before:**
```javascript
insertData(name, value) {
  const sql = `INSERT INTO table (name, value) VALUES (?, ?)`;
  const result = this.db.prepare(sql).run(name, value);
  return result.lastInsertRowid;
}
```

**After:**
```javascript
async insertData(name, value) {
  const database = await getDatabaseAsync();
  const sql = `
    INSERT INTO table (name, value)
    VALUES ($1, $2)
    RETURNING id
  `;
  const result = await database.query(sql, [name, value]);
  return result.rows[0].id;
}
```

---

### Pattern 5: UPDATE with Row Count

**Before:**
```javascript
updateData(id, value) {
  const sql = `UPDATE table SET value = ? WHERE id = ?`;
  const result = this.db.prepare(sql).run(value, id);
  return result.changes;
}
```

**After:**
```javascript
async updateData(id, value) {
  const database = await getDatabaseAsync();
  const sql = `UPDATE table SET value = $1 WHERE id = $2`;
  const result = await database.query(sql, [value, id]);
  return result.rowCount;
}
```

---

### Pattern 6: DELETE

**Before:**
```javascript
deleteData(id) {
  const sql = `DELETE FROM table WHERE id = ?`;
  const result = this.db.prepare(sql).run(id);
  return result.changes > 0;
}
```

**After:**
```javascript
async deleteData(id) {
  const database = await getDatabaseAsync();
  const sql = `DELETE FROM table WHERE id = $1`;
  const result = await database.query(sql, [id]);
  return result.rowCount > 0;
}
```

---

## 🎯 Dynamic Query Patterns

### Pattern 7: Dynamic WHERE Clauses

**Before:**
```javascript
search(options = {}) {
  let sql = `SELECT * FROM table WHERE 1=1`;
  const params = [];

  if (options.name) {
    sql += ` AND name = ?`;
    params.push(options.name);
  }

  if (options.minValue) {
    sql += ` AND value >= ?`;
    params.push(options.minValue);
  }

  sql += ` LIMIT ?`;
  params.push(options.limit || 100);

  return this.db.prepare(sql).all(...params);
}
```

**After:**
```javascript
async search(options = {}) {
  const database = await getDatabaseAsync();
  let sql = `SELECT * FROM table WHERE 1=1`;
  const params = [];
  let paramCounter = 1;

  if (options.name) {
    sql += ` AND name = $${paramCounter++}`;
    params.push(options.name);
  }

  if (options.minValue) {
    sql += ` AND value >= $${paramCounter++}`;
    params.push(options.minValue);
  }

  sql += ` LIMIT $${paramCounter++}`;
  params.push(options.limit || 100);

  const result = await database.query(sql, params);
  return result.rows;
}
```

**Key Point**: Use `paramCounter` to track parameter position!

---

### Pattern 8: Dynamic ORDER BY

**Before:**
```javascript
getSorted(sortBy = 'name', order = 'ASC') {
  const validColumns = ['name', 'value', 'created_at'];
  const column = validColumns.includes(sortBy) ? sortBy : 'name';
  const direction = order.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

  const sql = `SELECT * FROM table ORDER BY ${column} ${direction}`;
  return this.db.prepare(sql).all();
}
```

**After:**
```javascript
async getSorted(sortBy = 'name', order = 'ASC') {
  const database = await getDatabaseAsync();
  const validColumns = ['name', 'value', 'created_at'];
  const column = validColumns.includes(sortBy) ? sortBy : 'name';
  const direction = order.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

  const sql = `SELECT * FROM table ORDER BY ${column} ${direction}`;
  const result = await database.query(sql);
  return result.rows;
}
```

**Note**: Column names can be interpolated (not parameterized), but **always whitelist them**!

---

## 📅 Date & Time Patterns

### Pattern 9: Current Date/Time

**Before:**
```javascript
getRecent() {
  const sql = `
    SELECT * FROM table
    WHERE created_at >= date('now', '-7 days')
  `;
  return this.db.prepare(sql).all();
}
```

**After:**
```javascript
async getRecent() {
  const database = await getDatabaseAsync();
  const sql = `
    SELECT * FROM table
    WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
  `;
  const result = await database.query(sql);
  return result.rows;
}
```

**Conversions**:
- `date('now')` → `CURRENT_DATE`
- `datetime('now')` → `CURRENT_TIMESTAMP`
- `date('now', '-X days')` → `CURRENT_DATE - INTERVAL 'X days'`
- `date('now', '+X days')` → `CURRENT_DATE + INTERVAL 'X days'`

---

### Pattern 10: Date Range with Parameters

**Before:**
```javascript
getInRange(startDate, endDate) {
  const sql = `
    SELECT * FROM table
    WHERE date >= ? AND date <= ?
  `;
  return this.db.prepare(sql).all(startDate, endDate);
}
```

**After:**
```javascript
async getInRange(startDate, endDate) {
  const database = await getDatabaseAsync();
  const sql = `
    SELECT * FROM table
    WHERE date >= $1 AND date <= $2
  `;
  const result = await database.query(sql, [startDate, endDate]);
  return result.rows;
}
```

---

## ⚠️ Error Handling Patterns

### Pattern 11: Unique Constraint

**Before:**
```javascript
insert(name) {
  try {
    const sql = `INSERT INTO table (name) VALUES (?)`;
    this.db.prepare(sql).run(name);
    return { success: true };
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return { success: false, error: 'Already exists' };
    }
    throw error;
  }
}
```

**After:**
```javascript
async insert(name) {
  const database = await getDatabaseAsync();
  try {
    const sql = `INSERT INTO table (name) VALUES ($1)`;
    await database.query(sql, [name]);
    return { success: true };
  } catch (error) {
    if (error.code === '23505') { // PostgreSQL unique violation
      return { success: false, error: 'Already exists' };
    }
    throw error;
  }
}
```

**Error Code Mappings**:
- `SQLITE_CONSTRAINT_UNIQUE` → `23505`
- `SQLITE_CONSTRAINT_FOREIGNKEY` → `23503`
- `SQLITE_CONSTRAINT_NOTNULL` → `23502`

---

## 🔢 Boolean & Type Patterns

### Pattern 12: Boolean Values

**Before:**
```javascript
getActive() {
  const sql = `SELECT * FROM table WHERE is_active = 1`;
  return this.db.prepare(sql).all();
}
```

**After:**
```javascript
async getActive() {
  const database = await getDatabaseAsync();
  const sql = `SELECT * FROM table WHERE is_active = true`;
  const result = await database.query(sql);
  return result.rows;
}
```

**Or with parameter:**
```javascript
async getByStatus(isActive) {
  const database = await getDatabaseAsync();
  const sql = `SELECT * FROM table WHERE is_active = $1`;
  const result = await database.query(sql, [isActive]);
  return result.rows;
}
```

---

## 🚀 Route Handler Patterns

### Pattern 13: Express Route Handler

**Before:**
```javascript
router.get('/data', (req, res) => {
  try {
    const data = MyService.getData();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

**After:**
```javascript
router.get('/data', async (req, res) => {
  try {
    const data = await MyService.getData();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

**Key Changes**:
1. Add `async` to route handler
2. Add `await` to service call

---

## 🎨 Advanced Patterns

### Pattern 14: Transaction (if needed)

**PostgreSQL supports transactions:**
```javascript
async transferData(fromId, toId, amount) {
  const database = await getDatabaseAsync();

  try {
    await database.query('BEGIN');

    await database.query(
      'UPDATE accounts SET balance = balance - $1 WHERE id = $2',
      [amount, fromId]
    );

    await database.query(
      'UPDATE accounts SET balance = balance + $1 WHERE id = $2',
      [amount, toId]
    );

    await database.query('COMMIT');
    return { success: true };
  } catch (error) {
    await database.query('ROLLBACK');
    throw error;
  }
}
```

---

### Pattern 15: Batch Insert

**Before:**
```javascript
insertMany(items) {
  const sql = `INSERT INTO table (name, value) VALUES (?, ?)`;
  const stmt = this.db.prepare(sql);

  items.forEach(item => {
    stmt.run(item.name, item.value);
  });
}
```

**After:**
```javascript
async insertMany(items) {
  const database = await getDatabaseAsync();

  // Option 1: Multiple inserts (simple but slower)
  for (const item of items) {
    await database.query(
      'INSERT INTO table (name, value) VALUES ($1, $2)',
      [item.name, item.value]
    );
  }

  // Option 2: Bulk insert (faster)
  const values = items.map((item, idx) =>
    `($${idx * 2 + 1}, $${idx * 2 + 2})`
  ).join(', ');

  const params = items.flatMap(item => [item.name, item.value]);

  await database.query(
    `INSERT INTO table (name, value) VALUES ${values}`,
    params
  );
}
```

---

### Pattern 16: JSON Column Operations

**PostgreSQL has excellent JSON support:**
```javascript
async searchJsonColumn(criteria) {
  const database = await getDatabaseAsync();
  const sql = `
    SELECT * FROM table
    WHERE metadata->>'category' = $1
      AND (metadata->'price')::numeric > $2
  `;
  const result = await database.query(sql, [criteria.category, criteria.minPrice]);
  return result.rows;
}
```

---

## ✅ Testing Pattern

### Pattern 17: Test Your Converted Service

```javascript
// Quick test script
const service = require('./src/services/myService');

(async () => {
  try {
    console.log('Testing getData...');
    const data = await service.getData(1);
    console.log('✓ getData works:', data);

    console.log('\nTesting getAllData...');
    const allData = await service.getAllData(10);
    console.log('✓ getAllData works, count:', allData.length);

    console.log('\n✅ All tests passed!');
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
})();
```

---

## 📝 Common Gotchas

### ❌ DON'T: Forget await
```javascript
// WRONG - Missing await
async getData() {
  const database = await getDatabaseAsync();
  const result = database.query('SELECT * FROM table');  // ❌ Missing await!
  return result.rows;
}
```

### ✅ DO: Always await
```javascript
// CORRECT
async getData() {
  const database = await getDatabaseAsync();
  const result = await database.query('SELECT * FROM table');  // ✅
  return result.rows;
}
```

---

### ❌ DON'T: Reuse parameter numbers
```javascript
// WRONG - $1 used twice
const sql = `
  SELECT * FROM table
  WHERE name = $1 AND value > $1
`;
```

### ✅ DO: Increment parameter numbers
```javascript
// CORRECT
const sql = `
  SELECT * FROM table
  WHERE name = $1 AND value > $2
`;
```

---

### ❌ DON'T: Interpolate user input
```javascript
// WRONG - SQL injection vulnerability!
async search(name) {
  const sql = `SELECT * FROM table WHERE name = '${name}'`;
  const result = await database.query(sql);
  return result.rows;
}
```

### ✅ DO: Use parameterized queries
```javascript
// CORRECT - Safe from SQL injection
async search(name) {
  const sql = `SELECT * FROM table WHERE name = $1`;
  const result = await database.query(sql, [name]);
  return result.rows;
}
```

---

## 🎯 Conversion Checklist

Use this checklist for every service:

- [ ] Remove `constructor` and `this.db = getDatabase()`
- [ ] Import `getDatabaseAsync` instead of `getDatabase`
- [ ] Make all methods `async`
- [ ] Add `const database = await getDatabaseAsync()` to each method
- [ ] Convert `?` to `$1, $2, $3...` (use paramCounter for dynamic queries)
- [ ] Convert `.prepare(sql).get()` → `await database.query(sql).rows[0]`
- [ ] Convert `.prepare(sql).all()` → `await database.query(sql).rows`
- [ ] Convert `.prepare(sql).run()` → `await database.query(sql)`
- [ ] Convert `result.changes` → `result.rowCount`
- [ ] Convert `result.lastInsertRowid` → add `RETURNING id` and use `result.rows[0].id`
- [ ] Fix SQLite date functions → PostgreSQL equivalents
- [ ] Fix boolean values: `1/0` → `true/false`
- [ ] Fix error codes: `SQLITE_*` → PostgreSQL codes
- [ ] Update route handlers to be `async` and `await` service calls
- [ ] Test all methods
- [ ] Deploy and verify

---

## 🚀 Quick Commands

```bash
# Analyze a service
node scripts/postgres-conversion-helper.js analyze src/services/myService.js

# Generate checklist
node scripts/postgres-conversion-helper.js checklist src/services/myService.js

# Test converted service locally
NODE_ENV=development node -e "require('./src/services/myService').methodName().then(console.log)"

# Deploy to Railway
git add . && git commit -m "Convert myService to PostgreSQL" && git push origin railway-deploy-clean
```

---

**Remember**: Take it one service at a time, test thoroughly, and deploy incrementally!
