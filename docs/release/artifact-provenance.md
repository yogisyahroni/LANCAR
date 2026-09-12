# Artifact provenance and rollback — PART AD/AG

Each promoted artifact is identified by source commit, controlled CI run,
builder identity, dependency lock state, image digest, migration list, and
deployment manifest. Critical deployments must reference the digest; mutable
`latest` is not a promotion reference. The previous verified digest remains
available until the new release passes its observation window.

Signing/attestation is an infrastructure control and must be enabled in the
promotion pipeline before production. Staging builds on this device expose
the Docker content digest for inspection, but a local build is not asserted as
a signed production artifact. Database rollback uses a reviewed compensating
migration when history exists.
