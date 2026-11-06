# Multi-agent GitHub workflow — Estima

This is Estima's operating protocol for concurrent AI-assisted engineering. It supplements [AGENTS.md](../../AGENTS.md), [Definition of Done](DEFINITION_OF_DONE.md) and [independent review policy](REVIEW_POLICY.md). GitHub permission rules, security boundaries and maintainer approval always take precedence.

## Outcome first, not PR count

Plan **large, coherent, independently testable batches**: a complete tenant-safe workflow, bounded API feature or correctness invariant together with matching tests, documentation, compatibility notes and a single reviewable PR. Do not generate micro-PRs for artificial progress. Split a batch only where independent delivery, a distinct risk boundary or an explicit dependency justifies it.

For each batch, create/link a parent Issue with owner, outcome, observable acceptance, non-goals, dependencies, impacted code paths, database/API contracts, verification plan, rollback notes and designated independent reviewer. Review existing PRs first, particularly active work on `develop`; resume or reconcile instead of duplicating them.

## Roles and execution

| Role | Accountability |
| --- | --- |
| Coordinator | Discover open Issue/PR stack, create dependency graph, assign path ownership, sequence integration and resolve conflicting scope |
| Implementer | Own isolated branch/worktree and complete code, tests, migrations and docs for one batch |
| Independent reviewer | Read actual base-to-head diff, check tenant/auth safety, compatibility, tests and actionable findings |
| Validation agent | Execute and record exact validation commands, environment, result and head SHA |
| Maintainer | Authorize acceptance, merge, deployment and database production operations |

The author cannot independently approve their own change. AI reviewer feedback may inform review, but does **not** constitute an authorized GitHub approval.

### Parallel scheduling

Use **2–5 independent agents** only when the parent Issue has genuinely separable, non-overlapping work. Fewer agents are appropriate when shared contracts, security review, or migration sequencing make parallelism unsafe. Each active agent must have a named owner, dedicated worktree, explicit file scope, dependencies, and handoff recipient; the coordinator owns the single integration PR.

1. Inventory the actual target branch (`develop` for existing governance PRs), open Issues/PRs, schema state and active worktrees. Record base SHA.
2. Identify **shared contracts** first: Nx project dependencies, API DTOs, tenant context, auth/JWT services, migration chain, lockfiles, CI and cross-package types. Assign a single integration owner for each. Dependent frontend/backend batches start after those interfaces are pinned, not by independently guessing shapes.
3. Claim each batch with named owner, dedicated worktree and branch, expected files, dependencies and reviewer on the Issue. Claims coordinate humans/agents; GitHub does not enforce these as file locks.
4. Run independent batches concurrently only when paths and contracts do not overlap. Do not edit a peer's worktree, force-push their branch or overwrite their uncommitted work.
5. Implement complete end-to-end slices with focused regression tests, negative authorization tests and migration notes. If a new dependency arises, mark affected batch blocked and notify the coordinator.
6. Validate the **exact head SHA** using supported scripts from the current target branch; attach CI URL, commands, statuses, test environment and skipped-check reasons.
7. Obtain independent review of actual diff and threat impact; resolve blocking issues within the same PR. Material changes after review require fresh verification and review.
8. Integrate in dependency order; rebase/merge cautiously, verify final effective diff, rerun impacted tests, and ask maintainer before merge/deploy.
9. Update the parent Issue with exact PR/head, findings, evidence, deferred issues and next owner. `implemented`, `verified`, `accepted`, `integrated` and `deployed` must remain distinct.

## Estima-specific invariants

- **Tenant isolation:** every tenant-scoped read/write must enforce the authenticated tenant and user boundary, including aggregate, search and export queries. Test negative cross-tenant and cross-user paths, not only happy-path UI.
- **Authorization:** API controllers, services and database operations must not rely on frontend hiding buttons. Changes to role policy or shared auth guards are serialized behind one contract owner.
- **Atomicity:** updates/deletes, clarification persistence and retries must preserve documented transaction boundaries. Test relevant concurrent retries, rollback and partial failure.
- **JWT lifecycle:** changes to refresh, revocation, expiry or persistence require threat review and negative tests; avoid sensitive tokens in logs/fixtures.
- **Migrations:** schema work has one migration-chain owner. Verify fresh-install and upgrade path (and documented recovery/rollback) only on **verified disposable PostgreSQL**; never test destructively against production/shared databases.
- **Nx/API/web:** changing DTOs, generated clients, packages or shared types requires explicit consumer ownership and integration checks. Use only commands that actually exist in the target checkout; do not invent a green `npm run check` result.
- **Secrets and deployment:** no production credentials, secret logging, automatic migration deployment, branch protection changes or merges without authorization.

