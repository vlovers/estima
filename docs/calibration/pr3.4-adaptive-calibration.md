# PR3.4 adaptive tenant calibration

## Architecture and scope

`AdaptiveFeedbackCalibrationPolicy` contains deterministic TypeScript math and has no database, OpenAI, clock, random, or in-memory learning dependency. `EstimateFeedbackModule` binds `FEEDBACK_CALIBRATION_POLICY` to the adaptive implementation. `NoLearningFeedbackCalibrationPolicy` remains available as a reference/test implementation. The old `FeedbackAnalysisService` is not called by feedback submission; this change does not enable its legacy global-learning path.

Data flow: owned feedback submission → immutable estimated-hours snapshot → existing processor → feedback row lock → owner/estimate validation → sorted tenant coefficient initialization and row locks → policy evaluation against locked state → validation of every mutation → coefficient/state writes and value-change events → processed feedback, all in one PostgreSQL READ COMMITTED transaction. Tenant coefficient resolution already reads overrides on each estimate; global defaults remain cached and unchanged. Existing stored estimates are not rewritten. A tenant without eligible history continues to use defaults.

The processor now requires complete mutation coverage for nonempty policy results, checks all old statistical values, rejects duplicate/unknown keys, validates algorithm versions and bounds, and includes the locked row version in each update predicate. Any failure rolls back the entire feedback application, including lazy initialization and audit events. Failure status is written separately only if the feedback is still pending/failed, so a competing successful retry cannot be downgraded. Lock ordering and terminal processed/skipped states are preserved.

Changed files:

- `api/src/modules/estimate-feedback/adaptive-feedback-calibration-policy.ts`: policy, validated injectable options, formulas.
- `api/src/modules/estimate-feedback/feedback-calibration-policy.ts`: interface/token and old/new EWMA mutation values.
- `api/src/modules/estimate-feedback/feedback-calibration.processor.ts`: EWMA and state-only persistence; result/state/version validation.
- `api/src/modules/estimate-feedback/estimate-feedback.module.ts`: production policy binding.
- `api/src/modules/estimate-feedback/adaptive-feedback-calibration-policy.spec.ts`: focused numerical/eligibility tests.
- `api/src/modules/estimate-feedback/adaptive-feedback-calibration.int-spec.ts`: production binding and disposable PostgreSQL transaction tests.
- `api/src/modules/security/tenant-isolation.int-spec.ts`: retain PR3.3 reference-policy coverage through an explicit override; extend test mutations for EWMA and full target state coverage.
- `api/src/modules/estimate-feedback/testing/calibration-simulation.ts` and `.spec.ts`: standalone backtest and deterministic invariants.
- `package.json`: `yarn simulate:calibration` command.
- This document and `pr3.4-simulation-results.json`: reproducible methodology and results.

All 13 baseline defaults were inspected and asserted against migrated PostgreSQL data. Their range is **0.75–1.6**, within the existing **[0.5, 2]** tenant bounds. There is no bounds expansion, entity/schema change, or migration. Existing baseline migrations and `synchronize: false` remain intact.

## Mathematics

For positive finite actual effort `a` and estimated snapshot `e`:

```
r = a / e
l = ln(r)
lc = ln(clamp(r, 0.35, 3))
k = number of unique target factors
w = 1/k
n_i = locked eligibleSampleCount_i + 1
confidence_i = clamp((n_i - 4)/26, 0, 1)
eta_i = 0.08 * confidence_i
b = ln(1.05)
delta_i = w * clamp(eta_i * lc, -b, b)
newValue_i = clamp(oldValue_i * exp(delta_i), minValue_i, maxValue_i)
newEWMA_i = 0.8 * oldEWMA_i + 0.2 * w * lc
```

Samples 1–4 update counts, attributed weights and EWMA but leave values unchanged. Sample 5 has learning rate `0.08/26`; sample 30 reaches 0.08. The threshold introduces one small ramp increment rather than a full-rate jump. Accurate samples are eligible even below 15% error; an exactly accurate sample leaves the value unchanged and decays the residual EWMA.

EWMA begins at zero and accumulates during warm-up without bias correction. It describes the recent **attributed log residual**, not the tenant's total bias or posterior confidence. It is diagnostic; coefficient movement uses the current clipped observation. Feeding past EWMA directly into subsequent movements would continue changing coefficients even after current observations become accurate.

