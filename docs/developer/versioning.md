# Developer API versioning and compatibility

The public surface is rooted at `/api/v1/developer/v1`. The final `v1` is the
developer contract version; the gateway and service prefixes are implementation
boundaries and are not removed independently.

Within a version, Lancar guarantees backward-compatible behavior:

- Existing paths, HTTP methods, required fields, scope meanings, error codes,
  and successful response fields are retained.
- New response fields and new event types may be added. Clients must ignore
  fields they do not understand.
- Existing fields are not silently changed from their type or meaning.
- A breaking change requires a new version root, migration documentation, and
  a deprecation period for the previous version.

The OpenAPI contract is maintained in `docs/developer/openapi.yaml`. Staging
and production use the same versioned path and differ only by host and
credential environment.
