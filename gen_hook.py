import re, subprocess

REPO = "admin-dashboard/src/pages/"
orig = subprocess.check_output(
    ["git", "show", "e23fd7b^:admin-dashboard/src/pages/Finance.tsx"], text=True).split("\n")

# The original function ends with:
#   if (isLoading...) { return ( <spinner/> ); }
#   return ( <BIG JSX> );
# We cut from the loading-guard `if (isLoading` to EOF and replace with a data return.
# The loader block: `if (isLoadingStats...) { return ( <spinner/> ); }` at ~line 477-483.
# Its `return ( <JSX> )` must NOT be in the hook (hooks return data, not JSX). But the
# derived vars (stats, formatCurrency, ...) live AFTER that block (485-558) at function
# scope and MUST stay. So prefix = everything before the loader if + everything after it
# (skipping the loader's JSX return), up to the MAIN `return (` (~line 561).
loader_if = next(i for i, ln in enumerate(orig) if ln.strip().startswith("if (isLoadingStats"))
# find the `}` that closes the loader if-block
depth = 0
loader_end = loader_if
for j in range(loader_if, len(orig)):
    for ch in orig[j]:
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
    if depth == 0 and j > loader_if:
        loader_end = j
        break
main_return = next(i for i, ln in enumerate(orig) if ln == "  return (")
prefix = orig[:loader_if] + orig[loader_end + 1 : main_return]

# derived IIFE (moved from jsx) — search whole file
derived = []
for i, ln in enumerate(orig):
    if "const gtv = pnlReport.summary.gross_revenue" in ln:
        j = i
        while j < len(orig):
            derived.append("  " + orig[j].lstrip())
            if "pphBadan22" in orig[j]:
                break
            j += 1
        break

# declared value identifiers in prefix
declared = []
seen = set()
for ln in prefix:
    # only function-scope declarations (exactly 2-space indent) — skip nested
    # `const x =` inside callbacks/useQuery bodies (those are local, not hook returns)
    if not ln.startswith("  "):
        continue
    if ln.startswith("    "):
        continue
    for pat in (
        r"^\s*const\s+([A-Za-z_]\w*)\s*=",
        r"^\s*let\s+([A-Za-z_]\w*)\s*=",
        r"^\s*const\s+\[([A-Za-z_]\w*)\s*,\s*([A-Za-z_]\w*)\]\s*=\s*useState",
        r"^\s*const\s+\{([^}]*)\}\s*=\s*useQuery",
        r"^\s*const\s+([A-Za-z_]\w*)\s*=\s*use(Mutation|Query|Memo|Effect|Callback)",
        r"^\s*function\s+([A-Za-z_]\w*)",
    ):
        m = re.match(pat, ln)
        if not m:
            continue
        for g in m.groups():
            if g is None:
                continue
            if pat.startswith(r"^\s*const\s+\{"):
                for part in g.split(","):
                    mm = re.search(r"(?:data|isLoading|isError|error)\s*:\s*([A-Za-z_]\w*)", part)
                    if mm and mm.group(1) not in seen:
                        seen.add(mm.group(1)); declared.append(mm.group(1))
            else:
                for name in re.findall(r"[A-Za-z_]\w*", g):
                    if name in ("Mutation", "Query", "Memo", "Effect", "Callback"):
                        continue
                    if name not in seen:
                        seen.add(name); declared.append(name)

hook = "\n".join(prefix).replace(
    "export default function Finance() {", "export function useFinanceData() {", 1)
# export the FinanceTab type so the orchestrator can import it
hook = hook.replace("type FinanceTab =", "export type FinanceTab =", 1)
hook += "\n\n  // derived metrics (moved from inline JSX IIFE)\n"
hook += "\n".join(derived) + "\n\n"
hook += "  return {\n"
# always-returned module-level consts (defined at top of the function, indent 0 in file)
for v in ("COLORS", "activePayoutStatuses", "payoutStatusLabel", "riskActionLabel"):
    if v not in declared:
        hook += f"    {v},\n"
for v in declared:
    hook += f"    {v},\n"
for ln in derived:
    mm = re.match(r"\s*const\s+([A-Za-z_]\w*)\s*=", ln)
    if mm and mm.group(1) not in declared:
        hook += f"    {mm.group(1)},\n"
hook += "  };\n}\n\nexport type FinanceData = ReturnType<typeof useFinanceData>;\n"

open(REPO + "useFinanceData.ts", "w", encoding="utf-8").write(hook)
s = hook
print("WROTE useFinanceData.ts", s.count(chr(10)), "lines; braces", s.count("{"), "/", s.count("}"), "; fields:", len(declared))
