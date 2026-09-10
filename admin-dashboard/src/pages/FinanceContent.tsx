import { cn } from '../lib/utils';
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

export function FinanceContent() {
  const data = useFinanceData();
  const { activeTab, setActiveTab, cashPosition, isLoadingCashPosition, dispatchApprovedPayoutsMutation, reconcilePayoutsMutation } = data;

  return (
  
    <div className="space-y-8 animate-in">
      {/* ── Page Header ─────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black text-foreground-muted tracking-tight italic uppercase">Finance Dashboard</h1>
          <p className="text-foreground-muted mt-1">Treasury, P&L, Pajak, dan Settlement — satu tempat untuk staff finance.</p>
        </div>
        {activeTab === 'treasury' && (
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => {
                const code = window.prompt("Masukkan 6-digit kode TOTP untuk DISPATCH:");
                if (code) dispatchApprovedPayoutsMutation.mutate(code);
              }}
              disabled={dispatchApprovedPayoutsMutation.isPending}
              className="px-5 py-2.5 rounded-2xl bg-primary text-on-primary font-black text-xs uppercase tracking-widest hover:bg-primary-light transition-all flex items-center gap-2 disabled:opacity-50"
            >
              {dispatchApprovedPayoutsMutation.isPending ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <CheckCircle2 size={16} aria-hidden="true" />}
              Dispatch
            </button>
            <button
              onClick={() => {
                const code = window.prompt("Masukkan 6-digit kode TOTP untuk RECONCILE:");
                if (code) reconcilePayoutsMutation.mutate(code);
              }}
              disabled={reconcilePayoutsMutation.isPending}
              className="px-5 py-2.5 rounded-2xl bg-info-surface border border-info text-info font-black text-xs uppercase tracking-widest hover:bg-info-surface transition-all flex items-center gap-2 disabled:opacity-50"
            >
              {reconcilePayoutsMutation.isPending ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <ShieldCheck size={16} aria-hidden="true" />}
              Reconcile
            </button>
            <button
              onClick={async () => {
                try {
                  const res = await api.get('/admin/finance/payouts/export', { responseType: 'blob' })
                  const url = URL.createObjectURL(res.data)
                  const a = document.createElement('a')
                  a.href = url
                  a.download = `payouts_export_${new Date().toISOString().split('T')[0]}.csv`
                  a.click()
                  URL.revokeObjectURL(url)
                } catch (error) { clientLog.error('Payout export failed', { error }) }
              }}
              className="px-5 py-2.5 rounded-2xl bg-success-surface border border-success text-success font-black text-xs uppercase tracking-widest hover:bg-success-surface transition-all flex items-center gap-2"
            >
              <Download size={16} aria-hidden="true" />
              Export CSV
            </button>
            <button
              onClick={async () => {
                try {
                  const res = await api.get('/admin/audit-logs/export', { responseType: 'blob' })
                  const url = URL.createObjectURL(res.data)
                  const a = document.createElement('a')
                  a.href = url
                  a.download = `system_audit_${new Date().toISOString().split('T')[0]}.csv`
                  a.click()
                  URL.revokeObjectURL(url)
                } catch { toast.error('Audit export failed') }
              }}
              className="px-5 py-2.5 rounded-2xl bg-surface-subtle border border-border text-foreground-muted font-black text-xs uppercase tracking-widest hover:bg-surface-subtle transition-all flex items-center gap-2"
            >
              <Download size={16} aria-hidden="true" />
              Audit CSV
            </button>
            <button
              onClick={async () => {
                try {
                  const res = await api.get('/admin/finance/payout-risk-audit/export', { responseType: 'blob' })
                  const url = URL.createObjectURL(res.data)
                  const a = document.createElement('a')
                  a.href = url
                  a.download = `payout_risk_audit_${new Date().toISOString().split('T')[0]}.csv`
                  a.click()
                  URL.revokeObjectURL(url)
                } catch { toast.error('Risk audit export failed') }
              }}
              className="px-5 py-2.5 rounded-2xl bg-surface-subtle border border-border text-foreground-muted font-black text-xs uppercase tracking-widest hover:bg-surface-subtle transition-all flex items-center gap-2"
            >
              <Download size={16} aria-hidden="true" />
              Risk CSV
            </button>
          </div>
        )}
      </div>

      {/* ── Cash Position Strip ─────────────────────────────────────────── */}
      {!isLoadingCashPosition && cashPosition && (
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
          {[
            { label: 'Kas Masuk 30H', value: cashPosition.inflow_30d, color: 'text-success', icon: ArrowUpRight },
            { label: 'Kas Keluar 30H', value: cashPosition.outflow_30d, color: 'text-error', icon: ArrowDownRight },
            { label: 'Escrow Customer', value: cashPosition.customer_escrow, color: 'text-warning', icon: Wallet },
            { label: 'Escrow Kurir', value: cashPosition.courier_escrow, color: 'text-info', icon: Users },
            { label: 'Payout Pending', value: cashPosition.pending_payouts, color: 'text-accent', icon: Clock },
            { label: 'Total Liabilitas', value: cashPosition.total_liabilities, color: 'text-error', icon: TrendingDown },
            { label: 'Emergency Fund', value: cashPosition.emergency_fund, color: 'text-warning', icon: ShieldAlert },
            { label: 'Cash Ratio', value: null, rawLabel: `${cashPosition.cash_ratio}%`, color: cashPosition.cash_ratio > 30 ? 'text-success' : 'text-error', icon: BarChart2 },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.label} className="glass-card p-4 rounded-[20px] border-border space-y-2">
                <div className="flex items-center gap-2">
                  <Icon size={12} className={item.color} aria-hidden="true" />
                  <p className="text-[9px] font-black text-foreground-muted uppercase tracking-widest leading-tight">{item.label}</p>
                </div>
                <p className={`text-base font-black ${item.color} leading-none`}>
                  {item.rawLabel ?? `Rp ${Number(item.value || 0).toLocaleString('id-ID')}`}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Tab Navigation ──────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-1 p-1 rounded-2xl bg-surface/[0.03] border border-border w-fit">
        {([
          { id: 'treasury' as FinanceTab, label: 'Treasury & Settlement', icon: Landmark },
          { id: 'pnl' as FinanceTab, label: 'Laporan P&L', icon: BarChart2 },
          { id: 'tax' as FinanceTab, label: 'Pajak (PPN + PPh)', icon: Receipt },
          { id: 'trial-balance' as FinanceTab, label: 'Neraca Saldo', icon: PieIcon },
          { id: 'ledger' as FinanceTab, label: 'Buku Besar', icon: Wallet },
          { id: 'reconciliation' as FinanceTab, label: 'Reconciliation Center', icon: ShieldCheck },
          { id: 'closing' as FinanceTab, label: 'Monthly Closing', icon: Lock },
          { id: 'unit-economics' as FinanceTab, label: 'Unit Economics', icon: TrendingUp },
        ]).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={cn(
              'flex items-center gap-2 px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all',
              activeTab === id
                ? 'bg-primary text-on-primary shadow-lg shadow-primary/20'
                : 'text-foreground-muted hover:text-foreground-muted hover:bg-surface-subtle'
            )}
          >
            <Icon size={14} aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'treasury' && <TreasuryPanel data={data} />}
      {activeTab === 'pnl' && <PnlPanel data={data} />}
      {activeTab === 'tax' && <TaxPanel data={data} />}
      {activeTab === 'trial-balance' && <TrialbalancePanel data={data} />}
      {activeTab === 'ledger' && <LedgerPanel data={data} />}
      {activeTab === 'reconciliation' && <ReconciliationPanel data={data} />}
      {activeTab === 'unit-economics' && <UniteconomicsPanel data={data} />}
      {activeTab === 'closing' && <ClosingPanel data={data} />}
      </div>
  );
}