Each factor gets only `1/k` of the correction. Although factors can have different sample counts, each confidence is at most one, so `sum(abs(delta_i)) <= ln(1.05)`. Bound clamping only reduces this sum. Therefore each feedback changes the combined product by a factor in **[1/1.05, 1.05]**, independent of factor ordering/count. Unused movement at a bound is not redistributed. Floating-point rounding can exceed the theoretical bound by machine precision; tests allow only numerical tolerance.

Counts increment once per relevant coefficient, independent of coefficient movement. `totalWeight` increments by `1/k`; these attributed weights sum to one over the feedback. Weight measures allocated evidence, not confidence or elapsed hours. Confidence uses observation count, not accumulated attributed weight; frequent factors with many co-occurring factors still receive smaller value steps. These defaults are engineering hypotheses, not scientifically validated optima.

The algorithm version is `adaptive-log-pr3.4-v1`. Constants are exported and immutable. Nest can provide a `Partial<AdaptiveCalibrationOptions>` under `ADAPTIVE_CALIBRATION_OPTIONS`; options are validated, and overrides cannot increase the learning-rate or combined-step safety ceilings. For a production configuration change, update the algorithm version and repeat evaluation. Value events also record the actual options and old/new EWMA in JSON metadata. No environment switch or LLM determines updates.

## Eligibility and outliers

- Exclude scope creep, external dependency delay, and environment/tooling issues, with `excluded_deviation_reason:<REASON>`.
- Accept unforeseen technical complexity, incorrect assumptions, accurate estimates, OTHER and absent deviation reasons. Unknown reason values are excluded defensively.
- Reject nonpositive/non-finite hours, absent snapshots, and ratio overflow/underflow. Keep the feedback and mark it skipped with the explicit reason.
- Reject incomplete required experience/project context; unknown or malformed factor keys skip the whole observation rather than silently attributing its error to the remaining factors.
- Retain the processor's existing target selection: experience, project complexity, task tags and reported missed tags, deduplicated and sorted. Missing tags are a heuristic attribution signal, not proof of responsibility.
- Finite positive deviations inside the ratio range retain their log residual. Large finite deviations, including ratios 0.05 and 100, are kept but clipped. A large valid number alone does not prove invalid input. Invalid arithmetic/context is skipped, whereas plausible but extreme observations have bounded influence. There is no statistically justified hard cutoff for legitimate extreme effort in the available data.

## State and audit semantics

Every eligible observation transactionally persists value, eligible count, total weight, EWMA, incremented version and `lastFeedbackId`. Prevalidation covers state-only mutations as well as visible movements. Old values/counts/weights/EWMA must exactly match locked rows. New values and bounds must be valid, counts increase by exactly one, weights increase by the supplied positive weight, and EWMA must remain finite. The version-guarded update must affect exactly one tenant row.

A state-only update is **processed**, with algorithm version, processed timestamp and null error in its existing feedback processing record. It creates **no** `coefficient_change_events` entry. This includes warm-up, exact accuracy, saturation and a value step too small to change a float. A value change gets one unique `(feedbackId, coefficientKey)` event with before/after values and statistical metadata. The feedback processing record is the audit of successful state application; the events table remains the audit of actual value changes. Existing schema is sufficient for these processing outcomes, so no migration was added.

This is an outcome audit, not an immutable per-factor replay log for every state-only update: feedback does not currently snapshot the full factor set/options. Reconstructing every historical intermediate state after context edits is outside this schema's guarantees. A future replay facility should introduce immutable factor/context snapshots and explicit run provenance, rather than fabricating value-change events.

## Offline simulation and chronological backtest

Run `yarn simulate:calibration` without API keys, PostgreSQL or OpenAI. The checked-in JSON contains full unrounded output. The unit suite reruns simulations twice and asserts identical reports.

Exact synthetic generator: 32-bit LCG, initial seed **340034**, recurrence `s = (1664525*s + 1013904223) mod 2^32`, uniform output `s/2^32`. Reset seed per scenario; loop chronologically over indices, then tenants. Raw global-predicted hours are `(4 + 36*u) * product(defaults)`. Except where specified, actual/global-predicted ratio is the scenario's central ratio times `exp((2*u-1)*0.06)`; C uses width 0.04. Every train prediction is made from the prior adaptive state before its own feedback is learned. Training is closed-loop: snapshots include the coefficients used for that synthetic prediction.

Use **120 train / 60 frozen test observations per tenant**, except E uses 4 train / 60 test. H has two tenants, totaling 240/120. Test observations never update either model. Model comparisons:

1. Global: original default-based synthetic prediction.
2. Adaptive: same global prediction multiplied by the final trained tenant coefficient/default product.
3. Median: same global prediction multiplied by `clamp(median(last 30 train actual/global ratios), 0.35, 3)`, independently per tenant. E uses its four available train observations.

