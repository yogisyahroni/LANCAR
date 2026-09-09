# Experience asset publishing runbook

## Before creating a manifest

1. Upload the asset to the approved HTTPS CDN/object-storage delivery path.
2. Keep bucket credentials, signed upload credentials, and provider tokens on
   the publishing side only. They must never appear in a manifest, URL, app,
   log, screenshot, or evidence document.
3. Record the exact SHA-256 checksum, MIME type, dimensions, expected aspect
   ratio, maximum byte size (no more than 5 MiB), immutable asset version,
   expiry, cache policy, and retention window.
4. For a heavy asset, declare a separately uploaded lighter asset and set its
   `fallback_asset_id`. Both assets must be declared in the same manifest.

## Publication checks

- Use only HTTPS URLs without user-info or embedded credentials.
- Use a MIME type from the allowlist and keep it consistent with the asset kind.
- Keep width and height together; use the actual encoded image dimensions.
- Set `retention_until` at or after `expires_at` so a superseded/rolled-back
  revision remains renderable during its retention window.
- Preview the manifest for customer Android and the intended locale/version,
  then publish through the normal approval/canary flow.

## Runtime behavior

The customer app downloads only assets referenced by the resolved audience
manifest. It streams each response into an isolated staging directory, checks
content type, size, checksum, and image metadata, then atomically commits the
bundle before writing the manifest LKG envelope. A failed download leaves the
previous LKG untouched. The app uses a bounded 50 MiB cache and retains old
bundles for 30 days unless they are still the active LKG; stale temporary
staging directories are removed after 24 hours.

The periodic prefetch worker is constrained to unmetered connectivity and
selects only active/near-term referenced assets. Foreground refresh on a
metered or data-saver connection selects the declared fallback. If no fallback
can be verified, the affected campaign is omitted and the packaged/LKG shell
remains available.

## Rollback and cleanup

Rollback changes the selected manifest revision, not the historical payload.
Do not manually delete a bundle before the retention window expires. If a
bundle is reported missing or corrupt, inspect the app's LKG metadata and
checksum-verification logs, republish a verified revision, and let the client
re-stage it through the normal resolver.
