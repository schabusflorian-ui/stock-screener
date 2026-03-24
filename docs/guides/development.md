# Development Guide

## Local Setup

### 1. Install Dependencies

```bash
# Backend
npm install

# Frontend
cd frontend && npm install && cd ..

# Python services (optional, for data scrapers)
cd python-services && python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt && cd ..
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env and add your API keys (at minimum: ALPHA_VANTAGE_KEY)
```

### 3. Start Development Servers

```bash
# Terminal 1: Backend (port 3000)
npm run dev

# Terminal 2: Frontend (port 3001)
cd frontend && npm start
```

The backend uses SQLite by default in development -- no database setup required. The SQLite file is created automatically at `./data/stocks.db`.

### Using Docker

For a production-like environment with PostgreSQL and Redis:

```bash
docker-compose up
```

This starts the API server, PostgreSQL, Redis, and the background scheduler.

## Coding Conventions

### Backend

**Database Access** -- Always use the async pattern:

```javascript
const { getDatabaseAsync } = require('../lib/db');

async function getCompany(id) {
  const db = await getDatabaseAsync();
  const result = await db.query('SELECT * FROM companies WHERE id = $1', [id]);
  return result.rows[0];
}
```

Never use `getDatabaseSync()`, `db.prepare()`, or `.get()/.all()/.run()` -- these are SQLite-only and will break in production.

**Service Layer** -- Keep route handlers thin. Business logic belongs in `src/services/`:

```javascript
// src/api/routes/companies.js -- thin route
router.get('/:id', async (req, res) => {
  const company = await companyService.getById(req.params.id);
  res.json({ data: company });
});

// src/services/companyService.js -- business logic here
```

**Error Handling** -- Use the centralized error utilities:

```javascript
const { AppError, errors } = require('../middleware/errorHandler');

// Throw structured errors
throw errors.notFound('Company not found');
throw errors.badRequest('Invalid ticker symbol');
throw errors.validation([{ field: 'ticker', message: 'Required' }]);
```

**Logging** -- Use the logger instead of `console.log`:

```javascript
const logger = require('../lib/logger');
logger.info('Processing company', { ticker: 'AAPL' });
logger.error('Database error', error, { query: sql });
```

### Frontend

See [docs/AGENTS.md](../AGENTS.md) for the complete frontend conventions. Key points:

- Use UI components from `frontend/src/components/ui/` (Card, Button, Badge, Grid, etc.)
- Use CSS Custom Properties from the design system (`var(--space-4)`, `var(--text-primary)`, etc.)
- No inline styles -- use CSS classes with BEM naming
- PropTypes required on all components

## Testing

### Backend Tests (Jest)

```bash
npm test                          # Full test suite
npm run test:watch                # Watch mode
npm run test:coverage             # With coverage report
npm run test:agent                # AI agent tests only
npm run test:updates              # Update service tests
npm run test:postgresql           # PostgreSQL integration tests
```

### Frontend Tests

```bash
cd frontend
npm test                          # React component tests
npm run lint:css                  # CSS design system audit
```

### Test Organization

```
tests/
├── api/                          # API route tests
├── services/                     # Service layer tests
├── middleware/                    # Middleware tests
├── agent/                        # AI agent tests
├── integration/                  # Integration tests
├── postgresql/                   # PostgreSQL-specific tests
└── unified-strategy/             # Strategy framework tests
```

## Database Migrations

### Creating a Migration

Add a new file in `src/database-migrations/` following the naming convention:

```javascript
// src/database-migrations/041-add-new-feature.js
module.exports = {
  up: async (db) => {
    await db.query(`
      CREATE TABLE IF NOT EXISTS new_feature (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
  }
};
```

### Running Migrations

```bash
npm run db:migrate          # Run all pending
npm run db:migrate:status   # Check status
```

## Useful Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start backend with hot reload |
| `npm test` | Run test suite |
| `npm run lint` | Check code style |
| `npm run lint:fix` | Auto-fix lint issues |
| `npm run db:migrate` | Run database migrations |
| `npm run scheduler` | Start background jobs |
| `npm run price-update` | One-off price update |
| `npm run health` | Check server health |
| `npm run health:detailed` | Detailed health report |
