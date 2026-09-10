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
import { StatusBadge } from '../../components/StatusBadge';

export function ReconciliationPanel({ data }: { data: FinanceData }) {
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
    reconciliationServiceFilter,
    setReconciliationServiceFilter,
    reconciliationProviderFilter,
    setReconciliationProviderFilter,
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
      {activeTab === 'reconciliation' && (
        <div className="space-y-8 animate-in">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold text-foreground-muted">Wallet & Ledger Reconciliation Center</h2>
              <p className="text-sm text-foreground-muted mt-1">
                Audit otomatis secara real-time saldo wallet, ledger akuntansi, dan transaksi penyelesaian.
              </p>
            </div>
            <button
              onClick={() => runReconciliationMutation.mutate()}
              disabled={runReconciliationMutation.isPending}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-on-primary font-bold text-sm shadow-lg shadow-primary/20 transition-all disabled:opacity-60"
            >
              {runReconciliationMutation.isPending ? (
                <Loader2 size={16} className="animate-spin" aria-hidden="true" />
              ) : (
                <ShieldCheck size={16} aria-hidden="true" />
              )}
              Jalankan Rekonsiliasi Sekarang
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-3 p-4 rounded-2xl bg-surface border border-border">
            <span className="text-xs font-black uppercase tracking-widest text-foreground-muted">Filter audit</span>
            <select
              value={reconciliationServiceFilter}
              onChange={(e) => setReconciliationServiceFilter(e.target.value)}
              className="bg-background border border-border rounded-xl px-3 py-2 text-sm text-foreground outline-none"
              aria-label="Filter layanan rekonsiliasi"
            >
              <option value="">Semua layanan</option>
              <option value="parcel">Paket</option>
              <option value="food_delivery">Food</option>
              <option value="tambal_ban_motor">Tambal Ban Motor</option>
              <option value="tambal_ban_mobil">Tambal Ban Mobil</option>
              <option value="towing_motor">Towing Motor</option>
              <option value="towing_mobil">Towing Mobil</option>
            </select>
            <input
              value={reconciliationProviderFilter}
              onChange={(e) => setReconciliationProviderFilter(e.target.value)}
              placeholder="Provider"
              className="bg-background border border-border rounded-xl px-3 py-2 text-sm text-foreground outline-none w-36"
              aria-label="Filter provider rekonsiliasi"
            />
            <input
              type="date"
              value={ledgerStartDate}
              onChange={(e) => setLedgerStartDate(e.target.value)}
              className="bg-background border border-border rounded-xl px-3 py-2 text-sm text-foreground outline-none"
              aria-label="Tanggal mulai rekonsiliasi"
            />
            <input
              type="date"
              value={ledgerEndDate}
              onChange={(e) => setLedgerEndDate(e.target.value)}
              className="bg-background border border-border rounded-xl px-3 py-2 text-sm text-foreground outline-none"
              aria-label="Tanggal akhir rekonsiliasi"
            />
          </div>

          <div className="glass-card p-6 rounded-3xl border-border">
            {isLoadingRecon ? (
              <div className="py-12 flex justify-center">
                <Loader2 size={32} className="text-primary animate-spin" aria-hidden="true" />
              </div>
            ) : reconciliationSummary && reconciliationSummary.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {reconciliationSummary.map((item: any, idx: number) => (
                  <div key={idx} className="p-5 rounded-2xl bg-surface/[0.03] border border-border space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black uppercase tracking-wider text-foreground-muted">
                        {item.domain || item.name || `Domain #${idx + 1}`}
                      </span>
                      <StatusBadge status={item.status || (item.mismatches === 0 ? 'balanced' : 'mismatch')} label={item.status || (item.mismatches === 0 ? 'Seimbang' : 'Ditemukan mismatch')} labelPrefix="Reconciliation status" className="text-xs uppercase" />
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="p-3 rounded-xl bg-surface-subtle">
                        <p className="text-[10px] text-foreground-muted uppercase font-bold">Matched</p>
                        <p className="text-lg font-black text-foreground-muted mt-1">{item.matched_count || item.matched || 0}</p>
                      </div>
                      <div className="p-3 rounded-xl bg-surface-subtle">
                        <p className="text-[10px] text-foreground-muted uppercase font-bold">Mismatches</p>
                        <p className="text-lg font-black text-error mt-1">{item.mismatch_count || item.mismatches || 0}</p>
                      </div>
                    </div>
                    {item.discrepancy_idr !== undefined && (
                      <div className="pt-2 border-t border-border flex justify-between text-xs">
                        <span className="text-foreground-muted">Discrepancy:</span>
                        <span className="font-bold text-foreground-muted">
                          Rp {Number(item.discrepancy_idr || 0).toLocaleString('id-ID')}
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-12 text-center text-foreground-muted text-sm">
                Belum ada riwayat rekonsiliasi. Klik tombol &quot;Jalankan Rekonsiliasi Sekarang&quot; untuk memulai audit.
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
