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
          <div className="glass-card p-10 rounded-[48px] border-white/5 space-y-8">
            <h3 className="text-2xl font-black text-zinc-100 italic uppercase">Unit Economics</h3>
            <p className="text-zinc-400">Analisis metrik per transaksi (Margin, subsidi, promo) secara real-time.</p>
            {isLoadingUnitEconomics ? (
              <div className="py-12 flex justify-center"><Loader2 className="w-12 h-12 text-primary animate-spin" /></div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                 {unitEconomicsData?.metrics?.map((item: any, i: number) => (
                   <div key={i} className="flex flex-col p-6 rounded-3xl bg-white/[0.02] border border-white/5">
                      <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">{item.label}</p>
                      <p className="text-2xl font-black text-zinc-100 mt-2">{formatCurrency(item.value)}</p>
                      <span className={cn(
                        "mt-4 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest w-fit",
                        item.status === 'Healthy' ? "text-emerald-400 bg-emerald-500/10" : "text-amber-400 bg-amber-500/10"
                      )}>
                         {item.status}
                      </span>
                   </div>
                 ))}
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
          <div className="glass-card p-10 rounded-[48px] border-white/5 space-y-8">
            <h3 className="text-2xl font-black text-zinc-100 italic uppercase">Neraca Saldo (Trial Balance)</h3>
            <div className="flex gap-4 mb-4">
              <input type="date" value={ledgerStartDate} onChange={e => setLedgerStartDate(e.target.value)} className="px-4 py-2 bg-black/30 text-white rounded-xl" />
              <input type="date" value={ledgerEndDate} onChange={e => setLedgerEndDate(e.target.value)} className="px-4 py-2 bg-black/30 text-white rounded-xl" />
            </div>
            {isLoadingTrialBalance ? (
              <div className="py-12 flex justify-center"><Loader2 className="w-12 h-12 text-primary animate-spin" /></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-white/5 text-zinc-500 text-xs font-bold uppercase tracking-wider">
                      <th className="pb-3">No. Akun / Nama</th>
                      <th className="pb-3 text-right">Debit (Rp)</th>
                      <th className="pb-3 text-right">Kredit (Rp)</th>
                      <th className="pb-3 text-right">Saldo (Rp)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {trialBalanceData.map((row: any, i: number) => (
                      <tr key={i} className="hover:bg-white/[0.02]">
                        <td className="py-4 text-sm font-bold text-zinc-200">{row.account_name}</td>
                        <td className="py-4 text-sm font-mono text-zinc-400 text-right">{formatCurrency(row.debit_idr)}</td>
                        <td className="py-4 text-sm font-mono text-zinc-400 text-right">{formatCurrency(row.credit_idr)}</td>
                        <td className="py-4 text-sm font-mono font-bold text-zinc-100 text-right">{formatCurrency(row.balance_idr)}</td>
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
