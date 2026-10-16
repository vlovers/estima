# PR3.4.2 authentication and refresh-token hardening

QA-approved implementation prepared for GitHub on `fix/pr3.4.2-auth-hardening`, from verified base `d285c609f1c25dc365acff2639307f41474c5374`. Implementation and review took place in the existing `estima-auth-hardening` worktree on `agent/auth-hardening`. The existing authentication code, security suites, and PR3.4.1 report were read first. The prepared `authentication-hardening.int-spec.ts` was preserved and incorporated into this worktree. No branches were merged or cherry-picked. Production data, secrets, historical migrations, entities/schema, dependency manifests, and lockfiles were not changed. The final independent QA verdict is **GO**, as reported by the maintainer in the GitHub-preparation instruction; publication does not authorize merge or deployment.

**Root causes and resulting behavior**

1. Raw refresh JWTs were bcrypt-hashed. Bcrypt ignores bytes after the first 72, so distinct JWTs with a common prefix could match the same stored verifier. The new `sha256:<hex>` verifier digests the entire serialized token and compares fixed-length digests with `timingSafeEqual`. JWT signature, HS256 algorithm, expiration, issue time, UUID subject, and token purpose are also validated. Both token types reject `iat` more than 30 seconds ahead of the verifier clock; exactly 30 seconds is tolerated. This does not extend expiration or change signature, algorithm, purpose, or `nbf` checks. Legacy bcrypt refresh verifiers are never used as a fallback.
2. Previously, the same subject/email/time claims could produce identical JWTs in one second. Every refresh JWT now contains a cryptographically random UUID v4 `jti` and `tokenUse: 'refresh'`. New access JWTs have `tokenUse: 'access'`. Equal access/refresh signing secrets fail startup; separate keys protect the retained compatibility path for legacy access JWTs without a purpose claim.
3. Refresh previously performed independent read/verify/write operations. Rotation now updates `users.refreshToken` only where both the user ID and expected current verifier still match. PostgreSQL rechecks that predicate after concurrent writers: exactly one request can replace a given verifier. Tokens and the replacement cookie are returned only after that update affects one row. Replay and losing requests perform no writes and set no cookie.
4. Logout still clears the stored verifier and browser cookie. Its database update and rotation's conditional update serialize on the same row. If logout wins first, an in-flight refresh cannot resurrect the session. If rotation wins first, subsequent logout invalidates its replacement. Already-issued access tokens retain the existing lifetime semantics.
5. New password writes use versioned, salted scrypt with `N=32768, r=8, p=3`, a random 16-byte salt, 32-byte result, and a 64 MiB per-call memory ceiling. It hashes the full UTF-8 password, including ASCII/Unicode suffixes beyond byte 72. Registration/login DTOs reject unpaired UTF-16 surrogates with HTTP 400. Internal hashing also rejects them, and verification returns false before scrypt or bcrypt. Valid Unicode, including U+FFFD, is accepted verbatim without normalization. Existing bcrypt passwords remain readable. A successful legacy login with fewer than 72 UTF-8 bytes is upgraded using a password-hash compare-and-swap; if another credential write wins, the current password is reverified before authorization.
6. A concurrent email insert that loses the existing PostgreSQL email unique constraint now returns HTTP 409. Unexpected database errors remain errors rather than being mislabeled as conflicts. Insert-only creation and explicit field mappings from PR3.4.1 remain intact.
7. Login bodies are validated before Passport executes, since guards run before global pipes. Non-string credentials, malformed body shapes, and unknown properties return controlled errors. Refresh rejects body fields and safely handles absent, JSON-object/array, oversized, and malformed cookie values. No client-supplied ownership or processing fields enter persistence.
8. Refresh JSON now contains **only `{ accessToken }`**. The replacement refresh token is delivered exclusively through the existing HttpOnly cookie; login/registration and user responses also omit refresh credentials. The actual frontend only consumes `accessToken` and sends cookies with `withCredentials: true`.
9. The frontend excludes refresh, login, and registration URLs (including refresh URL/query/trailing-slash variants) from recursive refresh interception. The refresh endpoint is handled before protected-resource retry logic; a direct refresh 401/403 also clears authentication and triggers sign-in recovery without another refresh attempt. One shared promise serves concurrent callers. All callers reject on refresh failure; localStorage/default bearer headers are cleared and the browser is sent to sign-in once. Each resource is retried at most once, late old-token 401s reuse an already rotated access token, and a failed retried resource cannot start another refresh. Network/metadata errors reject safely. A 10-second refresh timeout bounds waiting. Aborting one caller cancels its wait without canceling the shared refresh; logout can still refresh expired access before invalidating the session.

