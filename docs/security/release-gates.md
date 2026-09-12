# Security release gate — PART AD

Every release must produce dependency/SCA, secret, SAST, container/IaC, and
SBOM artifacts. The repository workflow is `.github/workflows/security-scan.yml`.
High/critical findings block promotion unless an explicitly named owner records
an expiry, compensating control, and retest. Secret leaks and unsigned or
untraceable artifacts are hard failures. SBOMs are attached to the build
artifact, not committed to the application repository.

Promotion requires an immutable image digest, source revision, dependency lock
files, migration list, build identity, and deployment manifest. Staging is
isolated from production secrets/data. A release may be rolled back to the
previous immutable digest, while database changes use a reviewed compensating
migration; financial/evidence history is never dropped by an automatic down.

The gate is intentionally separate from vendor-live proof: missing payment or
OTP vendor credentials cannot make a fake provider pass. The adapter remains
disabled and the release record names the exact external follow-up.
