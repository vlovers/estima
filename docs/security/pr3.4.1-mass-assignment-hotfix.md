# PR3.4.1 mass-assignment security hotfix

Implemented in `agent/backend`, based on `3094d58`. Implementation and final regression results were reviewed before commit. No historical migrations, lockfiles, frontend files, calibration algorithm, or QA worktree files were changed.

**Root cause and reproduction**

The HTTP bootstrap used `new ValidationPipe()` without whitelisting. TypeScript DTO types did not remove extra JSON properties at runtime. Registration and project creation spread request properties into TypeORM entities and used `save()`, which updates an existing row when given its primary key. Project updates used `Object.assign()` followed by cascading `save()`; task, estimate, and profile updates also forwarded request-derived property sets too broadly.

Before changing production code, two HTTP reproduction tests passed against the original implementation:

- Register an original account, then submit `POST /api/auth/register` with that account's UUID as `id`, a different unused email, and an attacker password. The server returned **201**, overwrote the account email, returned the victim UUID, and issued an access token that successfully accessed the victim's user endpoint.
- Create a victim-owned project, then submit `POST /api/projects` authenticated as another account with the victim project UUID as `id`. The server returned **201** and changed the existing project's name and `userId` to the attacker.

Result: **2/2 reproduction tests passed**, confirming both vulnerabilities. These permissive assertions were then replaced with rejection/integrity regression tests. The reproduction log is `/private/tmp/estima-pr341-reproduction.log`.

Every database run used the existing fail-closed disposable test utility: fixed environment marker, dedicated Docker container `ai-estimates-migration-test-db`, loopback port `55432`, test-only credentials, a unique `ai_estimator_integration_test_*` database, verification that the database did not exist, an empty-schema check, and connection identity verification. Baseline migrations ran only in those new databases. No production or shared development database was used or reset.

**Implemented controls**

- Global request validation now uses `whitelist: true` and `forbidNonWhitelisted: true`. The bootstrap and HTTP integration suites share the same pipe factory. Nested DTOs retain their existing recursive validation. Transformation and numeric coercion settings were not changed.
- User and project creation explicitly construct entities from allowed fields and authenticated ownership. User, project, task/subtask, estimate/manual-estimate, and feedback creation use insert-only persistence. Returned IDs come from PostgreSQL's insert result.
- Profile, project, task, and estimate updates explicitly map writable fields. Client primary keys and entity relations cannot enter update sets. Project updates include authenticated ownership in the update predicate and no longer cascade a request-modified graph through `save()`.
- Credential updates remain an internal authentication operation; the public profile DTO no longer accepts `refreshToken`. Public profile updates still only change email; the previously accepted password field remains ignored.
- Task edits accept the frontend's AI flags without persisting them as entity columns. A supplied task `projectId` must match its current project; reparenting is rejected.

**Endpoint audit and compatibility**

| Paths | Result |
| --- | --- |
| `POST /auth/register`, `POST /users` | Explicit email/password mapping; insert-only; injected IDs and unknown fields rejected. |
| `PATCH /users/:id` | Only the authenticated account's email can be written; no credential, primary-key, or relation assignment. |
| `POST /projects` | Insert-only, explicit project properties, ownership supplied by authentication. |
| Both project PATCH routes | Explicit scalar properties, owner-scoped update, no relation cascading. |
| `POST /tasks`, `PATCH /tasks/:id` | Explicit properties; insert-only creation; no relation/ID assignment on edits. |
| `PATCH /tasks/:id/clarify` | Nested clarification DTO validation rejects extra fields; service reads only question/answer and saves existing server-loaded entities. |
| Estimate POST/PATCH routes | Insert-only creation; explicit estimate fields on update; existing ownership predicates preserved. |
| Manager explanation PATCH | Validated explanation string only. |
| Feedback POST | Existing explicit field mapping retained; insert-only creation; processing fields are not client-writable. |
| Authentication login/refresh/logout | No request object is spread into persistence. Credentials/token handling continues through the existing authentication flow. |

