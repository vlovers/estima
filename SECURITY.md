# Security policy

Estima is in active development. This document does **not** assert that the application has undergone an independent security audit, nor does it promise a disclosure timeline.

## Report a vulnerability

Do **not** create a public GitHub Issue containing exploit instructions, credentials, private user information or affected production URLs. Prefer the repository's GitHub **Report a vulnerability** / private security advisory feature if enabled. If unavailable, contact the maintainers privately via the channels listed on their GitHub profiles and share only the information necessary to coordinate disclosure.

A useful report describes the affected commit/version, expected versus observed behavior, safe reproduction steps, impact and mitigations. Never test against accounts or databases you do not own or have explicit permission to assess.

## Trust boundaries

- Every project/task/estimate access must enforce server-side tenant ownership. Hiding UI controls is not authorization.
- Authentication and refresh-token changes must preserve revocation, expiry and session boundaries.
- Database writes involving estimates and clarifications must be atomic and safe under concurrent requests.
- Database migrations must be reviewed, tested on disposable PostgreSQL and backed by a rollback/recovery plan before deployment.
- Never log or commit secrets, JWTs, database credentials, real client datasets or AI-provider API keys.
- CI should use least-privilege tokens and isolated test fixtures.

See [CONTRIBUTING.md](CONTRIBUTING.md) for verification expectations. An automated test passing does not certify the system secure.
