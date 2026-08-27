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

export function ServiceSettlementSection({ data }: { data: FinanceData }) {
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
        <div className="p-8 border-b border-white/5 flex flex-col xl:flex-row xl:items-center justify-between gap-6">
          <div>
            <h3 className="text-2xl font-black text-zinc-100 italic uppercase flex items-center gap-3">
              <Receipt className="text-emerald-400" size={26} />
              Service Settlement Snapshot
            </h3>
            <p className="text-sm text-zinc-500 mt-1">Gross, fee platform, earning kurir, settlement merchant, adjustment, refund, dan cancel fee 30 hari terakhir.</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 min-w-0 xl:min-w-[720px]">
            {[
              { label: 'Gross', value: serviceSettlementTotals.gross_idr, color: 'text-emerald-400' },
              { label: 'Platform Fee', value: serviceSettlementTotals.platform_fee_idr, color: 'text-primary-light' },
              { label: 'Courier Earning', value: serviceSettlementTotals.courier_earning_idr, color: 'text-blue-300' },
              { label: 'Merchant Settle', value: serviceSettlementTotals.merchant_settlement_idr, color: 'text-amber-300' },
              { label: 'Adjustment', value: serviceSettlementTotals.adjustment_idr, color: 'text-violet-300' },
              { label: 'Refund', value: serviceSettlementTotals.refund_idr, color: 'text-red-300' },
              { label: 'Cancel Fee', value: serviceSettlementTotals.cancel_fee_idr, color: 'text-orange-300' },
              { label: 'Net', value: serviceSettlementTotals.net_after_settlement_idr, color: 'text-zinc-100' },
            ].map((item) => (
              <div key={item.label} className="rounded-2xl bg-white/[0.03] border border-white/5 p-4">
                <p className="text-[9px] font-black uppercase tracking-widest text-zinc-600">{item.label}</p>
                <p className={cn("mt-2 text-sm font-black leading-tight", item.color)}>{formatCurrency(item.value || 0)}</p>
              </div>
            ))}
          </div>
        </div>

        {isLoadingServiceSettlement ? (
          <div className="py-16 flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
            <p className="text-xs font-black text-zinc-500 uppercase tracking-widest">Menghitung settlement snapshot...</p>
          </div>
        ) : serviceSettlementRows.length === 0 ? (
          <div className="py-16 text-center">
            <Receipt className="mx-auto text-zinc-700" size={42} />
            <p className="mt-4 text-sm font-black text-zinc-500 uppercase tracking-widest">Belum ada order delivered/completed 30 hari terakhir.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-white/5 text-zinc-600 text-[10px] font-black uppercase tracking-[0.2em]">
                  <th className="px-8 py-4">Service</th>
                  <th className="px-6 py-4 text-right">Gross</th>
                  <th className="px-6 py-4 text-right">Platform Fee</th>
                  <th className="px-6 py-4 text-right">Courier</th>
                  <th className="px-6 py-4 text-right">Merchant</th>
                  <th className="px-6 py-4 text-right">Refund</th>
                  <th className="px-6 py-4 text-right">Cancel Fee</th>
                  <th className="px-8 py-4 text-right">Net</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {serviceSettlementRows.map((row: any) => (
                  <tr key={row.service_bucket} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-8 py-5">
                      <p className="text-sm font-black text-zinc-100">{serviceLabel(row.service_bucket)}</p>
                      <p className="mt-1 text-[10px] font-black uppercase tracking-widest text-zinc-600">
                        {row.delivered_orders || 0} delivered
                        {row.open_settlement_count ? ` • ${row.open_settlement_count} open settlement` : ''}
                      </p>
                    </td>
                    <td className="px-6 py-5 text-right text-sm font-black text-emerald-300">{formatCurrency(row.gross_idr)}</td>
                    <td className="px-6 py-5 text-right text-sm font-black text-primary-light">{formatCurrency(row.platform_fee_idr)}</td>
                    <td className="px-6 py-5 text-right text-sm font-black text-blue-300">{formatCurrency(row.courier_earning_idr)}</td>
                    <td className="px-6 py-5 text-right text-sm font-black text-amber-300">{formatCurrency(row.merchant_settlement_idr)}</td>
                    <td className="px-6 py-5 text-right text-sm font-black text-red-300">
                      {formatCurrency(row.refund_idr)}
                      {row.refund_count ? <span className="block text-[10px] text-zinc-600">{row.refund_count} refund</span> : null}
                    </td>
                    <td className="px-6 py-5 text-right text-sm font-black text-orange-300">
                      {formatCurrency(row.cancel_fee_idr)}
                      {row.cancel_fee_count ? <span className="block text-[10px] text-zinc-600">{row.cancel_fee_count} fee</span> : null}
                    </td>
                    <td className="px-8 py-5 text-right text-sm font-black text-zinc-100">{formatCurrency(row.net_after_settlement_idr)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}