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
      <div className="glass-card rounded-[44px] border-white/5 overflow-hidden">
        <div className="p-8 border-b border-white/5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h3 className="text-2xl font-black text-zinc-100 italic uppercase flex items-center gap-3">
              <FileSearch className="text-amber-400" size={26} />
              Manual Review Queue
            </h3>
            <p className="text-sm text-zinc-500 mt-1">Prioritas berdasarkan risk score, status hold/block, nominal, dan aging request.</p>
          </div>
          <div className="grid grid-cols-3 gap-3 min-w-[320px]">
            <div className="rounded-2xl bg-white/[0.03] border border-white/5 p-3">
              <p className="text-[9px] font-black uppercase tracking-widest text-zinc-600">Queue</p>
              <p className="text-2xl font-black text-zinc-100">{payoutReviewQueue?.length || 0}</p>
            </div>
            <div className="rounded-2xl bg-red-500/10 border border-red-500/10 p-3">
              <p className="text-[9px] font-black uppercase tracking-widest text-red-400/70">Critical</p>
              <p className="text-2xl font-black text-red-400">
                {payoutReviewQueue?.filter((item: any) => item.status === 'blocked' || item.risk_level === 'critical').length || 0}
              </p>
            </div>
            <div className="rounded-2xl bg-amber-500/10 border border-amber-500/10 p-3">
              <p className="text-[9px] font-black uppercase tracking-widest text-amber-400/70">High</p>
              <p className="text-2xl font-black text-amber-400">
                {payoutReviewQueue?.filter((item: any) => item.risk_level === 'high').length || 0}
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[420px_1fr]">
          <div className="border-r border-white/5 p-6 space-y-3 max-h-[720px] overflow-y-auto">
            {payoutReviewQueue?.map((item: any) => (
              <button
                key={item.id}
                onClick={() => setSelectedReviewId(item.id)}
                className={cn(
                  "w-full text-left rounded-[28px] border p-5 transition-all",
                  activeReviewId === item.id
                    ? "bg-amber-500/10 border-amber-500/30"
                    : "bg-white/[0.02] border-white/5 hover:bg-white/[0.04]"
                )}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-zinc-100">{item.courier_name}</p>
                    <p className="mt-1 text-[11px] font-mono text-zinc-500">{item.request_number}</p>
                  </div>
                  <span className={cn(
                    "rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest",
                    item.status === 'blocked' ? "bg-red-500/10 text-red-400" :
                    item.risk_level === 'high' || item.risk_level === 'critical' ? "bg-amber-500/10 text-amber-400" :
                    "bg-white/5 text-zinc-400"
                  )}>
                    {item.risk_score || 0}
                  </span>
                </div>
                <div className="mt-4 flex items-center justify-between gap-3">
                  <p className="text-sm font-black text-zinc-100">{formatCurrency(item.amount_idr)}</p>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">{payoutStatusLabel(item)}</p>
                </div>
                {item.risk_reasons?.length > 0 && (
                  <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-zinc-400">{item.risk_reasons.slice(0, 2).join(' • ')}</p>
                )}
              </button>
            ))}
            {(!payoutReviewQueue || payoutReviewQueue.length === 0) && (
              <div className="py-16 text-center text-sm font-bold text-zinc-500">Tidak ada payout yang perlu manual review.</div>
            )}
          </div>

          <div className="p-8 space-y-6">
            {reviewRequest ? (
              <>
                <div className="flex flex-col xl:flex-row xl:items-start justify-between gap-6">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.24em] text-zinc-600">Review Case</p>
                    <h4 className="mt-2 text-3xl font-black text-zinc-100">{reviewRequest.courier_name}</h4>
                    <p className="mt-1 text-sm text-zinc-500">{reviewRequest.request_number} • {format(new Date(reviewRequest.requested_at), 'dd MMM yyyy HH:mm')}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3 min-w-[320px]">
                    <div className="rounded-2xl bg-black/20 border border-white/5 p-4">
                      <p className="text-[9px] font-black uppercase tracking-widest text-zinc-600">Risk Score</p>
                      <p className={cn("mt-2 text-3xl font-black", (reviewRisk?.score || 0) >= 80 ? "text-red-400" : "text-amber-400")}>{reviewRisk?.score || 0}</p>
                    </div>
                    <div className="rounded-2xl bg-black/20 border border-white/5 p-4">
                      <p className="text-[9px] font-black uppercase tracking-widest text-zinc-600">Nominal</p>
                      <p className="mt-3 text-lg font-black text-zinc-100">{formatCurrency(reviewRequest.amount_idr)}</p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <div className="rounded-[28px] border border-red-500/10 bg-red-500/[0.03] p-5 lg:col-span-2">
                    <p className="text-[10px] font-black uppercase tracking-widest text-red-400 flex items-center gap-2">
                      <AlertTriangle size={14} />
                      Alasan Hold / Block
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {(reviewRisk?.reasons || []).map((reason: string) => (
                        <span key={reason} className="rounded-full bg-black/20 border border-white/5 px-3 py-2 text-xs font-bold text-zinc-300">{reason}</span>
                      ))}
                      {(!reviewRisk?.reasons || reviewRisk.reasons.length === 0) && (
                        <span className="text-sm font-bold text-zinc-500">Tidak ada alasan risk aktif.</span>
                      )}
                    </div>
                  </div>
                  <div className="rounded-[28px] border border-white/5 bg-white/[0.02] p-5">
                    <p className="text-[10px] font-black uppercase tracking-widest text-zinc-600">Rekening Tujuan</p>
                    <p className="mt-4 text-lg font-black text-zinc-100">{reviewAccount?.bank_code || '-'}</p>
                    <p className="mt-1 text-sm text-zinc-400">{reviewAccount?.account_number || '-'}</p>
                    <p className="mt-1 text-xs text-zinc-500">{reviewAccount?.account_name || '-'}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="rounded-[28px] border border-white/5 bg-white/[0.02] p-5 space-y-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-zinc-600 flex items-center gap-2">
                      <Smartphone size={14} />
                      Device / IP Metadata
                    </p>
                    <div className="grid grid-cols-1 gap-3 text-sm">
                      <div className="flex justify-between gap-4"><span className="text-zinc-500">Device</span><b className="text-zinc-200 truncate">{reviewRisk?.device_id || '-'}</b></div>
                      <div className="flex justify-between gap-4"><span className="text-zinc-500">IP Address</span><b className="text-zinc-200">{reviewRisk?.ip_address || '-'}</b></div>
                      <div className="flex justify-between gap-4"><span className="text-zinc-500">User Agent</span><b className="text-zinc-200 truncate">{reviewRisk?.user_agent || '-'}</b></div>
                    </div>
                  </div>

                  <div className="rounded-[28px] border border-white/5 bg-white/[0.02] p-5 space-y-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-zinc-600">Ledger Source</p>
                    <div className="space-y-2 max-h-[180px] overflow-y-auto pr-1">
                      {payoutReviewDetail?.ledger_sources?.slice(0, 6).map((ledger: any) => (
                        <div key={ledger.id} className="flex items-center justify-between gap-4 rounded-2xl bg-black/20 border border-white/5 px-4 py-3">
                          <div>
                            <p className="text-xs font-black text-zinc-200">{ledger.transaction_type}</p>
                            <p className="text-[11px] text-zinc-500">{ledger.description || ledger.source}</p>
                          </div>
                          <span className={cn("text-sm font-black", ledger.direction === 'credit' ? "text-emerald-400" : "text-red-400")}>{formatCurrency(ledger.amount_idr)}</span>
                        </div>
                      ))}
                      {(!payoutReviewDetail?.ledger_sources || payoutReviewDetail.ledger_sources.length === 0) && (
                        <p className="py-8 text-center text-sm font-bold text-zinc-500">Belum ada ledger source.</p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="rounded-[28px] border border-white/5 bg-white/[0.02] p-5 space-y-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-zinc-600">History Payout Kurir</p>
                    <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                      {payoutReviewDetail?.payout_history?.map((history: any) => (
                        <div key={history.id} className="flex items-center justify-between gap-4 rounded-2xl bg-black/20 border border-white/5 px-4 py-3">
                          <div>
                            <p className="text-xs font-black text-zinc-200">{history.request_number}</p>
                            <p className="text-[11px] text-zinc-500">{format(new Date(history.requested_at), 'dd MMM HH:mm')}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-black text-zinc-100">{formatCurrency(history.amount_idr)}</p>
                            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">{history.status}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-[28px] border border-white/5 bg-white/[0.02] p-5 space-y-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-zinc-600">Audit Trail Terakhir</p>
                    <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                      {payoutReviewDetail?.security_events?.slice(0, 8).map((event: any) => (
                        <div key={event.id} className="rounded-2xl bg-black/20 border border-white/5 px-4 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-xs font-black text-zinc-200">{String(event.event_type || '').replaceAll('_', ' ')}</p>
                            <p className="text-[10px] font-bold text-zinc-500">{format(new Date(event.created_at), 'dd MMM HH:mm')}</p>
                          </div>
                          <p className="mt-1 text-[11px] text-zinc-500">{event.old_status || '-'} {'->'} {event.new_status || '-'}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="rounded-[28px] border border-amber-500/10 bg-amber-500/[0.03] p-5">
                  <p className="text-[10px] font-black uppercase tracking-widest text-amber-400">Admin Actions</p>
                  <p className="mt-2 text-sm text-zinc-500">Semua aksi di bawah wajib TOTP melalui middleware admin dan dicatat ke audit trail payout.</p>
                  <div className="mt-5 flex flex-wrap gap-3">
                    <button
                      onClick={() => runReviewAction('approve')}
                      disabled={payoutReviewActionMutation.isPending || reviewRequest.status === 'blocked'}
                      className="px-5 py-3 rounded-2xl bg-emerald-500 text-white font-black text-xs uppercase tracking-widest disabled:opacity-40"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => runReviewAction('reject')}
                      disabled={payoutReviewActionMutation.isPending}
                      className="px-5 py-3 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 font-black text-xs uppercase tracking-widest disabled:opacity-40"
                    >
                      Reject
                    </button>
                    <button
                      onClick={() => runReviewAction('request_more_verification')}
                      disabled={payoutReviewActionMutation.isPending}
                      className="px-5 py-3 rounded-2xl bg-white/5 border border-white/10 text-zinc-300 font-black text-xs uppercase tracking-widest disabled:opacity-40"
                    >
                      Request Verification
                    </button>
                    <button
                      onClick={() => runReviewAction('suspend_payout_account')}
                      disabled={payoutReviewActionMutation.isPending}
                      className="px-5 py-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 font-black text-xs uppercase tracking-widest disabled:opacity-40"
                    >
                      Suspend Account
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="py-28 text-center">
                <FileSearch className="mx-auto text-zinc-700" size={54} />
                <p className="mt-4 text-lg font-black text-zinc-400">Pilih request untuk investigasi.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}