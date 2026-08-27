import os, subprocess

REPO = "admin-dashboard/src/pages/"
full = subprocess.check_output(
    ["git", "show", "e23fd7b^:admin-dashboard/src/pages/Finance.tsx"], text=True).split("\n")

# nav/layout region (0-based): from `return (` (line 561 -> idx 560) up to the treasury
# content guard (line 708 -> idx 708, EXCLUSIVE). This is the full balanced nav+layout
# block that precedes the first tab panel.
nav = full[560:708]
nav_text = "\n".join(nav)

ORCH_IMPORTS = """import { cn } from '../lib/utils';
import { DollarSign, TrendingUp, TrendingDown, PieChart as PieIcon, CreditCard, History, ArrowUpRight, ArrowDownRight, ShieldAlert, Download, CloudRain, ChevronRight, Loader2, Landmark, CheckCircle2, XCircle, Ban, ShieldCheck, FileSearch, Smartphone, AlertTriangle, Wallet, Users, Clock, BarChart2, FileText, Receipt, Calendar, AlertCircle, ArrowRight, TrendingDown as TrendDown, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { clientLog } from '../lib/clientLogger';
import { api } from '../lib/api';
import { useFinanceData } from './useFinanceData';
import type { FinanceData, FinanceTab } from './useFinanceData';
import { TreasuryPanel } from './finance/treasuryPanel';
import { PnlPanel } from './finance/pnlPanel';
import { TaxPanel } from './finance/taxPanel';
import { TrialbalancePanel } from './finance/trialbalancePanel';
import { LedgerPanel } from './finance/ledgerPanel';
import { ReconciliationPanel } from './finance/reconciliationPanel';
import { UniteconomicsPanel } from './finance/uniteconomicsPanel';
import { ClosingPanel } from './finance/closingPanel';
"""

PANELS = [
    ("treasury", "TreasuryPanel"),
    ("pnl", "PnlPanel"),
    ("tax", "TaxPanel"),
    ("trial-balance", "TrialbalancePanel"),
    ("ledger", "LedgerPanel"),
    ("reconciliation", "ReconciliationPanel"),
    ("unit-economics", "UniteconomicsPanel"),
    ("closing", "ClosingPanel"),
]

# strip a dangling `{activeTab === 'treasury' && (` left at the end of the nav slice
nav_lines = nav_text.split("\n")
while nav_lines and "activeTab === 'treasury' && (" in nav_lines[-1]:
    nav_lines.pop()
while nav_lines and nav_lines[-1].strip() == "":
    nav_lines.pop()

panel_calls = "\n".join(
    f"      {{activeTab === '{t}' && <{c} data={{data}} />}}" for t, c in PANELS
)
# replace the treasury tab-content comment block (if any) with the panel calls
nav_body = "\n".join(nav_lines)
# the nav slice starts with `return (` (idx 560) — drop it, we add our own below
nav_body = nav_body.replace("return (", "", 1)
# drop any trailing comment block (and any stray `}` right after it) at the slice boundary
last_open = nav_body.rfind("/*")
if last_open != -1:
    nav_body = nav_body[:last_open].rstrip()
nav_body = nav_body.rstrip()
# drop a dangling opening `{` (or blank lines) left at the end of the nav slice
while nav_body.endswith("{") or nav_body.endswith("\n"):
    nav_body = nav_body[:-1].rstrip()

orch = ORCH_IMPORTS + "\n"
orch += "export function FinanceContent() {\n"
orch += "  const data = useFinanceData();\n"
orch += "  const { activeTab, setActiveTab, cashPosition, isLoadingCashPosition, dispatchApprovedPayoutsMutation, reconcilePayoutsMutation } = data;\n\n"
orch += "  return (\n"
orch += nav_body
orch += "\n\n"
orch += panel_calls
orch += "\n      </div>\n"   # close the page-wrapper `<div className="space-y-8">` opened in the nav region
orch += "  );\n}\n"

with open(REPO + "FinanceContent.tsx", "w", encoding="utf-8") as fp:
    fp.write(orch)
print("WROTE FinanceContent.tsx", len(orch.split(chr(10))), "lines")