The underlying 72-byte behavior is documented by the [bcrypt maintainers](https://github.com/kelektiv/node.bcrypt.js#security-issues-and-concerns). The selected scrypt profile is listed in [OWASP's password-storage guidance](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html#scrypt); the implementation uses the asynchronous [Node crypto scrypt API](https://nodejs.org/api/crypto.html#cryptoscryptpassword-salt-keylen-options-callback). The version prefix fixes these parameters; future parameter changes require a new format version.

**Password compatibility limitation**

A legacy bcrypt hash cannot reveal whether the original password ended at 72 bytes or had an additional suffix. Rebinding that hash to whichever long input arrives first would silently make one ambiguous candidate authoritative and could lock out the user with the actual original password. Therefore legacy logins of 72 bytes or more remain bcrypt-backed and are not silently rebound. Legitimate long ASCII and Unicode logins continue to work. Their historical suffix ambiguity remains until a user-verified credential reset installs a new scrypt hash. This PR does not invent a reset/identity-verification workflow or claim to recover information already discarded by bcrypt.

**Safe rollout and existing-session strategy**

- Validate that the existing access and refresh secrets are distinct before deployment. This change does not modify them. If an environment currently shares keys, plan a separate coordinated key transition; the new code deliberately refuses that unsafe configuration.
- Use an atomic blue/green cutover for authentication traffic and drain old auth writers. Do not mix this version with an old binary that writes raw-token bcrypt verifiers or cannot read scrypt password hashes. No schema migration or bulk database rewrite is needed.
- With unchanged distinct keys, valid legacy access JWTs issued by the existing app remain accepted until their original expiration. Legacy refresh cookies and stored bcrypt refresh verifiers fail closed: users must sign in once to obtain a new refresh session. Do not reset shared data or attempt an automatic truncated-token migration.
- Login/registration response shapes, cookie name, HttpOnly/SameSite/Secure behavior, and logout response remain compatible. Refresh JSON deliberately removes `refreshToken` and returns only `{ accessToken }`; the actual frontend is compatible and receives rotation via the browser cookie. External clients relying on JSON refresh tokens must adopt cookie storage/transport before cutover. Existing clients that refresh with an empty body continue to work; clients sending ignored body fields must remove them.
- Release the frontend recovery fix before or together with the backend cutover, and ensure cached clients reload the updated frontend. It is compatible with the previous backend response. Legacy refresh rejection must lead to a controlled sign-in state rather than the old recursive 401 queue. Concurrent refresh losers still receive 403; the frontend serializes refresh per module/tab, while independent tabs/devices can still race.
- Maintain verifier/issuer clocks within the documented 30-second future-`iat` allowance. Expiration remains strict. Previously created passwords containing unpaired surrogates now require a verified reset; valid Unicode passwords are unchanged.
- A binary rollback to the original implementation is unsafe after new password hashes have been written: that binary cannot read them. Roll forward, or first provide a rollback build with the new password/token readers. Database schema compatibility alone is insufficient for rollback.
- Monitor login/re-authentication failures, replay/conflict rates, and password KDF CPU/memory load during the cutover. No production rollout, secret rotation, user reset, or operational session invalidation was executed here.

**Phase D QA remediation**

The initial independent Phase D verdict was NO-GO with two P1 and two P2 failures. All four were corrected. The maintainer subsequently reported final independent **GO**, with independent unit, PostgreSQL integration, adversarial, frontend, and local Chrome checks passing. Independent numeric counts were not supplied; the exact developer-run counts below are separate evidence.

| QA finding                        | Fix and regression evidence                                                                                                                                                                                                                                                                                                                                                                       |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1: Refresh token in JSON         | Controller explicitly maps only `accessToken`; unit and real HTTP tests assert exact JSON keys, absence of raw cookie token, and secure/HttpOnly/SameSite cookie rotation. Existing tenant-isolation authentication assertions now use the replacement cookie and check logout invalidation. Login, registration, and user response paths were audited for credential exposure.                   |
| P1: Frontend refresh 401 deadlock | Real Axios interceptors with a controlled adapter reproduce resource 401 followed by refresh 401. Regressions cover concurrent 401/403/503 refresh failures, network/timeout failure, malformed refresh responses, successful shared refresh/retry, late 401s, bounded retry, metadata errors, AbortSignal cancellation, explicit sign-in recovery, URL variants, and logout with expired access. |
| P2: Ill-formed Unicode passwords  | Six distinct malformed surrogate inputs are rejected by registration/login DTOs and by internal hashing/verification. HTTP attacks target an account whose valid U+FFFD password would previously encode to the same bytes and assert complete row preservation. Valid emoji, multibyte, U+FFFD, and composed/decomposed distinctions remain supported.                                           |
| P2: Future-issued JWTs            | Shared validation enforces `iat <= floor(Date.now()/1000) + 30`. Unit tests exercise both kinds at the boundary and beyond; real signed HTTP tokens at +30 succeed, +31 fail before state changes, including a refresh token with a matching stored verifier. Existing expiry/signature/substitution/purpose tests still pass.                                                                    |

**Verification and reproduction commands**

All HTTP/PostgreSQL cases use the existing fail-closed harness: a dedicated Docker test container, loopback port 55432, test-only identity/credentials, a unique previously nonexistent database, empty-schema verification, and connected-identity assertions. Baseline migrations run only in those newly created databases. No existing database is reset.

Run from `estima-auth-hardening` (the package scripts may also be invoked with Bun):

```sh
./node_modules/.bin/jest --config api/jest.config.ts --runInBand
yarn test:api:integration
./node_modules/.bin/vitest run --config web/vite.config.ts
./node_modules/.bin/vitest run --config web/vite.config.ts web/src/app/services/authApiService.spec.ts -t 'QA matrix'
./node_modules/.bin/tsc -p api/tsconfig.app.json --noEmit
./node_modules/.bin/tsc -p api/tsconfig.spec.json --noEmit
./node_modules/.bin/tsc -p api/tsconfig.integration.json --noEmit
./node_modules/.bin/tsc -p api-e2e/tsconfig.spec.json --noEmit
./node_modules/.bin/tsc -p web/tsconfig.app.json --noEmit
./node_modules/.bin/tsc -p web-e2e/tsconfig.json --noEmit
./node_modules/.bin/tsc --noEmit --target es2020 --module esnext --moduleResolution bundler --jsx react-jsx --esModuleInterop --allowSyntheticDefaultImports --skipLibCheck --strict --types vitest/globals,node web/src/app/services/authApiService.spec.ts
node ./node_modules/eslint/bin/eslint.js --config api/eslint.auth.config.cjs 'api/src/modules/auth/**/*.ts' 'api/src/modules/users/**/*.ts' web/src/app/services/authApiService.ts web/src/app/services/authApiService.spec.ts --max-warnings=0
NX_DAEMON=false NX_ISOLATE_PLUGINS=false yarn build:api
yarn build:web
git diff --check
```

| Final verification               | Result                                                                                                          |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| API unit                         | **99 passed / 14 suites**.                                                                                      |
| Full HTTP/PostgreSQL integration | **159 passed / 4 suites**, including 48 authentication cases and all 111 existing security/calibration cases.   |
| Full frontend unit               | **39 passed / 5 files**, including 27 interceptor regressions.                                                  |
| Explicit four-scenario QA matrix | **4 passed**, with the other 23 interceptor cases intentionally filtered for this focused command.              |
| TypeScript                       | **All seven checks passed**: API app/spec/integration, API e2e, web app, web e2e, and focused interceptor spec. |
| Scoped auth/user/frontend lint   | **Passed with zero warnings** using the exact command above.                                                    |
| API production build             | **Passed**.                                                                                                     |
| Web production build             | **Passed**, with existing Vite CJS-deprecation and bundle-size warnings.                                        |
| Diff whitespace                  | **Passed**.                                                                                                     |

The first Phase D integration run had one obsolete assertion expecting JSON `refreshToken` (158/159 passed). It was corrected to assert the cookie-only contract and logout with the replacement cookie; the full rerun passed. An initial frontend TypeScript narrowing error was fixed by accepting unknown interceptor errors and explicitly checking Axios errors. Before Phase D edits, the frontend baseline was 12/12 passing and its app TypeScript check passed; no unrelated frontend changes were needed. The earlier historical frontend failure is not present on this base.

Final logs are outside the repository at `/private/tmp/estima-pr342-phase-d-{unit,integration,web,lint,build-api,build-web,ts-app,ts-spec,ts-integration,ts-api-e2e,ts-web,ts-web-e2e,ts-web-spec}.log`. Expected negative-test schema/calibration errors appear in the passing integration log. No dependency installation, migrations outside disposable databases, or secret changes were needed for this pass. The lint configuration uses existing dependencies; its Nx target covers auth/users, and the command above additionally covers both frontend service files.

**Changed files**

All 17 pre-QA files were retained. The reviewed snapshot contained **24 files: 13 tracked modifications and 11 untracked additions** before publication. All 24 paths below belong to this PR. These include the original implementation, its tests/lint/report, the shared password validator and two new security unit suites, the registration DTO, the tenant-isolation contract assertion, and the frontend interceptor with its regression suite. Ordinary `git diff` omits untracked additions; QA must inspect those explicitly.

```text
api/eslint.auth.config.cjs
api/project.json
api/src/modules/auth/auth.controller.spec.ts
api/src/modules/auth/auth.controller.ts
api/src/modules/auth/auth.service.spec.ts
api/src/modules/auth/auth.service.ts
api/src/modules/auth/authentication-hardening.int-spec.ts
api/src/modules/auth/dto/login.dto.ts
api/src/modules/auth/guards/auth-request.guards.ts
api/src/modules/auth/password-hashing.spec.ts
api/src/modules/auth/password-hashing.ts
api/src/modules/auth/password-validation.ts
api/src/modules/auth/strategies/access-token.strategy.ts
api/src/modules/auth/strategies/jwt-strategies.spec.ts
api/src/modules/auth/strategies/refresh-token.strategy.ts
api/src/modules/auth/token-security.spec.ts
api/src/modules/auth/token-security.ts
api/src/modules/security/tenant-isolation.int-spec.ts
api/src/modules/users/dto/create-user.dto.ts
api/src/modules/users/users.service.spec.ts
api/src/modules/users/users.service.ts
docs/security/pr3.4.2-authentication-hardening.md
web/src/app/services/authApiService.spec.ts
web/src/app/services/authApiService.ts
```

**Confirmed-failure follow-up and new QA handoff**

The current worktree was inspected again after QA repeated its NO-GO report. It already contained the earlier cookie-only response, surrogate checks, future-`iat` policy, and recursive-refresh exclusion. An explicit four-scenario regression matrix was added without removing any existing tests. Before this follow-up correction, the three concurrent-request cases passed on this snapshot; the direct refresh 401 test rejected without recursion but failed because the old token remained in localStorage. The correction moves refresh-endpoint failure handling ahead of every protected-resource retry decision and clears authentication on direct refresh 401/403. Internal refresh failures still reject the shared promise and every waiter; the idempotent expiry handler triggers one sign-in recovery.

| Exact QA scenario                     | Final result                                                                                                                                           |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Three protected requests, refresh 200 | **PASS**: one refresh, all three requests succeed after one retry each.                                                                                |
| Three protected requests, refresh 403 | **PASS**: one refresh, all three reject, no protected retry, credentials cleared, one sign-in recovery.                                                |
| Three protected requests, refresh 401 | **PASS**: one refresh, all three reject, no pending/self-referential promise, credentials cleared, one sign-in recovery.                               |
| Direct refresh 401                    | **PASS**: one direct call, no recursive attempt, rejection settles, credentials cleared, one sign-in recovery; a late protected 401 starts no refresh. |

The matrix forces all three initial protected 401s to arrive before the refresh gate is released. Every case has a two-second test deadline to expose pending promises. The full frontend suite additionally covers URL variants, errors without metadata, network/timeout failures, cancellation, bounded resource retry, and logout. Before/after focused evidence is in `/private/tmp/estima-pr342-confirmed-before.log` (one direct-session-cleanup assertion failure, three passing cases) and `/private/tmp/estima-pr342-confirmed-matrix.log` (all four pass). The normal Phase D log paths above were refreshed by a new full verification run; the final counts in this report describe that run.

Only these files changed during this follow-up: `web/src/app/services/authApiService.ts`, `web/src/app/services/authApiService.spec.ts`, and this report. All 24 previously present changed paths remain; in particular, the original 17 implementation paths and the complete PostgreSQL authentication suite were preserved. The backend fixes were re-inspected and verified without rewriting them.

The review included all untracked files, which ordinary `git diff` omits. The verified base is `d285c609f1c25dc365acff2639307f41474c5374`; all fixes were uncommitted at the handoff. GitHub preparation rechecked the complete 24-file snapshot against its final SHA-256 manifest and verified every source fingerprint below before any commit. These SHA-256 source fingerprints identify the code exercised by the final checks:

```text
6778d64402457a997f99bae9893130321f895b6fc8ffc9a1dbb9fba036dc2356  web/src/app/services/authApiService.ts
965fd9474e8b39227c16a9ec2621022488ec9b7cdc0393c60422f06637a34980  web/src/app/services/authApiService.spec.ts
4210cc5098841ae4e9bb57af2efed6b29c7d16e61d4b74f82a445ae59189aa58  api/src/modules/auth/auth.controller.ts
00fb9ce9c03cde9fde262324efb1703232fda9a786ff6598ebca31473b2c9f6f  api/src/modules/auth/password-validation.ts
281e5cc4d307d5d3f006094682f3cd6d03d3ceccc1b1801d1d1bb59e55fd8dba  api/src/modules/auth/password-hashing.ts
fe18b3f3da41cdc2dc8011da2d66411220e6f869a8d3fa4f176b26855b5b2874  api/src/modules/auth/token-security.ts
```

All seven TypeScript checks, scoped lint, both production builds, full backend/frontend unit suites, and the full disposable PostgreSQL integration suite were rerun successfully after this correction. No dependency, entity, or migration changes were added. The later independent QA verdict is GO, as reported by the maintainer; these results and publication do not authorize deployment.

**Independent QA coverage and remaining limitations**

- Verify all four Phase D attacks against real endpoints and inspect the exact access-only response plus HttpOnly/Secure/SameSite cookie flags. Include login/register/user responses and the complete PR3.4.1 suite.
- Re-run concurrent refresh/replay/logout tests and inspect the barriers to confirm real PostgreSQL decides the conditional-write winner. Confirm the loser never writes state or returns a replacement cookie.
- Exercise a real browser with expired/revoked/legacy cookies, several simultaneous failed resource requests, cancellation, and successful renewal. Frontend regressions use real Axios interceptors with a controlled transport, while HTTP tests use real Nest/PostgreSQL; developer verification did not exercise browser navigation and cookie policy with browser automation. The maintainer subsequently reported passing independent local Chrome checks. Verify `/login` is reached and all pending requests settle on failure.
- Verify exact +30/+31 second issue-time boundaries on access and refresh JWTs and that expiry, algorithm, purpose, and signature checks remain strict. Test malformed surrogates separately from valid multibyte Unicode and canonical distinctions.
- Validate the coordinated rollout: distinct existing signing keys, updated/cached frontend handling, drained old auth writers, one legacy refresh re-authentication, readable legacy bcrypt passwords, and a rollback binary that understands new stored formats.

Legacy bcrypt suffix ambiguity remains for 72+ UTF-8 bytes until verified reset. The one-refresh-session-per-account model and access-token validity until expiration after logout are unchanged. Lost successful rotation responses can require sign-in. Refresh sharing is per frontend module/tab; cross-tab coordination is not added. Rate limiting, credential-stuffing defenses, user-enumeration timing, verified reset/email flows, and KDF admission control/capacity remain separate work. Previously compromised accounts/keys are not repaired by this code change.

No final verification failures remain. Independent QA has issued GO according to the maintainer. GitHub preparation changes only publication metadata in this report; the other 23 reviewed files and all six source fingerprints remain identical to the approved snapshot. No merge, deployment, production-data/secret changes, or edits to another worktree are authorized or performed.


**GitHub preparation and PR #5 integration notes**

`origin/develop` was freshly fetched and still resolves to `d285c609f1c25dc365acff2639307f41474c5374`. The dedicated `fix/pr3.4.2-auth-hardening` branch was created directly from that base with the reviewed worktree contents preserved. No commits from another branch were merged or cherry-picked. Sensitive-data/path checks found no production secrets, generated files, logs, database artifacts, migration changes, or unrelated paths in the 24-file set. Test keys and database credentials are explicitly disposable fixtures. Test results remain representative because application, test, and lint/build configuration bytes match the final reviewed manifest.

[PR #5](https://github.com/vlovers/estima/pull/5), `ci/develop-hardening-20261016`, was inspected read-only at `2a262b434f4ec968a7b7edb9056936113aa7b0f9`. GitHub currently reports it open and ready for review (`isDraft: false`), although it was described as draft in the handoff. Its base is the same `d285c609` commit. A three-way file-content comparison was run only against temporary copies; no worktree/index/branch merge was performed.

Seven files overlap. Six have textual conflicts:

- `api/src/modules/auth/auth.controller.spec.ts`
- `api/src/modules/auth/auth.service.spec.ts`
- `api/src/modules/auth/auth.service.ts`
- `api/src/modules/security/tenant-isolation.int-spec.ts`
- `api/src/modules/users/users.service.ts`
- `web/src/app/services/authApiService.ts`

The seventh, `api/src/modules/auth/auth.controller.ts`, has a duplicated cookie-only refresh response/cookie rotation change and combines textually cleanly in that comparison. Token `jti` generation and frontend recursion protection also overlap semantically. Textual cleanliness does not establish compatibility.

PR #5 stores `v2:` plus bcrypt(SHA-256(token)) and retains one-time verification of legacy bcrypt(raw JWT). This PR stores `sha256:` full-token digests, rejects legacy refresh verifiers, validates token purpose/issue time, and uses an atomic compare-and-swap for rotation. These are incompatible session formats and rollout policies. Do not reintroduce the legacy truncated-token fallback or replace the conditional rotation with an unconditional setter when reconciling the branches. PR #5's CI/CORS changes and additional tests are outside this reviewed implementation and have not been imported. Reconcile or remove its overlapping authentication changes explicitly before any later integration, then rerun authentication, concurrency, password, frontend, browser, and PostgreSQL security checks.

The GitHub PR description records the independent QA GO, developer verification counts, cutover/rollback requirements, remaining limitations, and this overlap. Open the PR targeting `develop` with a normal push only; do not merge or deploy as part of preparation.
