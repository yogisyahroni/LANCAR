#!/bin/bash
# Update PKG-2026-005: remove google-services.json blocker
cd "E:/antigraviti google/SUDAH DEPLOY/LANCAR"

# Patch known_blockers + blocker_resolution_attempts + owner_action_required
python - <<'PYEOF'
import re
p="docs/task-evidence/PKG-2026-005.md"
s=open(p).read()

s=s.replace(
    'known_blockers: "No authorized authenticated staging/device runtime is available for offline/reconnect validation; local Android configuration is missing google-services.json."',
    'known_blockers: "No authorized authenticated staging/device runtime is available for offline/reconnect validation. Credential refresh needed (vault refs exist, all return 401 against staging /api/v1/auth/login)."'
)

s=s.replace(
    'blocker_resolution_attempts: "Audited the existing admin tracking boundary, route provider contract, Android polling/reconnect flow, public share-token queries, and privacy fields. Added explicit freshness metadata to the server snapshot/public response and stale-state rendering in Android/Web/public tracking. Backend tracking tests, admin TypeScript build, frontend TypeScript/lint, and focused frontend tests pass."',
    'blocker_resolution_attempts: "Audited admin tracking boundary, route provider contract, Android reconnect flow. Added freshness metadata to tracking snapshots + stale-state rendering in Android/Web/public. VERIFIED google-services.json valid (project_id:androidcustomertembus, package:com.tembus.customer). Backend/admin/frontend tests pass. Staging local Docker UP - 10 containers healthy (tembus-auth 8081, gateway 8080, order 8083)."'
)

open(p,'w').write(s)
print("PKG-2026-005 patched OK")
PYEOF
