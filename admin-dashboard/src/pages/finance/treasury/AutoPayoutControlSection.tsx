import { cn } from '../../../lib/utils';
import { DollarSign, TrendingUp, TrendingDown, PieChart as PieIcon, CreditCard, History, ArrowUpRight, ArrowDownRight, ShieldAlert, Download, CloudRain, ChevronRight, Loader2, Landmark, CheckCircle2, XCircle, Ban, ShieldCheck, FileSearch, Smartphone, AlertTriangle, Wallet, Users, Clock, BarChart2, FileText, Receipt, Calendar, AlertCircle, ArrowRight, TrendingDown as TrendDown, Lock } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { clientLog } from '../../../lib/clientLogger';
import { api } from '../../../lib/api';
import { format, parseISO } from 'date-fns';
import { id as localeId } from 'date-fns/locale';
import { ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip } from 'recharts';
import { ConfirmPayoutModal, type PayoutReviewAction } from '../../../components/ConfirmPayoutModal';
import { StatusBadge } from '../../../components/StatusBadge';
import type { FinanceData } from '../../useFinanceData';

export function AutoPayoutControlSection({ data }: { data: FinanceData }) {
  const {
    COLORS,
    activePayoutStatuses,
    payoutStatusLabel,
    riskActionLabel,
    queryClient,
    activeTab,
    setActiveTab,
    pnlPeriod,
    setPnlPeriod,
    pphPeriod,
    setPphPeriod,
    closingPeriod,
    setClosingPeriod,
    totpInput,
    setTotpInput,
    selectedReviewId,
    setSelectedReviewId,
    ledgerStartDate,
    setLedgerStartDate,
    ledgerEndDate,
    setLedgerEndDate,
    ledgerAccountFilter,
    setLedgerAccountFilter,
    ledgerJournalTypeFilter,
    setLedgerJournalTypeFilter,
    simInfraCost,
    setSimInfraCost,
    simSalaryCost,
    setSimSalaryCost,
    simReserveCost,
    setSimReserveCost,
    confirmModal,
    setConfirmModal,
    financialData,
    isLoadingStats,
    payouts,
    isLoadingPayouts,
    payoutAccounts,
    isLoadingPayoutAccounts,
    payoutRequests,
    isLoadingPayoutRequests,
    payoutOps,
    isLoadingPayoutOps,
    serviceSettlementSummary,
    isLoadingServiceSettlement,
    payoutReviewQueue,
    isLoadingReviewQueue,
    activeReviewId,
    payoutReviewDetail,
    cashPosition,
    isLoadingCashPosition,
    pnlReport,
    isLoadingPnl,
    taxDashboard,
    isLoadingTax,
    pphReport,
    isLoadingPph,
    unitEconomicsData,
    isLoadingUnitEconomics,
    updatePayoutAccountMutation,
    updatePayoutRequestMutation,
    payoutReviewActionMutation,
    dispatchApprovedPayoutsMutation,
    reconcilePayoutsMutation,
    releaseMutation,
    batchReleaseMutation,
    reconciliationSummary,
    isLoadingRecon,
    runReconciliationMutation,
    closingPeriods,
    isLoadingPeriods,
    closingPnl,
    isLoadingClosingPnl,
    closingTB,
    isLoadingClosingTB,
    closingCashLiability,
    isLoadingCashLiability,
    closingTaxSummary,
    isLoadingTaxSummary,
    closingSettlementOutstanding,
    isLoadingSettlementOutstanding,
    lockPeriodMutation,
    topUpMutation,
    trialBalanceData,
    isLoadingTrialBalance,
    ledgerEntriesData,
    isLoadingLedgerEntries,
    stats,
    revenueBreakdown,
    emergencyFund,
    unitEconomics,
    opsCounts,
    latestReconItems,
    formatCurrency,
    serviceSettlementRows,
    serviceSettlementTotals,
    serviceLabel,
    reviewRequest,
    reviewRisk,
    reviewAccount,
    handleExportEfaktur,
    handleExportPPh23,
    runReviewAction,
    handleModalConfirm,
    gtv,
    courierEscrow,
    totalTrx,
    realOmzet,
    totalInfra,
    totalSalary,
    totalReserve,
    totalCompanyDeductions,
    netProfit,
    pphBadan22,
  } = data;

  return (
    <>
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">

        <div className="glass-card p-8 rounded-[40px] border-border space-y-6">
          <h3 className="text-xl font-black text-foreground-muted italic uppercase">Auto Payout Control</h3>
          <div className="grid grid-cols-3 gap-3">
            {[
              ['Auto', opsCounts.auto_approved_count || 0, 'text-success'],
              ['Manual', opsCounts.manual_review_count || 0, 'text-warning'],
              ['Blocked', opsCounts.blocked_count || 0, 'text-error'],
            ].map(([label, value, color]) => (
              <div key={label as string} className="rounded-2xl bg-surface/[0.03] border border-border p-4">
                <p className="text-[9px] font-black uppercase tracking-widest text-foreground-muted">{label}</p>
                <p className={cn("text-3xl font-black mt-2", color as string)}>{value}</p>
              </div>
            ))}
          </div>
          <div className="rounded-2xl bg-surface-subtle border border-border p-4">
            <p className="text-[9px] font-black uppercase tracking-widest text-foreground-muted">Failed Monitor</p>
            <div className="mt-3 grid grid-cols-3 gap-3 text-center">
              <span className="text-xs text-foreground-muted">1h <b className="text-error">{payoutOps?.failed_monitor?.failed_last_hour || 0}</b></span>
              <span className="text-xs text-foreground-muted">24h <b className="text-error">{payoutOps?.failed_monitor?.failed_last_day || 0}</b></span>
              <span className="text-xs text-foreground-muted">Stale <b className="text-warning">{payoutOps?.failed_monitor?.stale_processing || 0}</b></span>
            </div>
          </div>
        </div>

        <div className="glass-card p-8 rounded-[40px] border-border space-y-5">
          <h3 className="text-xl font-black text-foreground-muted italic uppercase">Risk Reason Breakdown</h3>
          <div className="space-y-3 max-h-[240px] overflow-y-auto pr-1">
            {payoutOps?.risk_reason_breakdown?.map((item: any) => (
              <div key={item.reason} className="flex items-center justify-between gap-4 rounded-2xl bg-surface/[0.03] border border-border p-4">
                <p className="text-xs font-bold text-foreground-muted line-clamp-2" title={item.reason}>{item.reason}</p>
                <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-black text-primary-light">{item.count}</span>
              </div>
            ))}
            {(!payoutOps?.risk_reason_breakdown || payoutOps.risk_reason_breakdown.length === 0) && (
              <p className="py-8 text-center text-sm font-bold text-foreground-muted">Belum ada alasan risk aktif.</p>
            )}
          </div>
        </div>

        <div className="glass-card p-8 rounded-[40px] border-border space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-black text-foreground-muted italic uppercase">Reconciliation</h3>
            <span className={cn(
              "rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest",
              (payoutOps?.reconciliation?.mismatch_count || 0) > 0 ? "bg-error-surface text-error" : "bg-success-surface text-success"
            )}>
              {payoutOps?.reconciliation?.mismatch_count || 0} mismatch
            </span>
          </div>
          <div className="space-y-3 max-h-[240px] overflow-y-auto pr-1">
            {latestReconItems.slice(0, 6).map((item: any) => (
              <div key={item.id} className="rounded-2xl bg-surface/[0.03] border border-border p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-black text-foreground-muted uppercase">{String(item.check_type || '').replaceAll('_', ' ')}</p>
                  <StatusBadge
                    status={item.severity === 'critical' ? 'critical' : 'review'}
                    labelPrefix="Reconciliation severity"
                    className={item.severity === 'critical' ? 'border-error bg-error-surface' : 'border-warning bg-warning-surface'}
                  />
                </div>
                <p className="mt-2 text-[11px] text-foreground-muted">{item.expected_value || '-'} {'->'} {item.actual_value || '-'}</p>
              </div>
            ))}
            {latestReconItems.length === 0 && (
              <p className="py-8 text-center text-sm font-bold text-foreground-muted">Belum ada mismatch pada run terakhir.</p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
