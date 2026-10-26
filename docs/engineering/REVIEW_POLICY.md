# Independent review policy

Every change requires an independent assessment of the actual base-to-head diff, acceptance criteria, tests, documentation and security implications. The author and reviewer must be distinct. A second AI model may provide useful technical findings, but AI feedback is not an authorized GitHub approval; required human approvals and branch protections still apply.

Record reviewer, reviewed head SHA, scope, evidence, and findings with severity, concrete failure scenario and resolution. High-severity security or correctness findings block acceptance. Material changes after review require fresh review or documented revalidation. Green CI is not a substitute for independent review.

Project-specific focus: tenant isolation, authorization and atomic mutations for Estima; narrative knowledge boundaries, deterministic flags and consequences, Ukrainian copy and asset provenance for Last Chapter. Preserve stricter local rules. No reviewer may merge, deploy, publish or weaken security settings without explicit maintainer authorization.
