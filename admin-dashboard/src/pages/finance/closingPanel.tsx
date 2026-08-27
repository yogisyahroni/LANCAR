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

export function ClosingPanel({ data }: { data: FinanceData }) {
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
      {activeTab === 'closing' && (
        <div className="space-y-8 animate-in">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold text-zinc-100">Monthly Closing Workflow (Periode Akuntansi)</h2>
              <p className="text-sm text-zinc-400 mt-1">
                Kunci periode akuntansi dengan verifikasi keamanan TOTP dan unduh laporan penutupan bulanan.
              </p>
            </div>
            <button
              onClick={() => window.open('/api/v1/admin/finance/closing/export', '_blank')}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-zinc-200 font-bold text-sm transition-all"
            >
              <Download size={16} />
              Export Laporan Closing (CSV/PDF)
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="glass-card p-6 rounded-3xl border-white/5 space-y-6 lg:col-span-1">
              <div className="flex items-center gap-2 text-primary">
                <Lock size={20} />
                <h3 className="text-lg font-bold text-zinc-100">Lock Periode Akuntansi</h3>
              </div>
              <p className="text-xs text-zinc-400">
                Mengunci periode mencegah modifikasi jurnal dan transaksi mundur untuk kepatuhan audit.
              </p>

              <div className="space-y-4">
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-zinc-500 block mb-2">Pilih Bulan Periode</label>
                  <input
                    type="month"
                    value={closingPeriod}
                    onChange={(e) => setClosingPeriod(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl bg-black/30 border border-white/10 text-zinc-200 text-sm focus:outline-none focus:border-primary"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-zinc-500 block mb-2">TOTP 2FA Verification Code (Wajib)</label>
                  <input
                    type="text"
                    placeholder="Masukkan 6 digit kode TOTP"
                    value={totpInput}
                    onChange={(e) => setTotpInput(e.target.value)}
                    maxLength={6}
                    className="w-full px-4 py-2.5 rounded-xl bg-black/30 border border-white/10 text-zinc-200 text-sm font-mono tracking-widest focus:outline-none focus:border-primary"
                  />
                </div>

                <button
                  onClick={() => lockPeriodMutation.mutate({ period: closingPeriod, totpCode: totpInput })}
                  disabled={lockPeriodMutation.isPending || !closingPeriod}
                  className="w-full py-3 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/30 font-bold text-sm transition-all flex items-center justify-center gap-2"
                >
                  {lockPeriodMutation.isPending ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Lock size={16} />
                  )}
                  Lock Periode {closingPeriod} (TOTP Required)
                </button>
              </div>
            </div>

            <div className="glass-card p-6 rounded-3xl border-white/5 space-y-6 lg:col-span-2">
              <h3 className="text-lg font-bold text-zinc-100">Status Periode Akuntansi</h3>
              {isLoadingPeriods ? (
                <div className="py-12 flex justify-center">
                  <Loader2 size={28} className="text-primary animate-spin" />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-white/5 text-zinc-500 text-xs font-bold uppercase tracking-wider">
                        <th className="pb-3">Periode</th>
                        <th className="pb-3">Status</th>
                        <th className="pb-3">Locked At</th>
                        <th className="pb-3">Locked By</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 text-sm">
                      {closingPeriods.map((item: any, idx: number) => (
                        <tr key={idx} className="hover:bg-white/[0.02]">
                          <td className="py-3.5 font-bold text-zinc-200">{item.period || item.month}</td>
                          <td className="py-3.5">
                            <span className={cn(
                              "px-2.5 py-1 rounded-full text-xs font-bold uppercase",
                              item.status === 'locked' || item.is_locked
                                ? "bg-red-500/10 text-red-400 border border-red-500/20"
                                : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                            )}>
                              {item.status || (item.is_locked ? 'Locked' : 'Open')}
                            </span>
                          </td>
                          <td className="py-3.5 text-zinc-400 text-xs">{item.locked_at ? format(parseISO(item.locked_at), 'dd MMM yyyy HH:mm') : '-'}</td>
                          <td className="py-3.5 text-zinc-400 text-xs">{item.locked_by || '-'}</td>
                        </tr>
                      ))}
                      {closingPeriods.length === 0 && (
                        <tr>
                          <td colSpan={4} className="py-8 text-center text-zinc-500 text-xs">
                            Belum ada periode akuntansi yang tercatat / terkunci.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
             <div className="glass-card p-6 rounded-3xl border-white/5 space-y-4">
                <h3 className="text-lg font-bold text-zinc-100">Cash & Liability Summary</h3>
                {isLoadingCashLiability ? (
                   <div className="py-4 flex justify-center"><Loader2 size={24} className="animate-spin text-primary" /></div>
                ) : (
                   <table className="w-full text-left text-sm">
                      <thead>
                         <tr className="text-zinc-500 font-bold uppercase text-[10px] border-b border-white/5">
                            <th className="pb-2">Account</th>
                            <th className="pb-2 text-right">Debit</th>
                            <th className="pb-2 text-right">Credit</th>
                         </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                         {closingCashLiability.map((c: any, i: number) => (
                            <tr key={i}>
                               <td className="py-3 text-zinc-300 font-bold">{c.account_name}</td>
                               <td className="py-3 text-zinc-400 font-mono text-right">{formatCurrency(c.debit_idr)}</td>
                               <td className="py-3 text-zinc-400 font-mono text-right">{formatCurrency(c.credit_idr)}</td>
                            </tr>
                         ))}
                      </tbody>
                   </table>
                )}
             </div>

             <div className="glass-card p-6 rounded-3xl border-white/5 space-y-4">
                <h3 className="text-lg font-bold text-zinc-100">Tax Summary (VAT & WHT)</h3>
                {isLoadingTaxSummary ? (
                   <div className="py-4 flex justify-center"><Loader2 size={24} className="animate-spin text-primary" /></div>
                ) : (
                   <table className="w-full text-left text-sm">
                      <thead>
                         <tr className="text-zinc-500 font-bold uppercase text-[10px] border-b border-white/5">
                            <th className="pb-2">Tax Type</th>
                            <th className="pb-2 text-right">Count</th>
                            <th className="pb-2 text-right">Total Amount</th>
                         </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                         {closingTaxSummary.map((t: any, i: number) => (
                            <tr key={i}>
                               <td className="py-3 text-zinc-300 font-bold">{t.tax_type}</td>
                               <td className="py-3 text-zinc-400 font-mono text-right">{t.transaction_count}</td>
                               <td className="py-3 text-zinc-400 font-mono text-right">{formatCurrency(t.total_tax)}</td>
                            </tr>
                         ))}
                      </tbody>
                   </table>
                )}
             </div>
          </div>

          <div className="glass-card p-6 rounded-3xl border-white/5 space-y-4">
             <h3 className="text-lg font-bold text-zinc-100">Settlement Outstanding</h3>
             {isLoadingSettlementOutstanding ? (
                <div className="py-4 flex justify-center"><Loader2 size={24} className="animate-spin text-primary" /></div>
             ) : (
                <table className="w-full text-left text-sm">
                   <thead>
                      <tr className="text-zinc-500 font-bold uppercase text-[10px] border-b border-white/5">
                         <th className="pb-2">Status</th>
                         <th className="pb-2 text-right">Total Settlements</th>
                         <th className="pb-2 text-right">Total Amount (IDR)</th>
                      </tr>
                   </thead>
                   <tbody className="divide-y divide-white/5">
                      {closingSettlementOutstanding.map((s: any, i: number) => (
                         <tr key={i}>
                            <td className="py-3">
                               <span className="px-2 py-1 rounded bg-white/10 text-[10px] uppercase font-bold text-zinc-300">{s.status}</span>
                            </td>
                            <td className="py-3 text-zinc-400 font-mono text-right">{s.total_settlements}</td>
                            <td className="py-3 text-zinc-400 font-mono text-right font-bold">{formatCurrency(s.total_amount)}</td>
                         </tr>
                      ))}
                   </tbody>
                </table>
             )}
          </div>
        </div>
      )}

      {/* S3-AD-01: Secure payout confirmation modal — replaces all window.prompt() for review actions */}
      {confirmModal && (
        <ConfirmPayoutModal
          isOpen={confirmModal.isOpen}
          action={confirmModal.action}
          reviewId={confirmModal.reviewId}
          courierName={reviewRequest?.courier_name}
          amountIdr={reviewRequest?.amount}
          isPending={payoutReviewActionMutation.isPending}
          onConfirm={handleModalConfirm}
          onCancel={() => setConfirmModal(null)}
        />
      )}
    </>
  );
}
