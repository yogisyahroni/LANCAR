import json, re
from pathlib import Path

# Extract ALL admin API paths from the admin dashboard
print("=== SCANNING ALL ADMIN DASHBOARD API CALLS ===")

admin_paths = {}

# Scan all admin source files
for f in sorted(Path("admin-dashboard/src").rglob("*.ts*")):
    if "node_modules" in str(f) or ".git" in str(f):
        continue
    try:
        content = f.read_text(encoding="utf-8", errors="replace")
    except:
        continue
    
    # Find axios/api calls with string paths
    # api.get("/path", ...) or api.post("/path", ...)
    for m in re.finditer(r"api\.(?:get|post|put|delete|patch)\s*\(\s*[\"'\x60]([^\"'\x60]+)[\"'\x60]", content):
        path = m.group(1).strip()
        if path.startswith("/") or "api" in path.lower():
            clean_path = re.sub(r'\$\{[^}]+\}', "{param}", path)
            admin_paths.setdefault(clean_path, set()).add(str(f))
    
    # Also catch template literals containing /api/
    for m in re.finditer(r"\x60([^\x60]*/api/[^\x60]+)\x60", content):
        path = m.group(1).strip()
        clean_path = re.sub(r'\$\{[^}]+\}', "{param}", path)
        admin_paths.setdefault(clean_path, set()).add(str(f))

# Separate simple vs template
simple = {k: list(v) for k, v in admin_paths.items() if "{param}" not in k}
templated = {k: list(v) for k, v in admin_paths.items() if "{param}" in k}

print(f"Simple paths: {len(simple)}")
for path in sorted(simple.keys()):
    print(f"  {path}")

print(f"\nTemplate paths: {len(templated)}")
for path in sorted(templated.keys()):
    print(f"  {path[:80]}")

Path("graphify-out/admin_api_paths.json").write_text(json.dumps({"simple": simple, "template": templated}, indent=2), encoding="utf-8")
print(f"\nSaved")
