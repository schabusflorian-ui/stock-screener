# Contributing

Thank you for your interest in contributing to the Investment Research Platform.

## Getting Started

1. Fork the repository and clone your fork
2. Follow the [Development Guide](docs/guides/development.md) for local setup
3. Create a feature branch from `main`
4. Make your changes following the conventions below
5. Run `npm test` and `npm run lint` before committing
6. Submit a pull request

## Coding Conventions

The project follows conventions documented in [docs/AGENTS.md](docs/AGENTS.md):

### Backend
- **Database access**: Always use `getDatabaseAsync()` with `$1, $2` parameterized queries. Never use the deprecated sync API.
- **Route handlers**: Keep them thin -- business logic belongs in `src/services/`.
- **Error handling**: Use `errors.notFound()`, `errors.badRequest()`, etc. from `src/middleware/errorHandler.js`.
- **Logging**: Use `src/lib/logger.js` instead of `console.log`.

### Frontend
- **Use the UI component library** from `frontend/src/components/ui/` -- never create ad-hoc styled containers.
- **Use CSS Custom Properties** from the design system for all styling values.
- **No inline styles** -- use CSS classes with BEM-like naming.
- **PropTypes required** on all components.

### Code Quality
- Pre-commit hooks (Husky + lint-staged) auto-format staged files with Prettier and lint with ESLint.
- Run `npm run format:check` and `npm run lint` before pushing.
- Write tests for new features in the `tests/` directory.

## Commit Messages

Use [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` -- new features
- `fix:` -- bug fixes
- `chore:` -- maintenance, dependency updates
- `docs:` -- documentation changes
- `refactor:` -- code restructuring without behavior changes
- `test:` -- adding or updating tests

## Pull Requests

- Keep PRs focused on a single concern
- Include a clear description of what changed and why
- Reference related issues if applicable
- Ensure CI passes before requesting review

## Reporting Issues

Use [GitHub Issues](https://github.com/schabusflorian-ui/stock-screener/issues) to report bugs or request features. Include:

- Steps to reproduce (for bugs)
- Expected vs actual behavior
- Environment details (Node version, OS, database type)
