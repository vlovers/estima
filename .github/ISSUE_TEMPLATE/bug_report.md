---
name: Bug report
about: Report a reproducible non-sensitive defect in Estima
title: "bug: "
labels: ["bug"]
---

## Problem

Describe the observed behavior and impact. Do not share secrets, production credentials, real user data or exploitable security details here; see [SECURITY.md](../../SECURITY.md) for private reporting.

## Reproduction

1.
2.
3.

**Expected behavior:**

**Actual behavior:**

## Environment

- Branch and commit SHA:
- Node / Bun versions:
- Browser (if relevant):
- Database: disposable/local/other (never include connection strings):

## Evidence

Include redacted logs, screenshots or tests. State whether the issue is reproducible on a clean checkout.

## Acceptance criteria

- [ ] Add a failing regression test or explain why that is infeasible.
- [ ] Fix the behavior without weakening tenant isolation or data integrity.
- [ ] Run relevant build, tests and disposable-DB checks; link actual results.
- [ ] Complete review and document remaining risk.
