# Estima workspace redesign v1

## Scope and audit

Based on `origin/develop` at `66f131a22f1321d38bf92759892458c7a9b57849`.
The app remains React 19, React Router, Mantine 8 and React Query. The existing
Axios services, authentication hooks/store, refresh handling, request payload
contracts and backend are unchanged. No dependencies were added.

The audit found a placeholder dashboard, project-card links wrapping interactive
menus, duplicated create/edit task forms, disconnected task actions, a settings
button with no destination, inconsistent page layouts and limited mobile
navigation. Estimates could be counted repeatedly across sources and subtasks;
some detail UI inferred information the service had not returned.

## Design and routes

The workspace uses a graphite navigation rail, neutral surfaces, teal actions,
system typography and shared spacing/radius tokens. `web/src/theme.ts` defines
Mantine defaults and semantic theme variables; `web/src/styles.css` owns the
responsive layout and light/dark surfaces. Existing Mantine controls supply
dialogs, drawers, menus and form semantics. No animation or component framework
was added.

| Route                                 | Result                                                                                           |
| ------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `/login`, `/register`                 | Shared branded layout, labeled controls, autocomplete, pending and server-error states           |
| `/`                                   | Searchable/filterable projects, working edit/delete actions, honest empty/error/retry states     |
| `/dashboard`                          | Project overview derived from the returned projects and complexity values                        |
| `/projects/new`, `/projects/:id/edit` | Consistent project forms with contextual help and cancel actions                                 |
| `/projects/:id`                       | Real task/effort summary, task search/filter/sort, expandable subtasks and complete task actions |

Shared components include `WorkspaceLayout`, `PageHeader`, `WorkspaceState`,
`AuthScreen`, `Brand` and `TaskForm`. Page routes load separately. The task form
starts with essential scope, technology and estimation choices. Optional scope,
technical requirements, integrations, testing, documentation and explanation
options live in expandable sections. Edit forms preserve hidden context.

Estimate presentation selects one valid source in order: final, AI subtask sum,
AI, manual. Project effort sums this selection once per top-level task; nested
breakdowns are not added again. Missing hours show an em dash. Uncertainty,
confidence, explanations, risks and logs only appear when returned by the API
(including legacy explanation text). Manual references remain separate. No
confidence or analytics are invented. Hours displayed in summaries are rounded
to one decimal; calculations use the returned numeric values.

Accessibility includes a skip link, semantic headings/landmarks, explicit input
and icon-button labels, visible keyboard focus, mobile navigation with focus
restoration, Mantine dialog focus traps and reduced-motion support. Primary
button contrast is checked at 4.5:1 or higher in both themes. Contrast testing is
targeted, not a complete WCAG certification.

## Reproduce verification

Use the repository's Bun 1.3.2 and a supported Node runtime (verified with Node
24.22.0). From the repository root:

```sh
bun install --frozen-lockfile --ignore-scripts
node node_modules/typescript/bin/tsc --noEmit -p web/tsconfig.app.json
node node_modules/typescript/bin/tsc --noEmit -p web/tsconfig.spec.json
node node_modules/typescript/bin/tsc --noEmit -p web-e2e/tsconfig.json
NX_DAEMON=false NX_ISOLATE_PLUGINS=false bun run lint:web
node node_modules/vitest/vitest.mjs run --config web/vite.config.ts
bun run build:web
bunx playwright install chromium
node node_modules/playwright/cli.js test --config web-e2e/playwright.ui.config.ts
```

The UI suite starts Vite on strict port 4317 and runs at 1440×1000 and 390×844.
It can reuse an existing server outside CI. To test production assets, start
this after the production build, then run the same suite in another terminal:

```sh
node node_modules/vite/bin/vite.js preview --config web/vite.config.ts --host 127.0.0.1 --port 4317 --strictPort
```

`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` optionally selects an installed Chromium
browser. `ESTIMA_SCREENSHOT_DIR` optionally exports review screenshots. Failure
screenshots/traces go to ignored `test-results/ui`.

The browser suite intercepts API requests using explicit, isolated test fixtures
in `web-e2e/fixtures/workspace.ts`. It covers login/registration/logout and login
errors; project create/edit/delete/empty/search; task create/edit/delete;
AI/manual estimation payloads; feedback and clarification; returned estimate
details; themes, mobile overflow, keyboard navigation and server-error recovery.
It never writes to a development database or invokes a paid AI service.

Unit tests cover estimate selection/missing data, form disclosure and payload
preservation, task action wiring and existing project/task API/hooks. A dedicated
unit-test TypeScript config also checks existing test fixtures.

Verified on 2026-10-16 with Node 24.22.0 and Bun 1.3.2:

| Check                                       | Result                            |
| ------------------------------------------- | --------------------------------- |
| App, unit-test and browser-test TypeScript  | Passed                            |
| Frontend lint                               | Passed, no warnings               |
| Frontend unit tests                         | 51 passed across 8 files          |
| Production build                            | Passed, no chunk-size warnings    |
| Production-build Chromium suite             | 12 passed: 6 desktop and 6 mobile |
| Keyboard and primary-action contrast checks | Passed in both themes             |
| Changed-file formatting and whitespace      | Passed                            |

## Review screenshots and limits

The screenshots in `screenshots/` show the production build using the explicitly
synthetic browser fixtures. This sample data exists only in tests, never in the
application. They include desktop and mobile project/task layouts and a mobile
task form.

- [Login, desktop](screenshots/login-desktop.png)
- [Projects, desktop](screenshots/projects-desktop.png)
- [Projects, dark theme](screenshots/projects-dark-desktop.png)
- [Project and estimates, desktop](screenshots/project-desktop.png)
- [Project and estimates, mobile](screenshots/project-mobile.png)
- [Progressive task form, mobile](screenshots/task-form-mobile.png)

Browser coverage is Chromium, with mobile viewport/touch emulation. Safari,
Firefox, physical devices and screen-reader testing remain manual follow-ups.
Live AI output and the production cookie/refresh path were not exercised by the
mocked UI suite; the original authentication implementation is unchanged.
Long-running AI requests retain the existing API timing behavior. No backend,
schema, migration, Docker volume or local-secret changes are part of this work.
