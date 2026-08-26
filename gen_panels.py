import os, re, subprocess

REPO = "admin-dashboard/src/pages/"
for stale in ["FinanceHelpers.ts", "types.ts"]:
    p = os.path.join(REPO, "finance", stale)
    if os.path.exists(p):
        os.remove(p)

full = subprocess.check_output(
    ["git", "show", "e23fd7b^:admin-dashboard/src/pages/Finance.tsx"], text=True).split("\n")

TAB_GUARDS = {
    "treasury": 707, "pnl": 1630, "tax": 1877, "trial-balance": 2088,
    "ledger": 2158, "reconciliation": 2258, "unit-economics": 2336, "closing": 2407,
}
order = list(TAB_GUARDS.items())


def find_close(start):
    """0-based index of the `)}` that closes this tab's guard: the LAST `)}`
    line strictly before the next tab guard (or EOF)."""
    nxt = sorted(v for v in TAB_GUARDS.values() if v > start)
    end = nxt[0] if nxt else len(full)
    last = start
    for i in range(start + 1, end):
        if ")}" in full[i] and full[i].strip().endswith(")}"):
            last = i
    return last


hook = open(REPO + "useFinanceData.ts", encoding="utf-8").read()
m = re.search(r"return \{\n(.*?)\n  \};", hook, re.S)
all_fields = [l.strip().rstrip(",").strip() for l in m.group(1).split("\n") if l.strip()]

PANEL_IMPORTS = """import { cn } from '../../lib/utils';
import { DollarSign, TrendingUp, TrendingDown, PieChart as PieIcon, CreditCard, History, ArrowUpRight, ArrowDownRight, ShieldAlert, Download, CloudRain, ChevronRight, Loader2, Landmark, CheckCircle2, XCircle, Ban, ShieldCheck, FileSearch, Smartphone, AlertTriangle, Wallet, Users, Clock, BarChart2, FileText, Receipt, Calendar, AlertCircle, ArrowRight, TrendingDown as TrendDown, Lock } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { clientLog } from '../../lib/clientLogger';
import { api } from '../../lib/api';
import { format, parseISO } from 'date-fns';
import { id as localeId } from 'date-fns/locale';
import { ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip } from 'recharts';
import { ConfirmPayoutModal, type PayoutReviewAction } from '../../components/ConfirmPayoutModal';
import type { FinanceData } from '../useFinanceData';
"""

for name, start in order:
    close = find_close(start)
    # body = the original `{activeTab === 'X' && ( ... )}` block verbatim (valid single JSX expr),
    # wrapped in a fragment so it can sit inside `return (<>` ... `</>)`
    body = "\n".join(full[start:close + 1]).rstrip()
    comp = name[0].upper() + name[1:].replace("-", "")
    panel = PANEL_IMPORTS + "\n"
    panel += f"export function {comp}Panel({{ data }}: {{ data: FinanceData }}) {{\n"
    panel += "  const {\n"
    for f in all_fields:
        panel += f"    {f},\n"
    panel += "  } = data;\n\n"
    panel += "  return (\n    <>\n"
    panel += body
    panel += "\n    </>\n  );\n}\n"
    fname = os.path.join(REPO, "finance", f"{name.replace('-', '')}Panel.tsx")
    with open(fname, "w", encoding="utf-8") as fp:
        fp.write(panel)
    print(f"WROTE {name}Panel start={start} close={close} body {close-start+1} lines")

print("DONE")
