#!/usr/bin/env python3
import subprocess, re

root = r"E:/antigraviti google/SUDAH DEPLOY/LANCAR"
tasks = []
with open(f"{root}/task-food-marketplace-parity-2026.md") as f:
    for line in f:
        m = re.match(r'^##\s+(FOOD-2026-\d+)', line.strip())
        if m:
            tasks.append(m.group(1))

def has_code(task):
    # search backend + android for task-specific identifier
    patterns = {
        "FOOD-2026-022": ["referral", "Referral", "referral_earning"],
        "FOOD-2026-023": ["loyalty", "Loyalty", "loyalty_point", "PointTransaction", "reward", "Reward"],
        "FOOD-2026-024": ["live_stream", "LiveStream", "live_stream_id", "streamer"],
        "FOOD-2026-025": ["kds", "KDS", "print_queue", "PrintQueue", "order_ticket"],
        "FOOD-2026-026": ["contentDescription", "semantics", "accessibility", "wcag"],
        "FOOD-2026-027": ["support", "Support", "chatbot", "Chatbot", "help_center"],
        "FOOD-2026-028": ["marketing", "Marketing", "campaign", "Campaign", "push_notification"],
        "FOOD-2026-029": ["courier_rating", "CourierRating", "courier_performance"],
        "FOOD-2026-030": ["incident", "Incident", "incident_report"],
    }
    pats = patterns.get(task, [task.replace("-","").lower()])
    found = []
    for p in pats:
        r = subprocess.run(["rg","-l","-i",p,f"{root}/backend",f"{root}/android-app-customer/app/src/main",f"{root}/android-app-merchant/app/src/main"],
                           capture_output=True, text=True, timeout=30)
        if r.stdout.strip():
            found.extend(r.stdout.strip().splitlines())
    return len(found)>0, found[:2]

for t in tasks:
    if t in ("FOOD-2026-001","FOOD-2026-002","FOOD-2026-003","FOOD-2026-004","FOOD-2026-005","FOOD-2026-006","FOOD-2026-007","FOOD-2026-008","FOOD-2026-009","FOOD-2026-010"):
        continue
    ok, files = has_code(t)
    status = "EXISTS" if ok else "GAP"
    print(f"{t}: {status}" + (f" ({len(files)} files)" if ok else ""))
