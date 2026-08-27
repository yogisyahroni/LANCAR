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

export function PayoutReviewsSection({ data }: { data: FinanceData }) {
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
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        <div className="glass-card p-8 rounded-[40px] border-white/5 space-y-8">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-2xl font-black text-zinc-100 italic uppercase flex items-center gap-3">
                <Landmark className="text-primary-light" size={26} />
                Rekening Pencairan
              </h3>
              <p className="text-sm text-zinc-500 mt-1">Review rekening kurir sebelum saldo dapat dicairkan.</p>
            </div>
            <span className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] font-black text-zinc-400 uppercase tracking-widest">
              {payoutAccounts?.filter((item: any) => item.status === 'pending_review').length || 0} pending
            </span>
          </div>

          <div className="space-y-4 max-h-[560px] overflow-y-auto pr-2">
            {payoutAccounts?.map((account: any) => (
              <div key={account.id} className="p-5 rounded-[28px] bg-white/[0.02] border border-white/5 space-y-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-base font-black text-zinc-100 truncate">{account.courier_name}</p>
                    <p className="text-xs text-zinc-500 mt-1">{account.courier_phone || '-'} • {account.application_channel || 'courier'}</p>
                  </div>
                  <span className={cn(
                    "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest shrink-0",
                    account.status === 'verified' ? "bg-emerald-500/10 text-emerald-400" :
                    account.status === 'pending_review' ? "bg-amber-500/10 text-amber-400" :
                    "bg-red-500/10 text-red-400"
                  )}>
                    {account.status}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="p-3 rounded-2xl bg-black/20 border border-white/5">
                    <p className="text-[9px] text-zinc-600 font-black uppercase tracking-widest">Bank</p>
                    <p className="text-sm font-black text-zinc-200 mt-1">{account.bank_code}</p>
                  </div>
                  <div className="p-3 rounded-2xl bg-black/20 border border-white/5">
                    <p className="text-[9px] text-zinc-600 font-black uppercase tracking-widest">Nomor</p>
                    <p className="text-sm font-black text-zinc-200 mt-1">{account.account_number}</p>
                  </div>
                  <div className="p-3 rounded-2xl bg-black/20 border border-white/5 min-w-0">
                    <p className="text-[9px] text-zinc-600 font-black uppercase tracking-widest">Nama</p>
                    <p className="text-sm font-black text-zinc-200 mt-1 truncate">{account.account_name}</p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => updatePayoutAccountMutation.mutate({
                      id: account.id,
                      status: 'verified',
                      reason: 'Rekening sesuai dokumen onboarding dan siap untuk pencairan.'
                    })}
                    disabled={account.status === 'verified' || updatePayoutAccountMutation.isPending}
                    className="px-4 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-black text-[10px] uppercase tracking-widest hover:bg-emerald-500/20 disabled:opacity-40 flex items-center gap-2"
                  >
                    <CheckCircle2 size={14} />
                    Verifikasi
                  </button>
                  <button
                    onClick={() => {
                      const reason = prompt('Alasan penolakan rekening:') || 'Data rekening tidak sesuai dokumen.';
                      updatePayoutAccountMutation.mutate({ id: account.id, status: 'rejected', reason });
                    }}
                    disabled={account.status === 'rejected' || updatePayoutAccountMutation.isPending}
                    className="px-4 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 font-black text-[10px] uppercase tracking-widest hover:bg-red-500/20 disabled:opacity-40 flex items-center gap-2"
                  >
                    <XCircle size={14} />
                    Tolak
                  </button>
                  <button
                    onClick={() => {
                      // Inline confirm for account-level suspend (no payout amount context here)
                      if (window.confirm(`Suspend rekening payout milik ${account.account_name || 'kurir ini'}? Aksi ini akan diaudit.`)) {
                        updatePayoutAccountMutation.mutate({ id: account.id, status: 'suspended', reason: 'Rekening ditahan untuk review keamanan oleh admin.' });
                      }
                    }}
                    disabled={account.status === 'suspended' || updatePayoutAccountMutation.isPending}
                    className="px-4 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 font-black text-[10px] uppercase tracking-widest hover:bg-amber-500/20 disabled:opacity-40 flex items-center gap-2"
                  >
                    <Ban size={14} />
                    Suspend
                  </button>
                </div>
              </div>
            ))}
            {(!payoutAccounts || payoutAccounts.length === 0) && (
              <div className="py-16 text-center text-zinc-500 font-bold">Belum ada rekening pencairan untuk direview.</div>
            )}
          </div>
        </div>

        <div className="glass-card p-8 rounded-[40px] border-white/5 space-y-8">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-2xl font-black text-zinc-100 italic uppercase flex items-center gap-3">
                <ShieldCheck className="text-primary-light" size={26} />
                Pengajuan Pencairan
              </h3>
              <p className="text-sm text-zinc-500 mt-1">Kontrol status settlement kurir dengan audit trail.</p>
            </div>
            <span className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] font-black text-zinc-400 uppercase tracking-widest">
              {payoutRequests?.filter((item: any) => activePayoutStatuses.includes(item.status)).length || 0} aktif
            </span>
          </div>

          <div className="space-y-4 max-h-[560px] overflow-y-auto pr-2">
            {payoutRequests?.map((request: any) => (
              <div key={request.id} className="p-5 rounded-[28px] bg-white/[0.02] border border-white/5 space-y-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-base font-black text-zinc-100 truncate">{request.courier_name}</p>
                    <p className="text-xs text-zinc-500 mt-1">{request.request_number} • {format(new Date(request.requested_at), 'dd MMM yyyy HH:mm')}</p>
                  </div>
                  <span className={cn(
                    "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest shrink-0",
                    request.status === 'paid' ? "bg-emerald-500/10 text-emerald-400" :
                    ['failed', 'rejected', 'blocked', 'cancelled'].includes(request.status) ? "bg-red-500/10 text-red-400" :
                    ['approved_auto', 'approved', 'processing'].includes(request.status) ? "bg-primary/10 text-primary-light" :
                    "bg-amber-500/10 text-amber-400"
                  )}>
                    {payoutStatusLabel(request)}
                  </span>
                </div>

                {request.risk_decision && (
                  <div className="rounded-2xl border border-white/5 bg-black/20 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[9px] font-black uppercase tracking-widest text-zinc-600">Risk Engine</p>
                      <span className={cn(
                        "rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-widest",
                        request.risk_decision === 'auto_approved' ? "bg-emerald-500/10 text-emerald-400" :
                        request.risk_decision === 'blocked' ? "bg-red-500/10 text-red-400" :
                        "bg-amber-500/10 text-amber-400"
                      )}>
                        {riskActionLabel(request)} • {request.risk_score ?? 0}
                      </span>
                    </div>
                    {request.risk_reasons?.length > 0 && (
                      <p className="mt-2 line-clamp-2 text-xs text-zinc-400">{request.risk_reasons.slice(0, 2).join(' • ')}</p>
                    )}
                  </div>
                )}

                {(request.provider_reference || request.provider_status || request.provider_payload_hash) && (
                  <div className="rounded-2xl border border-primary/10 bg-primary/5 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[9px] font-black uppercase tracking-widest text-zinc-600">Provider Dispatch</p>
                      <span className={cn(
                        "rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-widest",
                        request.provider_status === 'paid' || request.status === 'paid' ? "bg-emerald-500/10 text-emerald-400" :
                        request.provider_status === 'failed' || request.status === 'failed' ? "bg-red-500/10 text-red-400" :
                        "bg-blue-500/10 text-blue-400"
                      )}>
                        {request.provider_status || request.status}
                      </span>
                    </div>
                    <div className="mt-2 grid grid-cols-1 gap-1 text-xs text-zinc-400">
                      <span>Provider: <b className="text-zinc-200">{request.provider_name || '-'}</b></span>
                      <span>Reference: <b className="text-zinc-200">{request.provider_reference || '-'}</b></span>
                      <span>Payload: <b className="text-zinc-200">{String(request.provider_payload_hash || request.dispatch_payload_hash || '-').slice(0, 12)}</b></span>
                      <span>Response: <b className="text-zinc-200">{String(request.provider_response_hash || request.dispatch_response_hash || '-').slice(0, 12)}</b></span>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-2xl bg-black/20 border border-white/5">
                    <p className="text-[9px] text-zinc-600 font-black uppercase tracking-widest">Nominal</p>
                    <p className="text-lg font-black text-zinc-100 mt-1">{formatCurrency(request.amount_idr)}</p>
                  </div>
                  <div className="p-3 rounded-2xl bg-black/20 border border-white/5">
                    <p className="text-[9px] text-zinc-600 font-black uppercase tracking-widest">Tujuan</p>
                    <p className="text-sm font-black text-zinc-200 mt-1">
                      {request.destination_snapshot?.bank_code} • **** {request.destination_snapshot?.account_number_last4}
                    </p>
                  </div>
                </div>

                {!['paid', 'failed', 'rejected', 'blocked', 'cancelled'].includes(request.status) && (
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => updatePayoutRequestMutation.mutate({
                        id: request.id,
                        status: 'manual_review',
                        reason: 'Masuk proses review treasury.'
                      })}
                      disabled={!['requested', 'risk_screening', 'risk_hold'].includes(request.status) || updatePayoutRequestMutation.isPending}
                      className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-zinc-300 font-black text-[10px] uppercase tracking-widest hover:bg-white/10 disabled:opacity-40"
                    >
                      Review
                    </button>
                    <button
                      onClick={() => updatePayoutRequestMutation.mutate({
                        id: request.id,
                        status: 'approved',
                        reason: 'Disetujui untuk proses settlement.'
                      })}
                      disabled={!['requested', 'risk_screening', 'risk_hold', 'manual_review', 'under_review', 'approved_auto'].includes(request.status) || updatePayoutRequestMutation.isPending}
                      className="px-4 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-black text-[10px] uppercase tracking-widest hover:bg-emerald-500/20 disabled:opacity-40"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => updatePayoutRequestMutation.mutate({
                        id: request.id,
                        status: 'paid',
                        reason: 'Dana sudah dikirim ke rekening terverifikasi.'
                      })}
                      disabled={!['approved_auto', 'approved', 'processing'].includes(request.status) || updatePayoutRequestMutation.isPending}
                      className="px-4 py-2 rounded-xl bg-primary text-white font-black text-[10px] uppercase tracking-widest hover:bg-primary-light disabled:opacity-40"
                    >
                      Mark Paid
                    </button>
                    <button
                      onClick={() => {
                        if (window.confirm('Reject payout ini? Kurir dapat mengajukan ulang. Aksi ini dicatat ke audit trail.')) {
                          updatePayoutRequestMutation.mutate({ id: request.id, status: 'rejected', reason: 'Pencairan tidak lolos review treasury.' });
                        }
                      }}
                      disabled={updatePayoutRequestMutation.isPending}
                      className="px-4 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 font-black text-[10px] uppercase tracking-widest hover:bg-red-500/20 disabled:opacity-40"
                    >
                      Reject
                    </button>
                  </div>
                )}
              </div>
            ))}
            {(!payoutRequests || payoutRequests.length === 0) && (
              <div className="py-16 text-center text-zinc-500 font-bold">Belum ada pengajuan pencairan.</div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}