# Bun lockfile and Linux ARM64 build repair

## Root cause

The committed Bun 1.3.2 lockfile had 1,769 package records, but native parents listed optional platform dependencies without corresponding resolved package records. A declaration in `optionalDependencies` is not a resolved lockfile entry. Frozen installation accepted this incomplete graph, then Rollup failed with `MODULE_NOT_FOUND`, SWC failed with `Bindings not found`, and Nx could fall back or stall while creating its project graph.

This was a migration artifact, rather than evidence that the Linux ARM64 binaries were unavailable. The pre-migration Yarn lockfile (`git show d285c60^:yarn.lock`) lacks the Linux ARM64 Rollup, SWC and Nx resolutions. Commit `d285c60` imported the Bun lockfile and added five explicit Linux x64 optional dependencies to restore CI bindings. Those additions covered x64, leaving ARM64 and other platform records unresolved. The old lockfile's tarball-based records and platform-specific omissions are consistent with that imported graph; the exact historical command that first pruned the Yarn graph is not recorded.

Eight native families were incomplete: SWC, Rollup, Nx, esbuild, unrs-resolver, Parcel watcher, Rspack binding and embedded Sass. There were 110 missing direct optional edges in these families. Running Bun 1.3.2 `install --lockfile-only --ignore-scripts --cpu '*' --os '*'` alone did not fill them.

## Repair and prevention

`scripts/repair-native-lockfile.cjs` temporarily promotes missing optional edges to exact-version roots in an isolated directory, resolves them with Bun 1.3.2, restores the original manifest there, and normalizes again. It copies the result back only after checking that every existing package record and the workspace manifest remain semantically identical. It does not read environment files or modify the real manifest or installed dependencies.

The repair adds 126 records, including recursively resolved native packages. All original 1,769 records remain unchanged; no dependency versions were upgraded and `package.json` is unchanged. The repaired lockfile reproduces byte-for-byte from the original and a second repair is a no-op.

Use the pinned Bun version after installing development dependencies:

```sh
bun --version # must be 1.3.2
bun scripts/repair-native-lockfile.cjs
node scripts/native-lockfile.cjs
bun install --frozen-lockfile --ignore-scripts
node scripts/verify-native-dependencies.cjs
```

The host used for this repair has Bun 1.2.4. Verification and repair instead used `oven/bun:1.3.2`, without changing the host installation. The repair was replayed from a copy of the original lockfile with this command (the temporary directory contained the original manifest/lockfile and copies of the three scripts):

```sh
docker run --rm \
  --mount type=bind,source=/private/tmp/estima-bun-repro,target=/work \
  --mount type=bind,source="$PWD/node_modules/typescript",target=/work/node_modules/typescript,readonly \
  -w /work oven/bun:1.3.2 bun scripts/repair-native-lockfile.cjs
```

Both Dockerfiles retain frozen installation and the existing multistage design. There are no temporary package installs, alternate runtime patches or diagnostic entrypoints. A permanent native smoke check executes real SWC transformation, Rollup parsing, Nx hashing, esbuild transformation and bcrypt hashing, and loads the resolver. On Linux it explicitly loads the GNU bindings for the running CPU so WASM cannot conceal missing native packages. The API build disables the Nx daemon and plugin isolation, matching the existing CI environment; its production environment and Bun entrypoint are unchanged.

The Bun validation workflow now runs on x64 and ARM64 and runs this native check before the existing unit tests and builds. GitHub documents the ARM64 runner as [`ubuntu-24.04-arm`](https://docs.github.com/en/actions/reference/runners/github-hosted-runners). Bun's [lockfile documentation](https://bun.sh/docs/pm/lockfile) describes lockfile-only and frozen installation; version-specific CLI behavior was also checked directly with `oven/bun:1.3.2 bun install --help`.

## Validation commands and results

Clean image builds, using separate tags and no Compose startup:

```sh
docker build --platform linux/arm64 --no-cache --progress plain \
  -f api/Dockerfile -t estima-api:arm64-lockfix .
docker build --platform linux/arm64 --no-cache --progress plain \
  -f web/Dockerfile -t estima-web:arm64-lockfix .
```

Both pass. Both builders load `@swc/core-linux-arm64-gnu@1.5.29`, `@rollup/rollup-linux-arm64-gnu@4.45.1`, `@nx/nx-linux-arm64-gnu@21.3.2`, `@esbuild/linux-arm64@0.25.5` and `@unrs/resolver-binding-linux-arm64-gnu@1.12.2`. Native operations also pass on macOS ARM64.

```sh
node node_modules/jest/bin/jest.js --config api/jest.config.ts --runInBand
node node_modules/vitest/vitest.mjs run --config web/vite.config.ts
```

Results on both the macOS ARM64 host and isolated Linux ARM64 builder: 15 API suites / 126 tests pass, including 27 CORS tests; 5 frontend files / 39 tests pass. The Linux suites used the builder image and the same commands above via `docker run --rm --entrypoint node estima-api:arm64-lockfix-builder ...`. SWC, Rollup, Nx and bcrypt also load successfully under Bun 1.3.2 in the final API image, without starting the application. Frozen lockfile-only installation succeeds and leaves the repaired file unchanged. `git diff --check` and script formatting checks pass; the workflow YAML parses with the expected runner matrix. Build/test logs are in `/private/tmp/estima-bun-*.log`.

## CORS and operational limits

Compose still propagates `http://localhost,http://localhost:4200`; an explicit `CORS_ORIGINS` replaces that default, and an empty override remains empty and is rejected by the API. Configuration HTTP tests permit both local origins with credentials, reject untrusted origins, and verify that a production HTTPS allowlist does not inherit local origins. Cookie code and credential policy are unchanged.

The currently running local API is a different, older image: its live preflight still returns the hardcoded `http://localhost:4200` even for origin `http://localhost`. It was not restarted or replaced during this task. The built images contain the source fix; the running-stack mismatch remains until an authorized local rollout.

No PostgreSQL containers, volumes, schemas or data were changed, and no environment files or local secrets were changed. The new images were built only, not deployed. Full API startup against the existing database was not attempted: the preceding CORS investigation established that this checkout requires baseline calibration tables absent from that database. Reconcile that separately before a rollout; this build repair does not reset the database or bypass runtime schema checks. Only Linux ARM64 and macOS ARM64 were executed locally; the new x64/ARM64 CI matrix has not been run remotely.
