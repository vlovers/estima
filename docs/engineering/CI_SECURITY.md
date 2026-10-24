# CI workflow security baseline

Estima's two validation workflows use immutable full-length commit SHAs for third-party GitHub Actions. The workflow token is explicitly read-only (contents: read) and checkout does not retain credentials. This policy is enforced by scripts/audit-workflow-security.cjs and 11 Node regression tests, run before dependency installation in both workflows.

## Updating an Action

1. Identify the action's upstream official repository and intended release tag.
2. Resolve the tag to its exact commit SHA via the upstream GitHub Git refs API; for annotated tags resolve the target commit.
3. Review the release notes and diff; replace the SHA in every workflow using the action.
4. Run: node scripts/audit-workflow-security.cjs && node --test scripts/audit-workflow-security.test.cjs
5. Confirm both CI workflows pass on the new PR head. Do not weaken the audit to bypass failures.

The checker intentionally rejects floating tags, abbreviated SHAs, token write permissions and checkout credential persistence. Jobs requiring write scopes must undergo separate security review; no workflow currently requires them. This baseline does not replace branch protection, dependency auditing or independent review.