## Parent Issue / PR integration ledger

| Batch | Owner | Worktree / PR | Dependencies | Shared files or API owned | State | Verified head SHA | CI + reviewer |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Example tenant-aware clarification write | Agent A | PR #... | tenant DTO contract | clarification transaction | in review | full SHA | CI URL, reviewer |
| Example UI clarification display | Agent B | PR #... | write contract | React view | blocked | — | waiting on DTO |

States: `planned`, `claimed`, `in progress`, `blocked`, `in review`, `changes requested`, `verified`, `accepted`, `integrated`, `deployed`. Track release as a separate operation. Do not infer success from an AI agent's prose or green CI unrelated to the reviewed SHA.

## Evidence artifacts and retention

- Record the **exact full base, head and tested SHA**, workflow run URL, command, environment, exit status, and responsible validation owner in the parent Issue or PR. Evidence from an earlier head is historical, not a current pass. Record each outcome as `PASS`, `FAIL`, `NOT RUN`, `N/A` (with reason), `QUEUED`, `STALE` (superseded tested SHA), or `UNAVAILABLE` (missing, expired, deleted or inaccessible evidence). A skipped or queued job never satisfies a required gate; a historical PASS remains historical after its SHA is superseded.
- Keep only **sanitized** logs, test summaries, screenshots and migration evidence in approved GitHub Actions artifacts or linked review records. Do not upload JWTs, session cookies, environment files, PostgreSQL connection strings, tenant/customer records, raw database dumps or private browser traces. Redact before upload and verify redaction rather than assuming the CI system removes secrets.
- In the handoff, identify each artifact by run URL/name, producer, tested SHA, retention or expiry date, access restrictions, and reproducible command. When artifacts expire or cannot be accessed, mark the corresponding evidence `UNAVAILABLE`; if the tested SHA is superseded, mark it `STALE`. Record the safe reproduction command and revalidate the affected current head rather than asserting a historical pass. Do not rerun queued Actions merely to refresh evidence.
- Do not use public gist, personal cloud storage or Issue attachments as an alternative channel for sensitive test data. For migration verification, record sanitized schema-level outcomes from a separately verified disposable PostgreSQL environment; never attach row-level production data.
- Preserve evidence and the previous branch on interrupted integration. Reconcile shared Nx/lockfile, tenant/auth, DTO and migration contracts against current `develop` before re-running affected checks. No automatic merge, release or deployment follows from an artifact being present.

## Conflicts and recovery

- Shared migration, auth, tenant contract or package-lock edits: stop conflicting work; preserve both branches; name one integration owner; test after reconciliation.
- Crashed/restarted agent: inspect actual local/remote branch state, database fixture, worktree diff and workflow evidence before resuming; avoid blind replay of any write/migration.
- Stale review/CI or failed negative authorization test: mark blocked; rerun/review the exact new head.
- Uncertain environment isolation or credentials: do not connect or run a migration; escalate with sanitized diagnostics.
- Security leak or access-boundary failure: stop, follow repository security reporting and require a maintainer decision.

## Required handoff

```markdown
Parent issue / outcome / acceptance criteria:
Owner, reviewer, integration owner:
Target branch + base SHA; head branch + head SHA:
Owned files and dependency PRs:
Tenant/auth/JWT/API/schema impact:
Actual checks (command, status, environment, tested full SHA, CI URL; PASS/FAIL/NOT RUN/N/A/QUEUED/STALE/UNAVAILABLE):
Evidence artifacts (name/URL, producer, tested SHA, access restrictions, retention/expiry, reproduction command):
Expired, stale, inaccessible or redacted evidence requiring revalidation:
Disposable database verification (or NOT RUN):
Negative security and transaction cases:
Migration compatibility and rollback:
Review findings, unresolved blockers:
Next action and explicit maintainer approval needed:
```

This document is coordination policy; it does not itself install GitHub protections, create a scheduler or prove a safe test environment.
