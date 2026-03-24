# Agent Guidelines - Investment Research Platform

This document contains rules and guidelines that all AI agents must follow when working on this codebase.

## Project Overview

This is a React-based investment research platform with:
- **Frontend**: React 19 with vanilla CSS using CSS variables
- **Backend**: Node.js/Express with PostgreSQL (production) / SQLite (development)
- **Styling**: Design system based on CSS custom properties (no Tailwind)

## Directory Structure

```
frontend/src/
├── components/
│   ├── ui/              # ← REUSABLE UI COMPONENTS (use these!)
│   ├── layout/          # Layout components (Sidebar, Header)
│   ├── portfolio/       # Portfolio feature components
│   ├── analyst/         # AI analyst components
│   └── ...              # Other feature components
├── pages/               # Page-level components
├── styles/
│   ├── design-system.css  # ← DESIGN TOKENS (source of truth)
│   └── responsive.css     # Responsive utilities
├── hooks/               # Custom React hooks
├── services/            # API layer
├── context/             # React Context providers
└── utils/               # Utility functions
```

---

## Frontend Rules (MANDATORY)

### 1. Use UI Components

Always use components from `frontend/src/components/ui/` for common UI elements:

```javascript
// ✅ GOOD - Import from ui components
import { Card, Button, Badge, Grid, Section, PageHeader } from '../components/ui';

// ❌ BAD - Creating ad-hoc styled divs
<div className="my-custom-card" style={{ padding: '20px' }}>
```

Available UI components:
- `Card` - Container with variants (base, elevated, interactive, glass)
- `Button` - Buttons with variants (primary, secondary, ghost, danger)
- `Badge` - Status indicators (gray, blue, green, red, yellow, purple)
- `Grid` - Responsive grid layouts (1-6 columns)
- `Section` - Content sections with titles and actions
- `PageHeader` - Page titles with subtitle and action buttons
- `StandardPage` - Full page template
- `DataCard` - Metric display with change indicators
- `Callout` - Alert/notification messages
- `Table` - Consistent table styling
- `EmptyState` - No-data placeholder

### 2. Use Design System CSS Variables

All styling must use CSS variables from `frontend/src/styles/design-system.css`:

```css
/* ✅ GOOD - Using CSS variables */
.my-component {
  padding: var(--space-4);           /* 16px */
  font-size: var(--text-base);       /* 14px */
  color: var(--text-primary);
  background: var(--bg-secondary);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  transition: all var(--transition-fast);
}

/* ❌ BAD - Hardcoded values */
.my-component {
  padding: 16px;                      /* Use var(--space-4) */
  font-size: 14px;                    /* Use var(--text-base) */
  color: #374151;                     /* Use var(--text-primary) */
  background: rgba(255,255,255,0.7);  /* Use var(--bg-secondary) */
  border-radius: 12px;                /* Use var(--radius-lg) */
}
```

### Available CSS Variables

#### Spacing (--space-*)
| Variable | Value | Use For |
|----------|-------|---------|
| `--space-1` | 4px | Tight spacing between related elements |
| `--space-2` | 8px | Small gaps |
| `--space-3` | 12px | Between sm and md |
| `--space-4` | 16px | Standard gap |
| `--space-6` | 24px | Section padding |
| `--space-8` | 32px | Major sections |
| `--space-12` | 48px | Page sections |

#### Font Sizes (--text-*)
| Variable | Value | Use For |
|----------|-------|---------|
| `--text-xs` | 12px | Labels, badges |
| `--text-sm` | 13px | Secondary text |
| `--text-base` | 14px | Body text |
| `--text-md` | 16px | Emphasis |
| `--text-lg` | 18px | Subheadings |
| `--text-xl` | 20px | Section titles |
| `--text-2xl` | 24px | Page subtitles |
| `--text-3xl` | 30px | Page titles |

#### Colors (--text-*, --bg-*, --brand-*, etc.)
| Variable | Use For |
|----------|---------|
| `--text-primary` | Main text |
| `--text-secondary` | Secondary text |
| `--text-tertiary` | Muted text |
| `--bg-primary` | Page background |
| `--bg-secondary` | Card backgrounds |
| `--bg-elevated` | Elevated surfaces |
| `--brand-primary` | Primary actions, links |
| `--positive` | Success, gains |
| `--negative` | Errors, losses |
| `--warning` | Warnings |
| `--info` | Informational |

#### Border Radius (--radius-*)
| Variable | Value | Use For |
|----------|-------|---------|
| `--radius-sm` | 6px | Small elements, badges |
| `--radius-md` | 8px | Buttons, inputs |
| `--radius-lg` | 12px | Cards |
| `--radius-xl` | 16px | Large cards |
| `--radius-2xl` | 24px | Modal dialogs |
| `--radius-full` | 9999px | Pills, avatars |

### 3. No Inline Styles

Avoid inline styles. Use CSS classes instead:

```javascript
// ✅ GOOD
<div className="metric-value positive">+5.2%</div>

// ❌ BAD
<div style={{ color: '#10b981', fontSize: '14px' }}>+5.2%</div>
```

### 4. Run CSS Lint Before Committing

Always run the CSS linter before committing frontend changes:

```bash
cd frontend
npm run lint:css    # Check for violations
npm run fix:css     # Auto-fix common issues
```

### 5. Component Patterns

When creating new components:

