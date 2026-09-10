import { DollarSign, TrendingUp, TrendingDown, PieChart as PieIcon, CreditCard, History, ArrowUpRight, ArrowDownRight, ShieldAlert, Download, CloudRain, ChevronRight, Loader2, Landmark, Ban, ShieldCheck, FileSearch, Smartphone, AlertTriangle, Wallet, Users, BarChart2, FileText, Receipt, Calendar, ArrowRight, TrendingDown as TrendDown, Lock } from 'lucide-react';
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

const getPayoutStatusPresentation = (status?: string) => {
  const normalized = (status || '').toLowerCase();
  if (['completed', 'paid', 'success'].includes(normalized)) {
    return { status: 'success', label: 'Berhasil', className: 'bg-success-surface border-success' };
  }
  if (['failed', 'rejected', 'cancelled'].includes(normalized)) {
    return { status: normalized === 'cancelled' ? 'cancelled' : 'failed', label: normalized === 'cancelled' ? 'Dibatalkan' : 'Gagal', className: 'bg-error-surface border-error' };
  }
  if (['pending', 'processing', 'requested'].includes(normalized)) {
    return { status: normalized, label: normalized === 'processing' ? 'Diproses' : 'Menunggu', className: 'bg-warning-surface border-warning' };
  }
  return { status: status || 'unknown', label: status || 'Status belum tersedia', className: 'bg-surface-subtle border-border' };
};

function PayoutStatusBadge({ status }: { status?: string }) {
  const presentation = getPayoutStatusPresentation(status);
  return (
    <StatusBadge status={presentation.status} labelPrefix="Payout status" label={presentation.label} className={presentation.className} />
  );
}

export function PayoutGatewaySection({ data }: { data: FinanceData }) {
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
      <div className="glass-card p-10 rounded-[48px] border-border space-y-10">
         <div className="flex items-center justify-between">
            <h3 className="text-2xl font-black text-foreground-muted italic uppercase flex items-center gap-4">
               <CreditCard className="text-primary-light" size={28} aria-hidden="true" />
               Payout Gateway
            </h3>
            <button 
              onClick={() => {
                if (confirm('Are you sure you want to release ALL pending payouts?')) {
                  batchReleaseMutation.mutate();
                }
              }}
              disabled={batchReleaseMutation.isPending}
              className="flex items-center gap-2 text-xs font-black text-primary-light uppercase tracking-wide hover:text-primary transition-all disabled:opacity-60"
            >
               {batchReleaseMutation.isPending ? 'Processing Batch...' : 'Batch Trigger All'}
               <ChevronRight size={14} aria-hidden="true" />
            </button>
         </div>
         <div className="overflow-x-auto">
            <table className="w-full text-left" aria-label="Payout gateway queue">
               <caption className="sr-only">Payout gateway queue with courier, amount, status and available actions</caption>
               <thead>
                  <tr className="border-b border-border">
                    {['Payout ID', 'Courier Partner', 'Created', 'Amount', 'Status', 'Actions'].map(h => (
                       <th key={h} scope="col" className="pb-6 text-xs font-black text-foreground-muted uppercase tracking-wide">{h}</th>
                     ))}
                  </tr>
               </thead>
               <tbody className="divide-y divide-border">
                  {payouts?.map((set: any) => (
                    <tr key={set.id} className="group hover:bg-surface/[0.01] transition-all">
                       <td className="py-8 font-mono text-xs text-foreground-muted uppercase">{set.id.split('-')[0]}...</td>
                       <td className="py-8">
                          <div className="flex items-center gap-3">
                             <div className="h-8 w-8 rounded-lg bg-surface border border-border flex items-center justify-center font-bold text-xs text-foreground-muted">
                                {set.courier_name.charAt(0)}
                             </div>
                             <div className="flex flex-col">
                                <span className="font-bold text-foreground-muted">{set.courier_name}</span>
                                <span className="text-xs text-foreground-muted">{set.courier_phone}</span>
                             </div>
                          </div>
                       </td>
                       <td className="py-8 text-xs font-bold text-foreground-muted">
                          {format(new Date(set.created_at), 'dd MMM yyyy HH:mm')}
                       </td>
                       <td className="py-8 text-sm font-black text-foreground-muted">
                          Rp {parseInt(set.net_idr).toLocaleString()}
                       </td>
                       <td className="py-8">
                          <PayoutStatusBadge status={set.disbursement_status} />
                       </td>
                       <td className="py-8">
                          {set.disbursement_status === 'pending' && (
                            <button 
                              onClick={() => releaseMutation.mutate(set.id)}
                              disabled={releaseMutation.isPending}
                              className="px-4 py-2 rounded-xl bg-primary text-on-primary font-black text-xs uppercase tracking-wide hover:bg-primary-light transition-all shadow-lg shadow-primary/10 disabled:opacity-60"
                            >
                               {releaseMutation.isPending ? 'Processing...' : 'Release'}
                            </button>
                          )}
                       </td>
                    </tr>
                  ))}
                  {(!payouts || payouts.length === 0) && (
                    <tr>
                      <td colSpan={6} className="py-20 text-center text-foreground-muted font-bold italic uppercase tracking-wide">
                        No pending payouts found
                      </td>
                    </tr>
                  )}
               </tbody>
            </table>
         </div>
      </div>
    </>
  );
}