MAE and signed bias are in hours. Bias is **prediction minus actual**, so negative means underestimation (opposite sign to the policy's log error). WAPE is sum absolute error / sum actual. Median APE and within-20%/30% use actual hours as denominator. They are reported as fractions in JSON and percentages below. Maximum coefficient movement is `max(abs(newValue/oldValue - 1))` per update. Maximum combined correction is `max(exp(abs(sum(log(newValue/oldValue)))))`. The additional cumulative correction tracks the combined product relative to defaults over the entire training sequence.

Scenarios: A central ratio 1.5; B 0.65; C 1; D first five positions of every 24-observation block have ratios `[0.05, 0.1, 5, 10, 100]`, otherwise central 1.1; E central 1.5; F exact alternating 0.7 and 1/0.7; G central 1.5 with five factors/defaults `[1,1,1.4,1.2,1.3]`; H tenant A=1.5/B=0.65; I exact 10; J repeats each A training feedback three times with identical identity; K train=1.5, held-out test=0.7. Others use a single factor/default 1. The simulation's identity ledger models retries only; actual exactly-once/concurrency guarantees are verified in PostgreSQL.

| Scenario | Global MAE | Adaptive MAE | Global WAPE | Adaptive WAPE | Adaptive bias | Median MAE | Median WAPE |
|---|---:|---:|---:|---:|---:|---:|---:|
| A persistent underestimation | 12.735 | 1.069 | 34.12% | 2.86% | -0.454 | 1.089 | 2.92% |
| B persistent overestimation | 8.414 | 0.463 | 52.02% | 2.86% | -0.194 | 0.472 | 2.92% |
| C accurate estimates | 0.472 | 0.473 | 1.91% | 1.91% | -0.198 | 0.482 | 1.95% |
| D extreme outliers | 118.233 | 117.077 | 87.42% | 86.56% | -110.258 | 117.053 | 86.54% |
| E four warm-up samples | 10.076 | 10.076 | 32.67% | 32.67% | -10.076 | 1.235 | 4.00% |
| F alternating errors | 8.437 | 8.460 | 34.60% | 34.70% | -0.602 | 8.535 | 35.01% |
| G five simultaneous factors | 27.814 | 2.335 | 34.12% | 2.86% | -0.992 | 2.378 | 2.92% |
| H opposite tenants | 9.397 | 0.744 | 39.07% | 3.09% | +0.168 | 0.790 | 3.28% |
| I bounds saturation | 210.866 | 187.437 | 90.00% | 80.00% | -187.437 | 164.007 | 70.00% |
| J repeated feedback | 12.735 | 1.069 | 34.12% | 2.86% | -0.454 | 1.089 | 2.92% |
| K held-out regime reversal | 7.170 | 19.451 | 41.16% | 111.68% | +19.451 | 19.370 | 111.21% |

Full model metrics:

| Scenario | Model | MAE | WAPE | Signed bias | Median APE | Within ±20% | Within ±30% |
|---|---|---:|---:|---:|---:|---:|---:|
| A | global | 12.735 | 34.12% | -12.735 | 33.77% | 0.00% | 6.67% |
| A | calibrated | 1.069 | 2.86% | -0.454 | 2.56% | 100.00% | 100.00% |
| A | medianBaseline | 1.089 | 2.92% | -0.535 | 2.68% | 100.00% | 100.00% |
| B | global | 8.414 | 52.02% | +8.414 | 52.84% | 0.00% | 0.00% |
| B | calibrated | 0.463 | 2.86% | -0.194 | 2.55% | 100.00% | 100.00% |
| B | medianBaseline | 0.472 | 2.92% | -0.232 | 2.68% | 100.00% | 100.00% |
| C | global | 0.472 | 1.91% | -0.193 | 1.69% | 100.00% | 100.00% |
| C | calibrated | 0.473 | 1.91% | -0.198 | 1.71% | 100.00% | 100.00% |
| C | medianBaseline | 0.482 | 1.95% | -0.235 | 1.80% | 100.00% | 100.00% |
| D | global | 118.233 | 87.42% | -113.023 | 11.48% | 75.00% | 75.00% |
| D | calibrated | 117.077 | 86.56% | -110.258 | 3.88% | 75.00% | 75.00% |
| D | medianBaseline | 117.053 | 86.54% | -110.455 | 4.12% | 75.00% | 75.00% |
| E | global | 10.076 | 32.67% | -10.076 | 32.45% | 0.00% | 18.33% |
| E | calibrated | 10.076 | 32.67% | -10.076 | 32.45% | 0.00% | 18.33% |
| E | medianBaseline | 1.235 | 4.00% | +1.027 | 3.68% | 100.00% | 100.00% |
| F | global | 8.437 | 34.60% | -0.952 | 36.43% | 0.00% | 21.67% |
| F | calibrated | 8.460 | 34.70% | -0.602 | 36.97% | 0.00% | 50.00% |
| F | medianBaseline | 8.535 | 35.01% | +0.554 | 38.77% | 0.00% | 50.00% |
| G | global | 27.814 | 34.12% | -27.814 | 33.77% | 0.00% | 6.67% |
| G | calibrated | 2.335 | 2.86% | -0.992 | 2.56% | 100.00% | 100.00% |
| G | medianBaseline | 2.378 | 2.92% | -1.168 | 2.68% | 100.00% | 100.00% |
| H | global | 9.397 | 39.07% | -1.408 | 41.19% | 0.00% | 5.83% |
| H | calibrated | 0.744 | 3.09% | +0.168 | 3.01% | 100.00% | 100.00% |
| H | medianBaseline | 0.790 | 3.28% | +0.253 | 2.99% | 100.00% | 100.00% |
| I | global | 210.866 | 90.00% | -210.866 | 90.00% | 0.00% | 0.00% |
| I | calibrated | 187.437 | 80.00% | -187.437 | 80.00% | 0.00% | 0.00% |
| I | medianBaseline | 164.007 | 70.00% | -164.007 | 70.00% | 0.00% | 0.00% |
| J | global | 12.735 | 34.12% | -12.735 | 33.77% | 0.00% | 6.67% |
| J | calibrated | 1.069 | 2.86% | -0.454 | 2.56% | 100.00% | 100.00% |
| J | medianBaseline | 1.089 | 2.92% | -0.535 | 2.68% | 100.00% | 100.00% |
| K | global | 7.170 | 41.16% | +7.170 | 41.92% | 0.00% | 0.00% |
| K | calibrated | 19.451 | 111.68% | +19.451 | 112.82% | 0.00% | 0.00% |
| K | medianBaseline | 19.370 | 111.21% | +19.370 | 112.35% | 0.00% | 0.00% |

Movement during training:

| Scenario | Maximum coefficient movement | Maximum combined step factor | Maximum cumulative factor (either direction) |
|---|---:|---:|---:|
| A | 1.6857% | 1.016857 | 1.511691 |
| B | 1.7473% | 1.017783 | 1.554290 |
| C | 0.3551% | 1.003551 | 1.010962 |
| D | 5.0000% | 1.050000 | 1.172976 |
| E | 0.0000% | 1.000000 | 1.000000 |
| F | 3.0169% | 1.030185 | 1.015170 |
| G | 0.3349% | 1.016857 | 1.511691 |
| H | 1.7338% | 1.017644 | 1.552693 |
| I | 5.0000% | 1.050000 | 2.000000 |
| J | 1.6857% | 1.016857 | 1.511691 |
| K | 1.6857% | 1.016857 | 1.511691 |

Positive outcomes: persistent matching under/overestimation and multi-factor/tenant scenarios improve markedly against globals; one-to-four samples do not move coefficients; retries do not inflate learning. All movements remain bounded and every state remains finite.

Negative outcomes: C is very slightly worse than global accuracy; F is also slightly worse than globals because alternating residuals leave a small last-observation effect. The median baseline is better than adaptive in D, E, I and K. D retains enormous residual MAE/WAPE because clipping protects coefficients rather than fitting extreme effort. E deliberately learns nothing from four samples, while the median baseline immediately corrects the bias. I saturates at coefficient 2 while the median permits correction 3; neither fits ratio 10. K severely degrades against globals after a distribution reversal; the median is also poor. No parameters were changed in response to held-out results.

These are **synthetic engineering tests**, not real-world performance evidence or an accuracy guarantee. Existing estimates are preserved; accuracy of future estimates can regress under distribution change, noisy feedback or correlated factors.

## Historical feedback and future backfill

Existing skipped feedback with `learning_policy_disabled_until_pr3_4` stays terminal, unchanged. No startup replay, bulk status update or automatic backfill exists. A retry of such feedback returns its existing processing record without initializing coefficients or writing events.

Historical feedback can support **read-only offline evaluation** where positive actual/estimated snapshots, tenant ownership and chronology are known. Keep each tenant separate, split by estimate/feedback time, score before learning an observation, and group repeated feedback/estimates to avoid leakage. Do not fabricate missing estimate-time factor state; stratify or exclude ambiguous records and report selection bias. Historical skipped feedback was collected under an uncalibrated policy, so replay does not automatically reproduce the counterfactual adaptive estimates that would have been generated.

If justified later, implement a separate audited backfill with explicit source cohort, dry-run report, tenant scope, algorithm/configuration snapshot and unique application ledger. Build it against a separate run/shadow state first. Require a deliberate rollout and prevent the same source feedback from being applied both by backfill and live processing. Preserve original feedback statuses and events; do not reset terminal records to pending to bypass exactly-once guards.

## Risks and PR3.5 recommendations

- Equal attribution is conservative regularization, **not causal identification**. A single scalar effort error cannot determine which of several correlated factors was responsible. Different unseen factor combinations can compound historical adjustments.
- Per-feedback combined movement is bounded; cumulative movement across many observations and across unseen combinations is a separate quantity, limited by individual coefficient bounds. Bounds can prevent enough correction of persistent large bias.
- Task/project factors remain mutable and are resolved at processing time. Only hours are snapshotted; original factor identities, coefficient versions and estimation pipeline modifiers are not. Missed tags were not necessarily active in the original estimate. PR3.5 should capture immutable estimate-time calibration context and allow only attribution supported by it.
- Delayed feedback may describe an older coefficient state. Multiple old estimates can push in the same direction after live predictions have already improved. The current step cap reduces, but cannot eliminate, this risk. Add explicit coefficient-at-estimate snapshots and evaluate age/version-aware residual correction before a broader rollout.
- Final estimates include non-calibration influences (uncertainty, overhead, rounding and other heuristics). Synthetic product-based training does not model that entire pipeline. Validate on chronological real tenant data and a shadow/canary cohort before claiming production accuracy improvement.
- Warm-up and clipping trade speed/fit for stability. Unknown OTHER reasons can still include non-actionable errors; missing reasons are accepted by design. Monitor quality, eligibility exclusions, drift, saturation, per-tenant error and adverse cohorts.
- Locking serializes overlapping factors, but arrival/commit order of different errors can affect floating-point accumulation, EWMA and adaptation. Determinism means identical ordered inputs and state yield identical output; it does not imply order-independent learning. PostgreSQL tests prove serialization/no lost updates.
- The existing service's fast idempotent return does not automatically retry a pre-existing failed feedback on a normal sequential duplicate submission. Explicit processor retries are supported and tested; add an audited retry worker/operational mechanism rather than replaying terminal records.
- Keep bounds and versioned configuration conservative until real-data comparisons support changes. Evaluate robust/regularized factor models, decay/rolling confidence, delayed-feedback correction and drift detection against the median baseline. Do not select hyperparameters on a held-out test set.

## Verification

Verification uses the dedicated `ai-estimates-migration-test-db` PostgreSQL container on `127.0.0.1:55432`. Tests create uniquely named disposable databases after fail-closed Docker/identity checks. No development database is reset or modified. The older HTTP/security suite explicitly uses the reference policy; the new integration suite imports the actual production `EstimateFeedbackModule`, asserts its policy binding, and exercises the service and processor without an AI API call.

Executed commands and final counts are recorded below after verification. Docker and Nx daemon sockets required running those checks with sandbox approval; the first sandbox attempts failed at access checks and did not exercise the application tests.

| Check | Result |
|---|---|
| `npx tsc -p api/tsconfig.app.json --noEmit` | Passed |
| `npx tsc -p api/tsconfig.spec.json --noEmit` | Passed |
| `npx tsc -p api-e2e/tsconfig.spec.json --noEmit` | Passed |
| `npx tsc -p api/tsconfig.integration.json --noEmit` | Passed (additional integration typing check) |
| `npx nx test api --runInBand` | **87 tests / 12 suites passed** |
| `yarn test:api:integration` | **51 tests / 2 suites passed**, real PostgreSQL |
| `yarn migration-test:baseline` | Passed: four migrations, eight tables, 13 seeds, constraints/indexes/history, second-run idempotence and zero metadata schema diff |
| `npx nx build api` | Passed: production webpack build |
| `yarn --silent simulate:calibration` | Passed: all 11 scenarios; output byte-identical to checked-in JSON |
| `git diff --check` | Passed |

Integration coverage includes concurrent identical/different feedback, tenant independence, exact counts/weights/EWMA, warm-up/accuracy/saturation with zero value events, value-change metadata, whole-transaction audit failure rollback and retry, malformed/stale/partial policy results, terminal historical feedback preservation, service idempotency, ownership security and unchanged global defaults.
