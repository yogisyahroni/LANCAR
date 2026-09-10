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
        <div className="glass-card p-8 rounded-[40px] border-border space-y-8">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-2xl font-black text-foreground-muted italic uppercase flex items-center gap-3">
                <Landmark className="text-primary-light" size={26} aria-hidden="true" />
                Rekening Pencairan
              </h3>
              <p className="text-sm text-foreground-muted mt-1">Review rekening kurir sebelum saldo dapat dicairkan.</p>
            </div>
            <span className="px-3 py-1 rounded-full bg-surface-subtle border border-border text-xs font-black text-foreground-muted uppercase tracking-wide">
              {payoutAccounts?.filter((item: any) => item.status === 'pending_review').length || 0} pending
            </span>
          </div>

          <div className="space-y-4 max-h-[560px] overflow-y-auto pr-2">
            {payoutAccounts?.map((account: any) => (
              <div key={account.id} className="p-5 rounded-[28px] bg-surface/[0.02] border border-border space-y-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-base font-black text-foreground-muted truncate" title={account.courier_name}>{account.courier_name}</p>
                    <p className="text-xs text-foreground-muted mt-1">{account.courier_phone || '-'} • {account.application_channel || 'courier'}</p>
                  </div>
                            <StatusBadge status={account.status} labelPrefix="Payout account status" />
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="p-3 rounded-2xl bg-surface-subtle border border-border">
                    <p className="text-xs text-foreground-muted font-black uppercase tracking-wide">Bank</p>
                    <p className="text-sm font-black text-foreground-muted mt-1">{account.bank_code}</p>
                  </div>
                  <div className="p-3 rounded-2xl bg-surface-subtle border border-border">
                    <p className="text-xs text-foreground-muted font-black uppercase tracking-wide">Nomor</p>
                    <p className="text-sm font-black text-foreground-muted mt-1">{account.account_number}</p>
                  </div>
                  <div className="p-3 rounded-2xl bg-surface-subtle border border-border min-w-0">
                    <p className="text-xs text-foreground-muted font-black uppercase tracking-wide">Nama</p>
                    <p className="text-sm font-black text-foreground-muted mt-1 truncate" title={account.account_name}>{account.account_name}</p>
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
                    className="px-4 py-2 rounded-xl bg-success-surface border border-success text-success font-black text-xs uppercase tracking-wide hover:bg-success-surface disabled:opacity-60 flex items-center gap-2"
                  >
                    <CheckCircle2 size={14} aria-hidden="true" />
                    Verifikasi
                  </button>
                  <button
                    onClick={() => {
                      const reason = prompt('Alasan penolakan rekening:') || 'Data rekening tidak sesuai dokumen.';
                      updatePayoutAccountMutation.mutate({ id: account.id, status: 'rejected', reason });
                    }}
                    disabled={account.status === 'rejected' || updatePayoutAccountMutation.isPending}
                    className="px-4 py-2 rounded-xl bg-error-surface border border-error text-error font-black text-xs uppercase tracking-wide hover:bg-error-surface disabled:opacity-60 flex items-center gap-2"
                  >
                    <XCircle size={14} aria-hidden="true" />
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
                    className="px-4 py-2 rounded-xl bg-warning-surface border border-warning text-warning font-black text-xs uppercase tracking-wide hover:bg-warning-surface disabled:opacity-60 flex items-center gap-2"
                  >
                    <Ban size={14} aria-hidden="true" />
                    Suspend
                  </button>
                </div>
              </div>
            ))}
            {(!payoutAccounts || payoutAccounts.length === 0) && (
              <div className="py-16 text-center text-foreground-muted font-bold">Belum ada rekening pencairan untuk direview.</div>
            )}
          </div>
        </div>

        <div className="glass-card p-8 rounded-[40px] border-border space-y-8">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-2xl font-black text-foreground-muted italic uppercase flex items-center gap-3">
                <ShieldCheck className="text-primary-light" size={26} aria-hidden="true" />
                Pengajuan Pencairan
              </h3>
              <p className="text-sm text-foreground-muted mt-1">Kontrol status settlement kurir dengan audit trail.</p>
            </div>
            <span className="px-3 py-1 rounded-full bg-surface-subtle border border-border text-xs font-black text-foreground-muted uppercase tracking-wide">
              {payoutRequests?.filter((item: any) => activePayoutStatuses.includes(item.status)).length || 0} aktif
            </span>
          </div>

          <div className="space-y-4 max-h-[560px] overflow-y-auto pr-2">
            {payoutRequests?.map((request: any) => (
              <div key={request.id} className="p-5 rounded-[28px] bg-surface/[0.02] border border-border space-y-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-base font-black text-foreground-muted truncate" title={request.courier_name}>{request.courier_name}</p>
                    <p className="text-xs text-foreground-muted mt-1">{request.request_number} • {format(new Date(request.requested_at), 'dd MMM yyyy HH:mm')}</p>
                  </div>
                            <StatusBadge status={request.status} label={payoutStatusLabel(request)} labelPrefix="Payout request status" />
                </div>

                {request.risk_decision && (
                  <div className="rounded-2xl border border-border bg-surface-subtle p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-black uppercase tracking-wide text-foreground-muted">Risk Engine</p>
                      <StatusBadge status={request.risk_decision === 'auto_approved' ? 'approved_auto' : request.risk_decision === 'blocked' ? 'blocked' : 'pending_review'} label={`${riskActionLabel(request)} • ${request.risk_score ?? 0}`} labelPrefix="Risk decision" />
                    </div>
                    {request.risk_reasons?.length > 0 && (
                      <p className="mt-2 line-clamp-2 text-xs text-foreground-muted" title={request.risk_reasons.slice(0, 2).join(' • ')}>{request.risk_reasons.slice(0, 2).join(' • ')}</p>
                    )}
                  </div>
                )}

                {(request.provider_reference || request.provider_status || request.provider_payload_hash) && (
                  <div className="rounded-2xl border border-primary/10 bg-primary/5 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-black uppercase tracking-wide text-foreground-muted">Provider Dispatch</p>
                      <StatusBadge status={request.provider_status || request.status} labelPrefix="Provider payout status" />
                    </div>
                    <div className="mt-2 grid grid-cols-1 gap-1 text-xs text-foreground-muted">
                      <span>Provider: <b className="text-foreground-muted">{request.provider_name || '-'}</b></span>
                      <span>Reference: <b className="text-foreground-muted">{request.provider_reference || '-'}</b></span>
                      <span>Payload: <b className="text-foreground-muted">{String(request.provider_payload_hash || request.dispatch_payload_hash || '-').slice(0, 12)}</b></span>
                      <span>Response: <b className="text-foreground-muted">{String(request.provider_response_hash || request.dispatch_response_hash || '-').slice(0, 12)}</b></span>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-2xl bg-surface-subtle border border-border">
                    <p className="text-xs text-foreground-muted font-black uppercase tracking-wide">Nominal</p>
                    <p className="text-lg font-black text-foreground-muted mt-1">{formatCurrency(request.amount_idr)}</p>
                  </div>
                  <div className="p-3 rounded-2xl bg-surface-subtle border border-border">
                    <p className="text-xs text-foreground-muted font-black uppercase tracking-wide">Tujuan</p>
                    <p className="text-sm font-black text-foreground-muted mt-1">
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
                      className="px-4 py-2 rounded-xl bg-surface-subtle border border-border text-foreground-muted font-black text-xs uppercase tracking-wide hover:bg-surface-subtle disabled:opacity-60"
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
                      className="px-4 py-2 rounded-xl bg-success-surface border border-success text-success font-black text-xs uppercase tracking-wide hover:bg-success-surface disabled:opacity-60"
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
                      className="px-4 py-2 rounded-xl bg-primary text-on-primary font-black text-xs uppercase tracking-wide hover:bg-primary-light disabled:opacity-60"
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
                      className="px-4 py-2 rounded-xl bg-error-surface border border-error text-error font-black text-xs uppercase tracking-wide hover:bg-error-surface disabled:opacity-60"
                    >
                      Reject
                    </button>
                  </div>
                )}
              </div>
            ))}
            {(!payoutRequests || payoutRequests.length === 0) && (
              <div className="py-16 text-center text-foreground-muted font-bold">Belum ada pengajuan pencairan.</div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
