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

export function LedgerPanel({ data }: { data: FinanceData }) {
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
      {activeTab === 'ledger' && (
        <div className="space-y-8 animate-in">
          <div className="flex flex-col md:flex-row md:items-center justify-between p-6 rounded-2xl bg-surface border border-border gap-4">
            <div>
              <h3 className="text-lg font-black text-foreground uppercase tracking-wide">Buku Besar (Ledger)</h3>
              <p className="text-sm text-foreground-muted mt-1">Daftar entri jurnal berdasarkan waktu riil.</p>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <input
                type="text"
                placeholder="Filter Akun GL"
                value={ledgerAccountFilter}
                onChange={(e) => setLedgerAccountFilter(e.target.value)}
                className="bg-background border border-border rounded-xl px-4 py-2.5 text-sm text-foreground font-medium focus:ring-2 focus:ring-primary focus:border-transparent outline-none w-40"
              />
              <select
                value={ledgerJournalTypeFilter}
                onChange={(e) => setLedgerJournalTypeFilter(e.target.value)}
                className="bg-background border border-border rounded-xl px-4 py-2.5 text-sm text-foreground font-medium focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
              >
                <option value="">Semua Journal Type</option>
                <option value="payment">Payment</option>
                <option value="refund">Refund</option>
                <option value="wallet_topup">Wallet Topup</option>
                <option value="wallet_withdraw">Wallet Withdraw</option>
                <option value="courier_payout">Courier Payout</option>
                <option value="merchant_settlement">Merchant Settlement</option>
                <option value="provider_invoice">Provider Invoice</option>
              </select>
              <input
                type="date"
                value={ledgerStartDate}
                onChange={(e) => setLedgerStartDate(e.target.value)}
                className="bg-background border border-border rounded-xl px-4 py-2.5 text-sm text-foreground font-medium focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
              />
              <span className="text-foreground-muted font-black tracking-wide uppercase">To</span>
              <input
                type="date"
                value={ledgerEndDate}
                onChange={(e) => setLedgerEndDate(e.target.value)}
                className="bg-background border border-border rounded-xl px-4 py-2.5 text-sm text-foreground font-medium focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
              />
            </div>
          </div>

          <div className="glass-card rounded-[24px] border border-border overflow-hidden">
            <div className="p-6 border-b border-border flex items-center justify-between">
              <h3 className="text-sm font-black text-foreground uppercase tracking-wide">Detail Journal Entries</h3>
            </div>
            
            {isLoadingLedgerEntries ? (
              <div className="flex items-center justify-center py-20"><Loader2 size={32} className="animate-spin text-foreground-muted" aria-hidden="true" /></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-surface/[0.02]">
                    <tr>
                      {['Tanggal', 'Journal ID', 'Tipe Journal', 'Akun', 'Debit', 'Kredit', 'Keterangan'].map(h => (
                        <th scope="col" key={h} className="px-6 py-4 text-left text-xs font-black text-foreground-muted uppercase tracking-wide border-b border-border">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(ledgerEntriesData || []).map((row: any) => (
                      <tr key={row.entry_id} className="border-b border-border/[0.02] hover:bg-surface/[0.02] transition-colors group">
                        <td className="px-6 py-4 font-medium text-foreground-muted text-xs whitespace-nowrap">
                          {new Date(row.created_at).toLocaleString('id-ID')}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col">
                            <span className="px-2 py-0.5 rounded-md bg-surface-subtle text-xs font-mono text-foreground-muted w-max">{row.journal_id?.substring(0,8)}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="px-2 py-1 rounded bg-surface-raised text-xs text-foreground-muted font-bold uppercase">{row.journal_type}</span>
                        </td>
                        <td className="px-6 py-4 font-bold text-foreground-muted text-sm">{row.account_name}</td>
                        <td className="px-6 py-4 font-medium text-success text-sm">{row.debit_idr ? `Rp ${Number(row.debit_idr).toLocaleString('id-ID')}` : '-'}</td>
                        <td className="px-6 py-4 font-medium text-error text-sm">{row.credit_idr ? `Rp ${Number(row.credit_idr).toLocaleString('id-ID')}` : '-'}</td>
                        <td className="px-6 py-4 text-foreground-muted text-xs">{row.reason}</td>
                      </tr>
                    ))}
                    {(ledgerEntriesData || []).length === 0 && (
                      <tr>
                        <td colSpan={7} className="py-12 text-center text-foreground-muted text-sm font-medium">
                          Tidak ada data journal entry pada periode dan filter ini.
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
