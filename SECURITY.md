# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in this project, please report it responsibly.

**Do not open a public GitHub issue for security vulnerabilities.**

Instead, please email security concerns to the repository owner. Include:

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

You should receive a response within 48 hours acknowledging your report.

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.x     | Yes       |

## Security Measures

This project implements the following security controls:

- **Helmet** -- security headers (CSP, HSTS, X-Frame-Options)
- **CSRF protection** -- token-based with httpOnly secure cookies
- **Rate limiting** -- Redis-backed distributed rate limiting (100/30/10 req/min tiers)
- **Input validation** -- Joi schemas on all user input
- **Parameterized queries** -- SQL injection prevention via `$1, $2` placeholders
- **Session management** -- secure cookies with configurable expiry
- **Error sanitization** -- 5xx errors never expose stack traces or internal details in production
- **Secret management** -- environment variables for all credentials; startup validation blocks dev-only settings in production
