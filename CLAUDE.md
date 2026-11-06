# Claude Code guidance — Estima

Follow [AGENTS.md](AGENTS.md) as the canonical agent working agreement for this repository. Read the README, existing architecture/security documentation and linked issue before changing code.

Workflow: Explore → Plan → Implement → Verify → Independent Review → Handoff. Inspect the actual base-to-head diff and test evidence, not just the author's summary; report commands actually executed. Keep parallel agents in separate branches/worktrees and preserve existing changes. Do not assume tests passed unless they ran successfully.

Never override the security, data handling, deployment, release, or merge restrictions in AGENTS.md. If instructions conflict, stop and ask for clarification.

## Issue-first coordination and recovery

Before a parallel session, read [the Estima multi-agent workflow](docs/engineering/MULTI_AGENT_WORKFLOW.md) and the current parent Issue. Use the parent Issue as the ownership ledger: named agent, branch/worktree, reserved paths, dependencies, integration owner, reviewer, base SHA, and acceptance evidence. Keep a single active writer for tenant/auth/JWT, API DTOs, Nx shared contracts, migration chains and lockfiles. An Issue claim is not a GitHub-enforced lock.

On restart, fetch the actual `develop` and PR head, inspect worktree changes and unresolved review comments before writing. If a shared contract or SHA changed, pause dependent work and revalidate against the new head. Record commands actually run and whether PostgreSQL was independently verified disposable; an unrun migration test is not a pass. Integrate into the existing coherent governance PR rather than opening one PR per agent. Maintainer approval remains necessary for merge, release and production operations.
