# Real integration verification and AI error handling

## Scope and evidence

Started from `origin/develop` at `314258e` (the merged UI redesign), in the isolated
branch `fix/real-integration-ai-errors`. Existing worktrees, local secrets, the
development database and its Docker volumes were not changed.

The retained local `ai-estimates-api` logs contained two failed AI analysis
boundaries with OpenAI `429` / `insufficient_quota`. Raw logs were inspected
privately, not attached to the PR. That is evidence of a provider/account quota
failure, not a PostgreSQL failure. No new request was sent to the paid provider.

The application defect was the error boundary: `TasksService.create` awaited
`AiEstimatorService.createInitialAnalysis`; the AI service swallowed the initial
quality-assessment error, attempted another provider request, then rethrew the
SDK error unchanged. Nest treated that non-HTTP exception as an unexplained 500.
The task had not yet reached its first database insert. The frontend displayed
the generic server error it received.

A local HTTP provider stub reproduced this through the actual OpenAI SDK,
Nest controllers/validation/authorization and disposable PostgreSQL. On the base
implementation, six regression cases failed with HTTP 500; the successful
provider-response fixture persisted correctly. This distinguishes the observed
quota/configuration problem from the confirmed application error-handling defect.

Two further defects were confirmed during manual-estimate verification:

- Explicit `useAiEstimate: false` still called AI and failed when quota was
  exhausted. The request flag was ignored by task creation.
- `createOrUpdateManualEstimate` initialized `manualEstimate` but left the
  database default `finalEstimate` at zero. The UI selects `finalEstimate` for the
  displayed manual result. Updating a manual-source record also left that value
  stale. A real database assertion observed manual hours 8 and displayed hours 0.

Malformed provider JSON was separately reproduced as a generic 500. It is a
deterministic regression scenario, not a claim about the historical live response.

## Fixes

- Fail with sanitized HTTP 503 for provider quota, configuration, rate-limit,
  network and availability errors. A provider timeout maps to 504; invalid
  analysis responses map to 502. No raw provider bodies, headers, keys or stack
  traces are returned or logged by these error paths.
- Stop after a provider failure in the quality-assessment phase rather than
  immediately attempting a second analysis request. The SDK retains its existing
  retry policy; transient model/schema compatibility fallback is unchanged.
- Validate the existing analysis response structure before caching or persistence.
  Keep the existing optional top-down fallback, with sanitized logging.
- Honor explicit AI opt-out, persist the supplied task context and optional manual
  estimate, and retain existing behavior for older callers that omit the flag.
- Initialize/update a manual-source result with the submitted manual hours. Adding
  a manual reference to an AI/final-source record does not change its estimate.

No endpoints, DTO contracts, authorization behavior, authentication implementation,
schemas or migrations were changed. Task edits still update fields and manual
references; they do not invoke a new AI analysis (existing endpoint behavior).

## Reproduction and verification

Use Node 24 and Bun 1.3.2. The existing Compose stack must be available, including
its disposable `postgres-migration-test` service. Never point these tests at the
development database or change their safety markers.

```sh
# Only if needed, from the existing Compose checkout that owns its local env:
docker compose -p ai-estimates-monorepo --profile test up -d postgres-migration-test

# From the isolated fix worktree:
bun install --frozen-lockfile --ignore-scripts
bun run test:api:integration --runTestsByPath api/src/modules/ai-estimator/ai-provider-errors.int-spec.ts
```

The regression creates a uniquely named disposable database, applies the existing
baseline migrations and starts a local HTTP stub on a random loopback port.
`OPENAI_BASE_URL` is set to that stub and the SDK uses a dummy test key. There are
no mocked Nest services, repositories or API responses in this regression suite.
It exercises:

1. Register a disposable account and create an owned project through HTTP.
2. Submit `POST /api/tasks` with normal React task context, `useAiEstimate: true`
   and `breakdown: false`.
3. Return OpenAI-compatible 429/`insufficient_quota` from the local provider.
   Before the fix: generic 500. After: sanitized 503 and no task row.
4. Repeat with authentication, rate-limit, availability and malformed-JSON responses.
5. Submit `useAiEstimate: false` while the stub returns quota errors: 201,
   zero provider requests, manual hours persisted; PATCH the hours and verify them.
6. Return deterministic successful quality/analysis/top-down responses; verify AI
   and final estimates through subsequent HTTP GET and direct PostgreSQL reads.

To reproduce the before/after comparison without touching an existing worktree,
create a separate detached worktree at `314258e`, copy only the new
`ai-provider-errors.int-spec.ts` into it, install frozen dependencies and run the
same focused command. Its expected assertions fail against the base error behavior.

