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

export function RekeningGridSection({ data }: { data: FinanceData }) {
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

  const burnTimeSeries = Array.isArray(financialData?.burn_time_series)
    ? financialData.burn_time_series as Array<{ date?: string; amount?: number | string }>
    : [];

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
         {/* Revenue Breakdown Donut */}
        <div className="glass-card p-10 rounded-[48px] border-border space-y-10">
           <div className="flex items-center justify-between">
              <h3 className="text-xl font-black text-foreground-muted flex items-center gap-3">
                 <PieIcon className="text-primary-light" size={24} aria-hidden="true" />
                 Model Breakdown
              </h3>
              <p className="text-xs font-black text-foreground-muted uppercase tracking-wide">Revenue Share %</p>
           </div>
           <div className="flex flex-col md:flex-row items-center gap-12">
              <div
                 className="h-[280px] w-[280px] relative min-w-0 min-h-0"
                 role="img"
                 aria-label="Revenue breakdown chart"
                 aria-describedby="finance-revenue-breakdown-summary"
              >
                 <p id="finance-revenue-breakdown-summary" className="sr-only">
                    Revenue breakdown:{' '}
                    {revenueBreakdown.length > 0
                      ? revenueBreakdown.map((item: any) => `${item.name}: ${item.percentage}%`).join('; ')
                      : 'Belum ada data.'}
                    .
                 </p>
                 <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                    <PieChart>
                       <Pie
                          data={revenueBreakdown}
                          cx="50%"
                          cy="50%"
                          innerRadius={80}
                          outerRadius={110}
                          paddingAngle={8}
                          dataKey="value"
                       >
                          {revenueBreakdown.map((_: any, index: number) => (
                             <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} stroke="none" />
                          ))}
                       </Pie>
                       <Tooltip
                          contentStyle={{
                             backgroundColor: 'var(--color-surface-raised)',
                             border: '1px solid var(--color-border)',
                             borderRadius: '12px',
                             color: 'var(--color-foreground)',
                          }}
                       />
                    </PieChart>
                 </ResponsiveContainer>
                 <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <p className="text-4xl font-black text-foreground-muted tracking-tighter">100%</p>
                    <p className="text-xs font-black text-foreground-muted uppercase tracking-wide">Gross</p>
                 </div>
              </div>
              <div className="flex-1 space-y-6 w-full">
                 {revenueBreakdown.map((item: any, i: number) => (
                   <div key={i} className="flex items-center justify-between p-4 rounded-2xl bg-surface/[0.02] border border-border">
                      <div className="flex items-center gap-3">
                         <div className="h-3 w-3 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                         <span className="text-sm font-bold text-foreground-muted">{item.name}</span>
                      </div>
                      <span className="text-sm font-black text-foreground-muted">{item.percentage}%</span>
                   </div>
                 ))}
              </div>
           </div>
        </div>

        {/* Cost Breakdown Bar Chart - Using Payout Data */}
        <div className="glass-card p-10 rounded-[48px] border-border space-y-10">
           <div className="flex items-center justify-between">
              <h3 className="text-xl font-black text-foreground-muted flex items-center gap-3">
                 <History className="text-error" size={24} aria-hidden="true" />
                 Burn Analysis
              </h3>
              <p className="text-xs font-black text-foreground-muted uppercase tracking-wide">Payout History</p>
           </div>
           <div
              className="h-[300px] w-full min-w-0 min-h-0"
              role="img"
              aria-label="Payout burn analysis chart"
              aria-describedby="finance-burn-analysis-summary"
           >
              <p id="finance-burn-analysis-summary" className="sr-only">
                 Payout burn analysis by date.{' '}
                 {burnTimeSeries.length > 0
                   ? burnTimeSeries.map((point) => `${point.date || 'Periode'}: ${formatCurrency(point.amount ?? 0)}`).join('; ')
                   : 'Belum ada data payout.'}
              </p>
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                 <BarChart data={financialData?.burn_time_series}>
                    <XAxis 
                       dataKey="date" 
                       stroke="var(--color-foreground-muted)"
                       fontSize={10} 
                       tickLine={false} 
                       axisLine={false}
                       tickFormatter={(date) => format(new Date(date), 'dd/MM')} 
                    />
                    <YAxis 
                       stroke="var(--color-foreground-muted)"
                       fontSize={10} 
                       tickLine={false} 
                       axisLine={false}
                       tickFormatter={(value) => `Rp${(value/1000).toFixed(0)}k`} 
                    />
                    <Tooltip 
                       cursor={{ fill: 'var(--color-surface-subtle)' }}
                       contentStyle={{ backgroundColor: 'var(--color-surface-raised)', borderColor: 'var(--color-border)', borderRadius: '16px', color: 'var(--color-foreground)' }}
                       labelFormatter={(label) => format(new Date(label), 'dd MMM yyyy')}
                       formatter={(value: any) => [`Rp ${value.toLocaleString()}`, 'Payout Amount']}
                    />
                    <Bar dataKey="amount" fill="var(--color-error)" radius={[8, 8, 0, 0]} barSize={24} />
                 </BarChart>
              </ResponsiveContainer>
           </div>
        </div>
      </div>
    </>
  );
}