```javascript
// frontend/src/components/MyComponent.js
import React from 'react';
import PropTypes from 'prop-types';
import './MyComponent.css';

function MyComponent({ variant = 'default', children }) {
  return (
    <div className={`my-component my-component--${variant}`}>
      {children}
    </div>
  );
}

MyComponent.propTypes = {
  variant: PropTypes.oneOf(['default', 'primary', 'secondary']),
  children: PropTypes.node.isRequired
};

export default MyComponent;
```

CSS file pattern:
```css
/* frontend/src/components/MyComponent.css */

.my-component {
  padding: var(--space-4);
  background: var(--bg-secondary);
  border-radius: var(--radius-lg);
}

.my-component--primary {
  background: var(--brand-primary);
  color: white;
}

.my-component--secondary {
  background: var(--bg-tertiary);
}
```

### 6. Responsive Design

Use the responsive breakpoints from `responsive.css`:

```css
/* Mobile-first approach */
.my-component {
  padding: var(--space-3);
  grid-template-columns: 1fr;
}

@media (min-width: 768px) {
  .my-component {
    padding: var(--space-4);
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (min-width: 1024px) {
  .my-component {
    padding: var(--space-6);
    grid-template-columns: repeat(3, 1fr);
  }
}
```

### 7. Glass Morphism

Use the built-in glass card class for glassmorphism effects:

```javascript
<div className="glass-card">
  {/* Content */}
</div>

// Or use the Card component with glass variant
<Card variant="glass">
  {/* Content */}
</Card>
```

---

## Anti-Patterns to Avoid

```css
/* ❌ Hardcoded spacing */
padding: 18px;          /* Use var(--space-4) or var(--space-5) */
margin: 22px;           /* Not a standard value */
gap: 15px;              /* Use var(--space-3) or var(--space-4) */

/* ❌ Hardcoded colors */
background: #f5f5f5;    /* Use var(--bg-tertiary) */
color: #333333;         /* Use var(--text-primary) */

/* ❌ Hardcoded font sizes */
font-size: 15px;        /* Use var(--text-sm) or var(--text-base) */
font-size: 19px;        /* Use var(--text-lg) */

/* ❌ Inconsistent shadows */
box-shadow: 0 2px 8px rgba(0,0,0,0.1);  /* Use var(--shadow-md) */

/* ❌ Non-standard border-radius */
border-radius: 10px;    /* Use var(--radius-lg) = 12px */
```

---

## Backend Rules

### API Routes
- All routes go in `src/api/routes/`
- Use consistent error handling
- Return JSON with `{ data: ... }` or `{ error: ... }`

### Database
- SQLite (dev) or PostgreSQL (production) – use `lib/db` abstraction
- Use parameterized queries to prevent SQL injection
- Keep migrations in `src/database-migrations/`

#### Database Access (MANDATORY for new/updated code)

Use the async pattern – **do not** use sync SQLite APIs:

```javascript
// ✅ GOOD – async pattern (works with SQLite and Postgres)
const { getDatabaseAsync } = require('../lib/db');
const database = await getDatabaseAsync();
const result = await database.query('SELECT * FROM companies WHERE id = $1', [id]);
const row = result.rows[0];
const rows = result.rows;
```

```javascript
// ❌ BAD – sync SQLite only
const db = getDatabaseSync();
const row = db.prepare('SELECT * FROM companies WHERE id = ?').get(id);
const rows = db.prepare('SELECT * FROM companies').all();
```

- Placeholders: use `$1`, `$2`, etc. (lib/db maps to `?` for SQLite)
- Results: `result.rows` (array) or `result.rows[0]` (single row)
- Do NOT use: `prepare()`, `.get()`, `.all()`, `.run()`, `getDatabaseSync()`

### Services
- Business logic goes in `src/services/`
- Keep API routes thin, delegate to services

---

## Testing

```bash
# Frontend tests
cd frontend && npm test

# Backend tests (if available)
npm run test

# CSS audit
cd frontend && npm run lint:css
```

---

## Quick Reference: UI Component Usage

```javascript
import {
  Card,
  Button,
  Badge,
  Grid,
  Section,
  PageHeader,
  StandardPage,
  DataCard,
  Callout,
  Table,
  EmptyState
} from '../components/ui';

// Page layout
<StandardPage title="Dashboard" subtitle="Overview" actions={<Button>Add</Button>}>
  <Section title="Key Metrics">
    <Grid cols={4} gap="md">
      <DataCard label="Revenue" value={1234567} format="currency" change={5.2} />
    </Grid>
  </Section>
</StandardPage>

// Cards
<Card variant="interactive" padding="lg">
  <Card.Header>
    <Card.Title>Title</Card.Title>
    <Card.Description>Description</Card.Description>
  </Card.Header>
  <Card.Content>Content</Card.Content>
</Card>

// Alerts
<Callout type="warning" title="Note">Important message</Callout>

// Tables
<Table>
  <Table.Header>
    <Table.Row>
      <Table.Head>Name</Table.Head>
      <Table.Head align="right">Value</Table.Head>
    </Table.Row>
  </Table.Header>
  <Table.Body>
    <Table.Row onClick={() => {}}>
      <Table.Cell>Item</Table.Cell>
      <Table.Cell align="right">$100</Table.Cell>
    </Table.Row>
  </Table.Body>
</Table>
```
