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

export function TrialbalancePanel({ data }: { data: FinanceData }) {
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
      {activeTab === 'trial-balance' && (
        <div className="space-y-8 animate-in">
          <div className="flex items-center justify-between p-6 rounded-2xl bg-surface border border-border">
            <div>
              <h3 className="text-lg font-black text-foreground uppercase tracking-wide">Neraca Saldo (Trial Balance)</h3>
              <p className="text-sm text-foreground-muted mt-1">Laporan saldo awal, mutasi debit/kredit, dan saldo akhir per akun GL.</p>
            </div>
            <div className="flex items-center gap-4">
              <input
                type="date"
                aria-label="Trial balance start date"
                value={ledgerStartDate}
                onChange={(e) => setLedgerStartDate(e.target.value)}
                className="bg-background border border-border rounded-xl px-4 py-2.5 text-sm text-foreground font-medium focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
              />
              <span className="text-foreground-muted font-black tracking-wide uppercase">To</span>
              <input
                type="date"
                aria-label="Trial balance end date"
                value={ledgerEndDate}
                onChange={(e) => setLedgerEndDate(e.target.value)}
                className="bg-background border border-border rounded-xl px-4 py-2.5 text-sm text-foreground font-medium focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
              />
            </div>
          </div>

          <div className="glass-card rounded-[24px] border border-border overflow-hidden">
            <div className="p-6 border-b border-border flex items-center justify-between">
              <h3 className="text-sm font-black text-foreground uppercase tracking-wide">Detail Neraca Saldo</h3>
            </div>
            
            {isLoadingTrialBalance ? (
              <div className="flex items-center justify-center py-20"><Loader2 size={32} className="animate-spin text-foreground-muted" aria-hidden="true" /></div>
            ) : (
              <div role="region" aria-label="Trial balance table" tabIndex={0} className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-surface/[0.02]">
                    <tr>
                      {['Kode GL', 'Nama Akun', 'Saldo Awal', 'Total Debit', 'Total Kredit', 'Saldo Akhir'].map(h => (
                        <th scope="col" key={h} className="px-6 py-4 text-left text-xs font-black text-foreground-muted uppercase tracking-wide border-b border-border">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(trialBalanceData || []).map((row: any) => (
                      <tr key={row.gl_code} className="border-b border-border/[0.02] hover:bg-surface/[0.02] transition-colors group">
                        <td className="px-6 py-4">
                          <span className="px-2.5 py-1 rounded-md bg-surface-subtle text-xs font-mono text-foreground-muted group-hover:text-primary-light transition-colors">{row.gl_code}</span>
                        </td>
                        <td className="px-6 py-4 font-bold text-foreground-muted text-sm">{row.gl_name}</td>
                        <td className="px-6 py-4 font-medium text-foreground-muted text-sm">Rp {Number(row.opening_balance).toLocaleString('id-ID')}</td>
                        <td className="px-6 py-4 font-medium text-success text-sm">Rp {Number(row.total_debit).toLocaleString('id-ID')}</td>
                        <td className="px-6 py-4 font-medium text-error text-sm">Rp {Number(row.total_credit).toLocaleString('id-ID')}</td>
                        <td className="px-6 py-4 font-bold text-foreground text-sm bg-surface/[0.01]">Rp {Number(row.closing_balance).toLocaleString('id-ID')}</td>
                      </tr>
                    ))}
                    {(trialBalanceData || []).length === 0 && (
                      <tr>
                        <td colSpan={6} className="py-12 text-center text-foreground-muted text-sm font-medium">
                          Tidak ada data neraca saldo pada periode ini.
                        </td>
                      </tr>
                    )}
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
