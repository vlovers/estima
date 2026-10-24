# Issue triage and evidence policy

This guide covers public GitHub Issues for Estima. It does not authorize release, deployment, database changes or access to customer data. Follow [SECURITY.md](../../SECURITY.md) for sensitive vulnerabilities and [CONTRIBUTING.md](../../CONTRIBUTING.md) for implementation checks.

## Intake and classification

1. Confirm whether the report contains secrets, private tenant data, tokens, credentials, production URLs or exploit instructions. If so, **do not quote, reproduce, copy or re-post it**. Stop public triage, ask for a verified private channel under SECURITY.md and use repository moderation controls as appropriate. Do not promise that editing a public issue removes all exposure.
2. Reproduce a non-sensitive bug using a disposable local environment, redacted fixtures and the exact commit or package version. Record expected versus observed behavior, relevant commands and actual results. If reproduction is unavailable, mark the evidence as unverified rather than inventing a passing result.
3. Classify impact and urgency; priority is an operational queue, **not** a vulnerability disclosure severity or an SLA:
   - **P0:** confirmed active cross-tenant data exposure, destructive data corruption, or an urgent integrity incident. Escalate privately when security-sensitive; do not wait for routine triage.
   - **P1:** reproducible authentication, authorization, concurrency or migration correctness regression without a safe workaround.
   - **P2:** bounded functional regression, broken CI or developer workflow with a workaround.
   - **P3:** improvement, documentation or cosmetic issue without immediate correctness impact.
4. Search for existing Issues and PRs before creating a new task. Link duplicates to the canonical issue; preserve distinct evidence and do not delete reports merely for cleanup. Do not close a potentially security-sensitive issue by copying its details to another public location.
5. Assign an owner only when ownership is confirmed. If evidence is incomplete, record the missing reproduction, affected versions, or decision owner. Labels and priorities must reflect verified facts, not assumptions.

## Acceptance and verification

A task is ready for implementation when its expected outcome, non-goals, risk, and observable acceptance criteria are clear. Tenant ownership checks must cover both reads and writes. Concurrent clarification/estimate mutations must preserve atomicity. Migrations must be exercised only against disposable PostgreSQL unless separately authorized for a specific environment.

The PR author links the Issue, exact commit, test commands and outcomes, CI runs, residual risks, and rollback/recovery considerations. A skipped check is **not** a pass. Green CI is necessary where required but not sufficient for merge: independent review and the repository's merge protections still apply. A merged PR is not deployment approval.

## Periodic maintenance

Review unowned P0/P1 items first, then stale blocked issues, then duplicates and documentation drift. When closing an issue, link the verified fix or record why no action is required. Avoid bulk closing or deleting issues without evidence.
