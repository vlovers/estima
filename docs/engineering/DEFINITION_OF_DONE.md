# Definition of Done — Estima

A change is **implemented** when the agreed scope exists, **verified** when relevant checks and independent review have evidence, **accepted** when the maintainer confirms requirements, and **released** only after deployment and external verification. These states are distinct.

## Required evidence
- Acceptance criteria, scope, compatibility and non-goals are explicit.
- Tenant isolation is preserved; include negative cross-tenant/cross-user read and write cases for authorization changes.
- UPDATE/DELETE and clarification writes remain atomic; test concurrent retry behavior when relevant.
- JWT refresh lifecycle, migration chain, fresh install/upgrade/rollback and relevant API/web E2E are verified where affected.
- Use only disposable PostgreSQL for mutating integration tests; never use production credentials. Confirm actual scripts on the target branch (`develop`), and record exact commands and results; never claim unrun checks passed.
- Independent reviewer records identity, reviewed head SHA, findings and disposition. AI review is not authorized GitHub approval. Re-review material changes and resolve blocking findings.
- Docs, UI states and release limitations match actual behavior. Deployment and rollback require separate evidence and explicit maintainer authorization.

Docs-only changes may mark irrelevant runtime checks N/A with a reason; verify changed links and command references. Release requires the separate checklist.
