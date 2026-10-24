# CI workflow security baseline

Estima's two validation workflows use immutable full-length commit SHAs for third-party GitHub Actions. The workflow token is explicitly read-only (contents: read) and checkout does not retain credentials. The policy is checked by `scripts/audit-workflow-security.cjs` and its Node regression suite (25 cases as of this change), run before dependency installation in both workflows.

## Updating an Action

1. Identify the action's upstream official repository and intended release tag.
2. Resolve the tag to its exact commit SHA via the upstream GitHub Git refs API; for annotated tags resolve the target commit.
3. Review the release notes and diff; replace the SHA in every workflow using the action.
4. Run: node scripts/audit-workflow-security.cjs && node --test scripts/audit-workflow-security.test.cjs
5. Confirm both CI workflows pass on the new PR head. Do not weaken the audit to bypass failures.

The checker intentionally rejects floating tags, abbreviated SHAs, empty `uses` references, non-static or traversing local action paths, token write permissions, and checkout credential persistence. It accepts ordinary YAML key whitespace (for example `uses :`), so spacing cannot bypass the checks. Jobs requiring write scopes must undergo separate security review; no workflow currently requires them.

## Scope and limitations

This is a line-oriented, fail-closed policy check for the repository's existing workflow conventions, **not a complete YAML parser or a proof of GitHub Actions execution safety**. Do not introduce YAML anchors, multiline action references, dynamically computed action identifiers, or novel workflow syntax without reviewing and extending the checker and its tests. Review action sources, workflow triggers, `run:` shell commands, dependencies, and third-party supply-chain risk separately. Green CI does not authorize merge or release, and does not replace branch protection, dependency auditing, or independent review.