No PUT handlers exist. Remaining `save()` calls update server-loaded entities during clarification, manual-estimate updates, feedback processing, or the unused legacy analysis path; they do not spread request bodies into entities.

Reviewed the current frontend registration/login helpers, project forms/API helpers, task create/edit forms/API helpers, clarification payload, and feedback form. HTTP regressions exercise the complete structured task payload with and without breakdown, actual profile email changes, manual task estimates, project updates, estimate updates, manager explanations, feedback, and project sorting/tree queries. The query DTO now declares the frontend's existing `tree` parameter so strict validation accepts it. The documented estimate `userId` field remains accepted but ignored for ownership; a regression verifies that it cannot grant the supplied user access. No frontend code changes are needed for these tested requests.

Intentional contract tightening: undeclared properties now receive HTTP 400 instead of being ignored or persisted; public `refreshToken` profile writes now receive 400. Current frontend request builders do not send that field. Password changes through the profile endpoint remain unsupported as before.

**Verification**

| Command/check | Result |
| --- | --- |
| Pre-fix targeted PostgreSQL HTTP reproduction | **2 tests passed**, both exploits confirmed. |
| `./node_modules/.bin/jest --config api/jest.config.ts --runInBand` | **87 tests / 12 suites passed**. |
| `yarn test:api:integration` | **111 tests / 3 suites passed**, including 60 mass-assignment/compatibility regressions (11 added in final QA hardening). |
| `tsc -p api/tsconfig.app.json --noEmit` | Passed. |
| `tsc -p api/tsconfig.spec.json --noEmit` | Passed. |
| `tsc -p api/tsconfig.integration.json --noEmit` | Passed, including final added regressions. |
| `tsc -p api-e2e/tsconfig.spec.json --noEmit` | Passed. |
| `NX_DAEMON=false NX_ISOLATE_PLUGINS=false ./node_modules/.bin/nx build api` | Production webpack build passed. |
| Targeted frontend project/task API Vitest suites | **5 passed / 1 failed**. Existing project-fetch test expects an inline `?tree=true` URL while the unchanged helper uses Axios `params: URLSearchParams`. Reproduced with the same 5-pass/1-fail result from a clean archive of HEAD `3094d58`; both source files have identical Git object hashes in HEAD and this worktree. Axios serializes the helper parameters to `/projects/proj-1?tree=true`. The matching real HTTP query passes backend integration coverage. |
| `git diff --check` | Passed. |

Final logs are `/private/tmp/estima-pr341-integration.log` and `/private/tmp/estima-pr341-final-{unit,build,web-api,ts-app,ts-spec,ts-integration,ts-e2e}.log`. The clean-HEAD frontend comparison is `/private/tmp/estima-pr341-head-web-api.log`. Expected negative-test errors appear in integration output; the final suite status is passing.

Environment issues: `npm ci` could not install because the existing `package-lock.json` is out of sync with `package.json`. Dependencies were installed using `yarn install --frozen-lockfile --non-interactive --ignore-engines --network-timeout 30000`; neither lockfile changed. The engine override was needed for an existing lint dependency requiring a newer Node patch than installed Node 20.18.0. Backend tests, TypeScript checks, and production build all passed on that runtime. The first sandboxed database attempt stopped at Docker socket access; the approved rerun executed against the disposable target.

**Final independent-QA regression hardening**

Only `api/src/modules/security/mass-assignment.int-spec.ts` and this report changed during the final hardening pass. The existing tracked hotfix diff was checked byte-for-byte against its pre-pass snapshot (SHA-256 `e2fdaf65bacbb516bd247aeafd8733772fba03d08f27c4084feca6785ea8db34`). No production implementation, frontend, or refresh-token changes were added in this pass.

