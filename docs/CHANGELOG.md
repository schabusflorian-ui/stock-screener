# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Changed
- Repository cleaned up and reorganized for professional sharing
- Comprehensive README with project overview, setup guide, and architecture summary
- Documentation reorganized into `docs/architecture/`, `docs/guides/`, `docs/api/`, and `docs/legal/`
- Stale phase reports, conversion scripts, and ad-hoc test files removed
- `.gitignore` enhanced to prevent accidental commits of backup files and databases

### Added
- Architecture overview documentation
- Database schema documentation
- Development guide with coding conventions
- Deployment guide for Railway, Docker, and CI/CD
- API endpoints reference
- LICENSE file
- Prettier configuration for code formatting
- Husky pre-commit hooks with lint-staged

### Security
- All API keys and secrets scrubbed from git history
- Enhanced `.gitignore` patterns for secrets, backups, and database files

### Removed
- 22 stale root-level markdown files (phase reports, migration notes)
- 20 one-time conversion scripts and ad-hoc test files
- 10 tracked backup files (`.bak`, `.backup`, `.js-f`)
- 64 outdated documentation files from `docs/`
- Debug and test files from `src/`
