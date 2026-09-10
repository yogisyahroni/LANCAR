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
import type { FinanceData } from '../../useFinanceData';
import { StatusBadge } from '../../../components/StatusBadge';

export function ManualReviewSection({ data }: { data: FinanceData }) {
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
      <div className="glass-card rounded-[44px] border-border overflow-hidden">
        <div className="p-8 border-b border-border flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h3 className="text-2xl font-black text-foreground-muted italic uppercase flex items-center gap-3">
              <FileSearch className="text-warning" size={26} aria-hidden="true" />
              Manual Review Queue
            </h3>
            <p className="text-sm text-foreground-muted mt-1">Prioritas berdasarkan risk score, status hold/block, nominal, dan aging request.</p>
          </div>
          <div className="grid grid-cols-3 gap-3 min-w-[320px]">
            <div className="rounded-2xl bg-surface/[0.03] border border-border p-3">
              <p className="text-[9px] font-black uppercase tracking-widest text-foreground-muted">Queue</p>
              <p className="text-2xl font-black text-foreground-muted">{payoutReviewQueue?.length || 0}</p>
            </div>
            <div className="rounded-2xl bg-error-surface border border-error p-3">
              <p className="text-[9px] font-black uppercase tracking-widest text-error">Critical</p>
              <p className="text-2xl font-black text-error">
                {payoutReviewQueue?.filter((item: any) => item.status === 'blocked' || item.risk_level === 'critical').length || 0}
              </p>
            </div>
            <div className="rounded-2xl bg-warning-surface border border-warning p-3">
              <p className="text-[9px] font-black uppercase tracking-widest text-warning">High</p>
              <p className="text-2xl font-black text-warning">
                {payoutReviewQueue?.filter((item: any) => item.risk_level === 'high').length || 0}
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[420px_1fr]">
          <div className="border-r border-border p-6 space-y-3 max-h-[720px] overflow-y-auto">
            {payoutReviewQueue?.map((item: any) => (
              <button
                key={item.id}
                onClick={() => setSelectedReviewId(item.id)}
                className={cn(
                  "w-full text-left rounded-[28px] border p-5 transition-all",
                  activeReviewId === item.id
                    ? "bg-warning-surface border-warning"
                    : "bg-surface/[0.02] border-border hover:bg-surface/[0.04]"
                )}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-foreground-muted" title={item.courier_name}>{item.courier_name}</p>
                    <p className="mt-1 text-[11px] font-mono text-foreground-muted">{item.request_number}</p>
                  </div>
                  <span className={cn(
                    "rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest",
                    item.status === 'blocked' ? "bg-error-surface text-error" :
                    item.risk_level === 'high' || item.risk_level === 'critical' ? "bg-warning-surface text-warning" :
                    "bg-surface-subtle text-foreground-muted"
                  )}>
                    {item.risk_score || 0}
                  </span>
                </div>
                <div className="mt-4 flex items-center justify-between gap-3">
                  <p className="text-sm font-black text-foreground-muted">{formatCurrency(item.amount_idr)}</p>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-foreground-muted">{payoutStatusLabel(item)}</p>
                </div>
                {item.risk_reasons?.length > 0 && (
                  <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-foreground-muted" title={item.risk_reasons.slice(0, 2).join(' • ')}>{item.risk_reasons.slice(0, 2).join(' • ')}</p>
                )}
              </button>
            ))}
            {(!payoutReviewQueue || payoutReviewQueue.length === 0) && (
              <div className="py-16 text-center text-sm font-bold text-foreground-muted">Tidak ada payout yang perlu manual review.</div>
            )}
          </div>

          <div className="p-8 space-y-6">
            {reviewRequest ? (
              <>
                <div className="flex flex-col xl:flex-row xl:items-start justify-between gap-6">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.24em] text-foreground-muted">Review Case</p>
                    <h4 className="mt-2 text-3xl font-black text-foreground-muted">{reviewRequest.courier_name}</h4>
                    <p className="mt-1 text-sm text-foreground-muted">{reviewRequest.request_number} • {format(new Date(reviewRequest.requested_at), 'dd MMM yyyy HH:mm')}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3 min-w-[320px]">
                    <div className="rounded-2xl bg-surface-subtle border border-border p-4">
                      <p className="text-[9px] font-black uppercase tracking-widest text-foreground-muted">Risk Score</p>
                      <p className={cn("mt-2 text-3xl font-black", (reviewRisk?.score || 0) >= 80 ? "text-error" : "text-warning")}>{reviewRisk?.score || 0}</p>
                    </div>
                    <div className="rounded-2xl bg-surface-subtle border border-border p-4">
                      <p className="text-[9px] font-black uppercase tracking-widest text-foreground-muted">Nominal</p>
                      <p className="mt-3 text-lg font-black text-foreground-muted">{formatCurrency(reviewRequest.amount_idr)}</p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <div className="rounded-[28px] border border-error bg-error/[0.03] p-5 lg:col-span-2">
                    <p className="text-[10px] font-black uppercase tracking-widest text-error flex items-center gap-2">
                      <AlertTriangle size={14} aria-hidden="true" />
                      Alasan Hold / Block
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {(reviewRisk?.reasons || []).map((reason: string) => (
                        <span key={reason} className="rounded-full bg-surface-subtle border border-border px-3 py-2 text-xs font-bold text-foreground-muted">{reason}</span>
                      ))}
                      {(!reviewRisk?.reasons || reviewRisk.reasons.length === 0) && (
                        <span className="text-sm font-bold text-foreground-muted">Tidak ada alasan risk aktif.</span>
                      )}
                    </div>
                  </div>
                  <div className="rounded-[28px] border border-border bg-surface/[0.02] p-5">
                    <p className="text-[10px] font-black uppercase tracking-widest text-foreground-muted">Rekening Tujuan</p>
                    <p className="mt-4 text-lg font-black text-foreground-muted">{reviewAccount?.bank_code || '-'}</p>
                    <p className="mt-1 text-sm text-foreground-muted">{reviewAccount?.account_number || '-'}</p>
                    <p className="mt-1 text-xs text-foreground-muted">{reviewAccount?.account_name || '-'}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="rounded-[28px] border border-border bg-surface/[0.02] p-5 space-y-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-foreground-muted flex items-center gap-2">
                      <Smartphone size={14} aria-hidden="true" />
                      Device / IP Metadata
                    </p>
                    <div className="grid grid-cols-1 gap-3 text-sm">
                      <div className="flex justify-between gap-4"><span className="text-foreground-muted">Device</span><b className="text-foreground-muted truncate" title={reviewRisk?.device_id || '-'}>{reviewRisk?.device_id || '-'}</b></div>
                      <div className="flex justify-between gap-4"><span className="text-foreground-muted">IP Address</span><b className="text-foreground-muted">{reviewRisk?.ip_address || '-'}</b></div>
                      <div className="flex justify-between gap-4"><span className="text-foreground-muted">User Agent</span><b className="text-foreground-muted truncate" title={reviewRisk?.user_agent || '-'}>{reviewRisk?.user_agent || '-'}</b></div>
                    </div>
                  </div>

                  <div className="rounded-[28px] border border-border bg-surface/[0.02] p-5 space-y-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-foreground-muted">Ledger Source</p>
                    <div className="space-y-2 max-h-[180px] overflow-y-auto pr-1">
                      {payoutReviewDetail?.ledger_sources?.slice(0, 6).map((ledger: any) => (
                        <div key={ledger.id} className="flex items-center justify-between gap-4 rounded-2xl bg-surface-subtle border border-border px-4 py-3">
                          <div>
                            <p className="text-xs font-black text-foreground-muted">{ledger.transaction_type}</p>
                            <p className="text-[11px] text-foreground-muted">{ledger.description || ledger.source}</p>
                          </div>
                          <span className={cn("text-sm font-black", ledger.direction === 'credit' ? "text-success" : "text-error")}>{formatCurrency(ledger.amount_idr)}</span>
                        </div>
                      ))}
                      {(!payoutReviewDetail?.ledger_sources || payoutReviewDetail.ledger_sources.length === 0) && (
                        <p className="py-8 text-center text-sm font-bold text-foreground-muted">Belum ada ledger source.</p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="rounded-[28px] border border-border bg-surface/[0.02] p-5 space-y-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-foreground-muted">History Payout Kurir</p>
                    <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                      {payoutReviewDetail?.payout_history?.map((history: any) => (
                        <div key={history.id} className="flex items-center justify-between gap-4 rounded-2xl bg-surface-subtle border border-border px-4 py-3">
                          <div>
                            <p className="text-xs font-black text-foreground-muted">{history.request_number}</p>
                            <p className="text-[11px] text-foreground-muted">{format(new Date(history.requested_at), 'dd MMM HH:mm')}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-black text-foreground-muted">{formatCurrency(history.amount_idr)}</p>
                            <StatusBadge status={history.status} labelPrefix="Payout history status" className="text-[10px] uppercase tracking-widest" />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-[28px] border border-border bg-surface/[0.02] p-5 space-y-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-foreground-muted">Audit Trail Terakhir</p>
                    <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                      {payoutReviewDetail?.security_events?.slice(0, 8).map((event: any) => (
                        <div key={event.id} className="rounded-2xl bg-surface-subtle border border-border px-4 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-xs font-black text-foreground-muted">{String(event.event_type || '').replaceAll('_', ' ')}</p>
                            <p className="text-[10px] font-bold text-foreground-muted">{format(new Date(event.created_at), 'dd MMM HH:mm')}</p>
                          </div>
                          <p className="mt-1 text-[11px] text-foreground-muted">{event.old_status || '-'} {'->'} {event.new_status || '-'}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="rounded-[28px] border border-warning bg-warning/[0.03] p-5">
                  <p className="text-[10px] font-black uppercase tracking-widest text-warning">Admin Actions</p>
                  <p className="mt-2 text-sm text-foreground-muted">Semua aksi di bawah wajib TOTP melalui middleware admin dan dicatat ke audit trail payout.</p>
                  <div className="mt-5 flex flex-wrap gap-3">
                    <button
                      onClick={() => runReviewAction('approve')}
                      disabled={payoutReviewActionMutation.isPending || reviewRequest.status === 'blocked'}
                      className="px-5 py-3 rounded-2xl bg-success text-on-success font-black text-xs uppercase tracking-widest disabled:opacity-60"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => runReviewAction('reject')}
                      disabled={payoutReviewActionMutation.isPending}
                      className="px-5 py-3 rounded-2xl bg-error-surface border border-error text-error font-black text-xs uppercase tracking-widest disabled:opacity-60"
                    >
                      Reject
                    </button>
                    <button
                      onClick={() => runReviewAction('request_more_verification')}
                      disabled={payoutReviewActionMutation.isPending}
                      className="px-5 py-3 rounded-2xl bg-surface-subtle border border-border text-foreground-muted font-black text-xs uppercase tracking-widest disabled:opacity-60"
                    >
                      Request Verification
                    </button>
                    <button
                      onClick={() => runReviewAction('suspend_payout_account')}
                      disabled={payoutReviewActionMutation.isPending}
                      className="px-5 py-3 rounded-2xl bg-warning-surface border border-warning text-warning font-black text-xs uppercase tracking-widest disabled:opacity-60"
                    >
                      Suspend Account
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="py-28 text-center">
                <FileSearch className="mx-auto text-foreground-muted" size={54} aria-hidden="true" />
                <p className="mt-4 text-lg font-black text-foreground-muted">Pilih request untuk investigasi.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