- Added nine nested project attacks: `user: { id: victimUserId }`, `tasks: [{ id: victimTaskId, title: "tampered" }]`, and tasks with nested victim estimates, each exercised against project creation and both PATCH endpoints.
- Seeded real foreign-owned task/estimate rows. Estimate relation and ID injections now use the correct entity UUIDs, with explicit checks of the estimate → task → project → tenant ownership chain.
- Added profile primary-key injection with a generated unused UUID on a newly registered account. The test verifies absence of project, tenant-coefficient, and coefficient-event dependants, rejects the request, and confirms the original account persists and the unused UUID stays absent.
- Added complete before/after row comparisons across users, projects, tasks, and estimates for relevant rejected attacks, including authenticated user creation. PostgreSQL `to_jsonb` preserves exact timestamp text instead of the driver's millisecond-only `Date` conversion. Victim fixtures contain six fractional digits in both creation and update timestamps, with an explicit precision assertion. Direct-service bypass tests also preserve complete foreign victim rows and compare the target estimate's exact original creation timestamp.
- Existing valid registration, project/task/estimate updates, and frontend payload compatibility tests remain passing.

The frontend comparison was executed from a clean `git archive HEAD` under `/private/tmp/estima-pr341-frontend-head-1b3bsrsq`, using its exported Vite configuration and the same installed dependencies. Both the archive and current tree fail only `Projects API > should call api.get with correct id when fetchProject is called` at `projects.api.spec.ts:31`, with the same expected inline URL versus received Axios `params` call. Git blob hashes match for the implementation (`aae0c316df030dfeb39a0b5e9b18f172c6318899`) and test (`dd328da736b1d62ebc20a39b68962e0691671d3d`). This is a pre-existing test expectation mismatch; no frontend files were edited.

**Exact changed files**

- `api/src/main.ts`: install the hardened global validation pipe.
- `api/src/validation.pipe.ts` (new): shared strict pipe factory.
- `api/src/modules/users/users.service.ts`: explicit mappings, insert-only creation, restricted profile updates.
- `api/src/modules/users/dto/update-user.dto.ts`: remove public refresh-token writes.
- `api/src/modules/users/users.service.spec.ts`: insert-based hashing/creation checks and profile allowlist regression.
- `api/src/modules/projects/projects.service.ts`: explicit mappings, insert-only creation, owner-scoped scalar updates.
- `api/src/modules/projects/dto/sort-project-tasks.dto.ts`: declare existing frontend tree-query contract.
- `api/src/modules/tasks/tasks.service.ts`: insert-only task creation, explicit update mapping, prevent reparenting.
- `api/src/modules/estimates/estimates.service.ts`: insert-only creation and explicit update mapping.
- `api/src/modules/estimates/estimates.service.spec.ts`: align creation assertions with inserts.
- `api/src/modules/estimate-feedback/estimate-feedback.service.ts`: insert-only feedback creation.
- `api/src/modules/estimate-feedback/estimate-feedback.service.spec.ts`: retain idempotency/race tests with insert persistence.
- `api/src/modules/security/tenant-isolation.int-spec.ts`: use production validation configuration.
- `api/src/modules/security/mass-assignment.int-spec.ts` (new): 60 disposable PostgreSQL HTTP/service security and compatibility regressions.
- `docs/security/pr3.4.1-mass-assignment-hotfix.md` (new): this review and verification record.

**Remaining risks and work outside this hotfix**

The fix prevents new exploitation; it does not restore accounts/projects already changed or invalidate previously issued tokens. Access-token validation remains stateless. Deployment therefore needs an incident assessment of any exposed environment and an intentional session/token invalidation decision if compromise is suspected. No production data or authentication secrets were changed here.

The existing feedback duplication, stale calibration context, duplicate-tag numerical risk, and stranded feedback recovery issues from the PR3.4 review remain outside this mass-assignment hotfix. No PR3.5 work was started. Existing request-size/rate-limit controls, registration uniqueness races, and broader authentication/session design were not changed. The stale frontend test expectation and dependency-lock/engine inconsistencies are reported above and left outside scope.
