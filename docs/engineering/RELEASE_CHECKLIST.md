# Release checklist

This checklist is a gate, not authorization to release.

- [ ] Identify target integration branch, candidate commit SHA, scope, known issues and release owner.
- [ ] Verify Definition of Done and required CI checks on the actual candidate; disclose unrun checks.
- [ ] Confirm independent review covers the candidate SHA and resolve blocking findings.
- [ ] Run applicable integration, security and compatibility checks in disposable environments; never use production credentials.
- [ ] Confirm documentation, changelog, version/schema changes and asset/licensing obligations where relevant.
- [ ] Document rollback/recovery and compatibility/migration impact.
- [ ] Obtain explicit maintainer authorization before merge, publication or deployment.
- [ ] Independently verify the actual published artifact or deployment; record SHA, version and evidence.

Project-specific gates: Estima requires tenant/authorization, atomic mutation and migration checks. Last Chapter requires narrative regression and Ukrainian-language review. This checklist does not replace stricter local instructions.