For the browser smoke, build the API image and run:

```sh
docker build -f api/Dockerfile -t estima-api:real-integration .
node scripts/testing/real-workspace-smoke.cjs
```

This local-environment harness expects the existing Docker frontend at
`http://localhost`, test database container `ai-estimates-migration-test-db`,
network `ai-estimates-monorepo_app-network`, and free ports 3301 and 4319. It uses
Chrome on macOS, or `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`, or installed Playwright
Chromium. It requires Docker access and local socket/browser permissions.

It starts an isolated API container against another freshly migrated disposable
database and uses only dummy provider/JWT credentials. Its OpenAI base URL points
to the local deterministic HTTP stub. The application's fixed `:3000` API requests
are forwarded to this container at `:3301` by Playwright. API response bodies,
statuses and headers are not fabricated or rewritten. The frontend itself is the
actual Docker/Nginx production build. Existing API/database containers are untouched.

The script stops only its own `--rm` API container. Disposable test databases
remain available for inspection, following the existing test-harness convention;
no existing database or volume is deleted. Screenshots and a test-only environment
file are written under `/private/tmp/estima-real-smoke` outside the repository.
The environment file has mode 0600 and contains no real provider or local secrets.

Additional validation commands:

```sh
node node_modules/typescript/bin/tsc --noEmit -p api/tsconfig.app.json
node node_modules/typescript/bin/tsc --noEmit -p api/tsconfig.spec.json
node node_modules/typescript/bin/tsc --noEmit -p api/tsconfig.integration.json
node node_modules/typescript/bin/tsc --noEmit -p web/tsconfig.app.json
NX_DAEMON=false NX_ISOLATE_PLUGINS=false bun run lint
node node_modules/jest/bin/jest.js --config api/jest.config.ts --runInBand
node node_modules/vitest/vitest.mjs run --config web/vite.config.ts
bun run test:api:integration
bun run build:web
```

## Results (2026-10-17)

| Check                                                      | Result                                         | Dependencies                                                                        |
| ---------------------------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------- |
| API app, API unit/integration tests and web app TypeScript | Passed                                         | No database/provider                                                                |
| API and frontend lint                                      | Passed                                         | No database/provider                                                                |
| Backend unit tests                                         | 131 passed, 15 suites                          | Repository/provider mocks; local HTTP CORS checks                                   |
| Frontend unit tests                                        | 51 passed, 8 files                             | API mocks                                                                           |
| HTTP/PostgreSQL integration tests                          | 167 passed, 5 suites                           | Real disposable PostgreSQL; deterministic provider boundaries                       |
| New AI error/persistence integration suite                 | 7 passed, included above                       | Real Nest HTTP, OpenAI SDK and PostgreSQL; local HTTP provider stub                 |
| API production Docker build and startup                    | Passed                                         | Native local ARM64 Docker image                                                     |
| Web production build                                       | Passed                                         | Same frontend sources as the Docker-served UI                                       |
| Docker browser smoke                                       | Passed                                         | Real Nginx frontend, isolated Nest API container and PostgreSQL; provider stub only |
| CORS preflights                                            | Passed for both local origins with credentials | Real isolated Docker API                                                            |

The real browser smoke verified registration, failed/successful login, the
HttpOnly refresh cookie, refresh after a rejected resource token, logout and
refresh rejection, project/task creation/editing/deletion, manual creation with
zero provider calls, manual-hour updates, sanitized quota errors with preserved
form input, and successful deterministic AI result persistence after reload.
The quota failure left no partially created task.

Backend unit tests initially encountered sandbox socket restrictions; rerunning
with local server permissions passed. Initial browser harness attempts exposed
selector/overlay timing issues; named dialogs and the visible switch label fixed
the harness without frontend changes.

## Limitations

The live provider path is **not verified**. Paid calls were not authorized or made;
the observed account quota condition requires administrator attention. Successful
AI persistence checks use explicitly deterministic provider responses, not live AI.
Browser checks cover Chromium desktop, not all browsers or physical devices.
The smoke uses a separate API/database so existing development records and secrets
remain intact. It does not replace or restart the user's running API.

An existing result-contract inconsistency remains outside this error-handling fix:
the calibrated final estimate emits confidence as 70, while the redesigned card
only displays fraction-valued confidence in 0–1 (individual task estimates use
fractions). The smoke verifies persisted hours/ranges, not confidence calibration
or live model quality. Aligning that contract, including historical rows, should
be a separate reviewed change; this PR does not reinterpret stored confidence.
