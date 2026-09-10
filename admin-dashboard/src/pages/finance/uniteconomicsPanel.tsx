import { cn } from '../../lib/utils';
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
import { StatusBadge } from '../../components/StatusBadge';

export function UniteconomicsPanel({ data }: { data: FinanceData }) {
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
      {activeTab === 'unit-economics' && (
        <div className="space-y-8 animate-in">
          <div className="glass-card p-10 rounded-[48px] border-border space-y-8">
            <h3 className="text-2xl font-black text-foreground-muted italic uppercase">Unit Economics</h3>
            <p className="text-foreground-muted">Analisis metrik per transaksi (Margin, subsidi, promo) secara real-time.</p>
            {isLoadingUnitEconomics ? (
              <div className="py-12 flex justify-center"><Loader2 className="w-12 h-12 text-primary animate-spin" aria-hidden="true" /></div>
            ) : (
              <div className="space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                   {unitEconomicsData?.metrics?.map((item: any, i: number) => (
                     <div key={i} className="flex flex-col p-6 rounded-3xl bg-surface/[0.02] border border-border">
                        <p className="text-[10px] font-black text-foreground-muted uppercase tracking-widest">{item.label}</p>
                        <p className="text-2xl font-black text-foreground-muted mt-2">{formatCurrency(item.value)}</p>
                        <StatusBadge status={item.status} labelPrefix="Unit economics status" className="mt-4 w-fit" />
                     </div>
                   ))}
                </div>

                <div className="rounded-3xl bg-surface/[0.02] border border-border p-6 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h4 className="text-sm font-black text-foreground-muted uppercase tracking-widest">Financial Definition</h4>
                    <span className="text-[10px] font-mono text-primary">{unitEconomicsData?.definition?.version || 'unit-economics-2026-v1'}</span>
                  </div>
                  <p className="text-xs leading-6 text-foreground-muted">
                    Customer paid net refund dikurangi tax, MDR/provider fee, promo subsidy, merchant payable,
                    courier payable, carrier payable, dan Ads/other charges. Semua nilai dihitung server dari
                    financial facts dan snapshot; bukan estimasi analytics.
                  </p>
                  <p className="text-xs text-foreground-muted">
                    Coverage: {unitEconomicsData?.source_coverage?.pricing_snapshot_orders || 0} pricing snapshots ·{' '}
                    {unitEconomicsData?.source_coverage?.courier_ledger_orders || 0} courier ledger orders ·{' '}
                    {unitEconomicsData?.source_coverage?.missing_payment_orders || 0} missing payment facts ·{' '}
                    <StatusBadge
                      status={unitEconomicsData?.source_coverage?.reconciliation_status || 'unknown'}
                      labelPrefix="Unit economics reconciliation"
                      className={unitEconomicsData?.source_coverage?.reconciliation_status === 'complete' ? 'border-success bg-success-surface' : 'border-error bg-error-surface'}
                    />
                  </p>
                </div>

                {!!unitEconomicsData?.cohorts?.length && (
                  <div className="rounded-3xl bg-surface/[0.02] border border-border p-6 space-y-4">
                    <h4 className="text-sm font-black text-foreground-muted uppercase tracking-widest">Contribution by Cohort</h4>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead><tr className="border-b border-border text-foreground-muted text-[10px] uppercase tracking-wider">
                          <th scope="col" className="pb-3 pr-4">Cohort</th><th scope="col" className="pb-3 pr-4">Market</th><th scope="col" className="pb-3 pr-4">Service</th><th scope="col" className="pb-3 pr-4 text-right">Orders</th><th scope="col" className="pb-3 text-right">Contribution</th>
                        </tr></thead>
                        <tbody className="divide-y divide-border">{unitEconomicsData.cohorts.map((row: any, i: number) => (
                          <tr key={`${row.market_bucket}-${row.service_bucket}-${row.order_cohort}-${i}`}>
                            <td className="py-3 pr-4 text-xs text-foreground-muted">{row.order_cohort}</td><td className="py-3 pr-4 text-xs text-foreground-muted">{row.market_bucket}</td><td className="py-3 pr-4 text-xs text-foreground-muted">{row.service_bucket}</td><td className="py-3 pr-4 text-xs text-foreground-muted text-right">{row.order_count}</td><td className={cn('py-3 text-xs font-mono text-right', Number(row.platform_contribution_idr) < 0 ? 'text-error' : 'text-success')}>{formatCurrency(row.platform_contribution_idr)}</td>
                          </tr>
                        ))}</tbody>
                      </table>
                    </div>
                  </div>
                )}

                {!!unitEconomicsData?.negative_margin_outliers?.length && (
                  <div className="rounded-3xl bg-error/[0.03] border border-error p-6 space-y-4">
                    <h4 className="text-sm font-black text-error uppercase tracking-widest">Negative Margin Outliers</h4>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead><tr className="border-b border-error text-error text-[10px] uppercase tracking-wider">
                          <th scope="col" className="pb-3 pr-4">Order</th><th scope="col" className="pb-3 pr-4">Service</th><th scope="col" className="pb-3 pr-4">Pricing Rule</th><th scope="col" className="pb-3 text-right">Contribution</th>
                        </tr></thead>
                        <tbody className="divide-y divide-error">{unitEconomicsData.negative_margin_outliers.map((row: any) => (
                          <tr key={row.order_id}><td className="py-3 pr-4 text-xs text-foreground-muted">{row.order_number || row.order_id}</td><td className="py-3 pr-4 text-xs text-foreground-muted">{row.service_bucket}</td><td className="py-3 pr-4 text-xs font-mono text-foreground-muted">{row.pricing_rule_version || 'unversioned'}</td><td className="py-3 text-xs font-mono text-error text-right">{formatCurrency(row.platform_contribution_idr)}</td></tr>
                        ))}</tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          TAB: NERACA SALDO (TRIAL BALANCE)
      ══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'trial-balance' && (
        <div className="space-y-8 animate-in">
          <div className="glass-card p-10 rounded-[48px] border-border space-y-8">
            <h3 className="text-2xl font-black text-foreground-muted italic uppercase">Neraca Saldo (Trial Balance)</h3>
            <div className="flex gap-4 mb-4">
              <input type="date" value={ledgerStartDate} onChange={e => setLedgerStartDate(e.target.value)} className="px-4 py-2 bg-scrim/30 text-foreground rounded-xl" />
              <input type="date" value={ledgerEndDate} onChange={e => setLedgerEndDate(e.target.value)} className="px-4 py-2 bg-scrim/30 text-foreground rounded-xl" />
            </div>
            {isLoadingTrialBalance ? (
              <div className="py-12 flex justify-center"><Loader2 className="w-12 h-12 text-primary animate-spin" aria-hidden="true" /></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-border text-foreground-muted text-xs font-bold uppercase tracking-wider">
                      <th scope="col" className="pb-3">No. Akun / Nama</th>
                      <th scope="col" className="pb-3 text-right">Debit (Rp)</th>
                      <th scope="col" className="pb-3 text-right">Kredit (Rp)</th>
                      <th scope="col" className="pb-3 text-right">Saldo (Rp)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {trialBalanceData.map((row: any, i: number) => (
                      <tr key={i} className="hover:bg-surface/[0.02]">
                        <td className="py-4 text-sm font-bold text-foreground-muted">{row.account_name}</td>
                        <td className="py-4 text-sm font-mono text-foreground-muted text-right">{formatCurrency(row.debit_idr)}</td>
                        <td className="py-4 text-sm font-mono text-foreground-muted text-right">{formatCurrency(row.credit_idr)}</td>
                        <td className="py-4 text-sm font-mono font-bold text-foreground-muted text-right">{formatCurrency(row.balance_idr)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
