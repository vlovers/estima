# Claude Code guidance

Follow [AGENTS.md](AGENTS.md) as the canonical shared engineering contract. Read the relevant existing architecture and security files before work.

Explore → Plan → Implement → Verify → Independent Review → Handoff. Keep parallel agent sessions in separate Git worktrees; evaluate actual diffs and test evidence rather than author summaries. Do not represent unexecuted commands as passed or bypass permissions, licensing, publishing or deployment gates.

Project boundaries: Multi-tenant React/NestJS/TypeORM/PostgreSQL estimates application. Never leak cross-tenant information, accept non-atomic partial clarification writes, or alter migrations destructively. Confirm actual Nx/Bun scripts before running.
