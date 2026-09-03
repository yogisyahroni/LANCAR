#!/bin/bash
cd "E:/antigraviti google/SUDAH DEPLOY/LANCAR"
python - <<'PYEOF'
import re, os

patcher = {
    "docs/task-evidence/PKG-2026-006.md": (
        'known_blockers: "No authorized authenticated staging/device runtime is available; local Android build is blocked by missing approved google-services.json."',
        'known_blockers: "No authorized authenticated staging/device runtime is available. Credential refresh needed (vault refs exist, all return 401 against staging /api/v1/auth/login). google-services.json VERIFIED valid (project_id:androidcustomertembus)."'
    ),
    "docs/task-evidence/PKG-2026-008.md": (
        # find exact known_blockers line
        'known_blockers: "No authorized authenticated Android/web staging runtime is available in this session; Android local compilation also requires the approved google-services.json."',
        'known_blockers: "No authorized authenticated Android/web staging runtime is available in this session. Credential refresh needed (vault refs: customer/courier credentials return 401 against staging /api/v1/auth/login). google-services.json VERIFIED valid for customer + courier modules."'
    ),
}
for f,(old,new) in patcher.items():
    if not os.path.exists(f): print("MISSING:", f); continue
    s=open(f).read()
    if old in s:
        s=s.replace(old,new)
        open(f,'w').write(s)
        print("PATCHED:", f)
    else:
        print("NOT_FOUND (already patched?):", f)
        # show current known_blockers line for debug
        m=re.search(r'^\s*known_blockers:.*$', s, re.M)
        print("  current:", m.group(0)[:120] if m else "(none)")
PYEOF
