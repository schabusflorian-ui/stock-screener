# Investment Research Platform -- Frontend

React 19 single-page application providing the interactive UI for the Investment Research Platform. Communicates with the Express API backend via REST endpoints.

## Quick Start

```bash
# Install dependencies
npm install

# Start development server (port 3001, proxies API requests to port 3000)
npm start
```

The backend must be running on port 3000 for API calls to work. See the root [README](../README.md) for full setup instructions.

## Architecture

- **64 pages** covering: macro dashboard, stock screener, company deep-dives, AI analyst chat, quantitative workbench, portfolio management, congressional trading, earnings calendar, and more
- **103 reusable components** including a design system of UI primitives (`frontend/src/components/ui/`)
- **12 React contexts** for state management (auth, watchlist, preferences, notifications, NL query, etc.)
- **CSS Custom Properties design system** with glassmorphism aesthetic -- no CSS framework dependency

## Project Structure

```
src/
├── components/           # Reusable UI components
│   ├── ui/               # Design system primitives (Card, Button, Badge, Grid, Table, etc.)
│   ├── charts/           # Recharts-based visualization components
│   └── ...               # Domain-specific components (screener, portfolio, agent, etc.)
├── pages/                # Route-level page components (64 pages)
├── context/              # React contexts (auth, watchlist, preferences, etc.)
├── hooks/                # Custom React hooks
├── services/             # API client layer (axios-based)
└── styles/               # Global CSS and design system variables
```

## Design System

All styling uses CSS Custom Properties defined in the design system. See [docs/AGENTS.md](../docs/AGENTS.md) for the full convention reference:

- **Spacing**: `var(--space-1)` through `var(--space-12)` (4px to 48px scale)
- **Typography**: `var(--text-xs)` through `var(--text-3xl)` (12px to 30px)
- **Colors**: `var(--text-primary)`, `var(--bg-elevated)`, `var(--positive)`, `var(--negative)`, `var(--brand-primary)`
- **Radii**: `var(--radius-sm)` through `var(--radius-full)`
- **Components**: Card (base/elevated/interactive/glass), Button (primary/secondary/ghost/danger), Badge, Grid, Table, DataCard, PageHeader, Section, EmptyState, Typography

## Scripts

```bash
npm start           # Development server with hot reload
npm run build       # Production build (output to build/)
npm test            # Run React component tests
npm run lint:css    # Audit CSS design system compliance
npm run fix:css     # Auto-fix design system violations
npm run analyze     # Bundle size analysis (requires build first)
```

## Environment Variables

Set in `.env.local` (copy from `.env.example`):

| Variable | Description |
|----------|-------------|
| `REACT_APP_API_URL` | Backend API URL. Empty for local dev (uses proxy), full URL for production |
| `REACT_APP_ADMIN_CODE` | Admin bypass code. Leave empty for local dev (auto-enabled on localhost) |
