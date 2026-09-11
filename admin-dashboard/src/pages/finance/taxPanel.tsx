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

export function TaxPanel({ data }: { data: FinanceData }) {
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
      {activeTab === 'tax' && (
        <div className="space-y-8">

          {/* PPN Dashboard */}
          {isLoadingTax ? (
            <div className="flex items-center justify-center py-20"><Loader2 size={32} className="animate-spin text-foreground-muted" aria-hidden="true" /></div>
          ) : taxDashboard && (
            <>
              {/* Deadline Alert */}
              <div className={cn(
                'flex items-center gap-4 p-5 rounded-2xl border',
                taxDashboard.days_until_deadline <= 5
                  ? 'bg-error-surface border-error text-error'
                  : taxDashboard.days_until_deadline <= 10
                  ? 'bg-warning-surface border-warning text-warning'
                  : 'bg-success-surface border-success text-success'
              )}>
                <AlertCircle size={20} aria-hidden="true" />
                <div className="flex-1">
                  <p className="font-black text-sm uppercase tracking-wide">
                    Deadline Lapor SPT Masa PPN: {taxDashboard.deadline_date}
                  </p>
                  <p className="text-xs opacity-70 mt-0.5">
                    {taxDashboard.days_until_deadline > 0
                      ? `${taxDashboard.days_until_deadline} hari lagi — pastikan PPN masa ${taxDashboard.current_masa} sudah dilaporkan ke DJP`
                      : 'Deadline telah lewat!'}
                  </p>
                </div>
              </div>

              {/* PPN Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                  { label: `PPN Masa ${taxDashboard.current_masa}`, value: taxDashboard.ppn_current_masa, color: 'text-warning', desc: 'Harus disetor ke DJP' },
                  { label: 'Gross Revenue Masa Ini', value: taxDashboard.gross_revenue_current_masa, color: 'text-success', desc: 'Dasar pengenaan pajak' },
                  { label: 'Jumlah Transaksi', value: null, rawLabel: taxDashboard.transaction_count_current_masa?.toLocaleString('id-ID'), color: 'text-info', desc: 'Transaksi kena PPN' },
                ].map((item) => (
                  <div key={item.label} className="glass-card p-6 rounded-[28px] border-border space-y-2">
                    <p className="text-xs font-black text-foreground-muted uppercase tracking-wide">{item.label}</p>
                    <p className={`text-3xl font-black ${item.color} tracking-tight`}>
                      {item.rawLabel ?? `Rp ${Number(item.value || 0).toLocaleString('id-ID')}`}
                    </p>
                    <p className="text-xs text-foreground-muted">{item.desc}</p>
                  </div>
                ))}
              </div>

              {/* PPN Masa History Table */}
              <div className="glass-card p-8 rounded-[36px] border-border space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-black text-foreground-muted italic uppercase">Riwayat Masa PPN (12 Bulan)</h3>
                  <div className="flex gap-2">
                    <button
                      onClick={handleExportEfaktur}
                      className="px-4 py-2 rounded-xl bg-primary hover:bg-primary-light text-on-primary font-black text-xs uppercase tracking-wide transition-all flex items-center gap-2"
                    >
                      <Download size={12} aria-hidden="true" />Export e-Faktur
                    </button>
                    <button
                      onClick={async () => {
                        try {
                          const res = await api.get('/admin/finance/masa-report/export', { responseType: 'blob' })
                          const url = URL.createObjectURL(res.data)
                          const a = document.createElement('a')
                          a.href = url
                          a.download = `ppn_masa_report_${new Date().toISOString().split('T')[0]}.csv`
                          a.click()
                          URL.revokeObjectURL(url)
                        } catch { toast.error('Export gagal') }
                      }}
                      className="px-4 py-2 rounded-xl bg-surface-subtle border border-border text-foreground-muted font-black text-xs uppercase tracking-wide hover:bg-surface-subtle transition-all flex items-center gap-2"
                    >
                      <Download size={12} aria-hidden="true" />Export Laporan PPN
                    </button>
                  </div>
                </div>
                <div role="region" aria-label="Tax compliance summary table" tabIndex={0} className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      {['Masa', 'Transaksi', 'Gross Revenue', 'PPN Dipungut', 'Status'].map(h => (
                        <th scope="col" key={h} className="pb-4 text-left text-xs font-black text-foreground-muted uppercase tracking-wide">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {taxDashboard.masa_history.map((row: any) => (
                      <tr key={row.masa} className="border-b border-border/[0.03] hover:bg-surface/[0.02] transition-colors">
                        <td className="py-4 font-black text-foreground-muted">{row.masa}</td>
                        <td className="py-4 text-foreground-muted">{row.transaction_count.toLocaleString()}</td>
                        <td className="py-4 font-bold text-foreground-muted">Rp {Number(row.gross_revenue).toLocaleString('id-ID')}</td>
                        <td className="py-4 font-black text-warning">Rp {Number(row.ppn_collected).toLocaleString('id-ID')}</td>
                        <td className="py-4">
                          <StatusBadge status={row.status || 'draft'} label={row.status === 'submitted' ? 'Dilaporkan' : 'Draft'} labelPrefix="Tax report status" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </div>
            </>
          )}

          {/* PPh Report Section */}
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-black text-foreground-muted italic uppercase">PPh Kurir (Pasal 21/23)</h3>
                <p className="text-foreground-muted text-xs mt-1">Estimasi pajak penghasilan mitra kurir yang melebihi PTKP TK/0 (Rp 50jt/tahun)</p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleExportPPh23}
                  className="px-4 py-2 rounded-xl bg-primary hover:bg-primary-light text-on-primary font-black text-xs uppercase tracking-wide transition-all flex items-center gap-2"
                >
                  <Download size={12} aria-hidden="true" />Export PPh 23
                </button>
                <label className="text-xs font-bold text-foreground-muted tracking-wide">Periode:</label>
                <input
                  type="month"
                  aria-label="Periode"
                  value={pphPeriod}
                  onChange={(e) => setPphPeriod(e.target.value)}
                  className="px-4 py-2 rounded-xl bg-surface/[0.04] border border-border text-foreground-muted text-sm font-bold focus:outline-none focus:border-primary"
                />
              </div>
            </div>

            {isLoadingPph ? (
              <div className="flex items-center justify-center py-10"><Loader2 size={24} className="animate-spin text-foreground-muted" aria-hidden="true" /></div>
            ) : pphReport && (
              <>
                {/* PPh Summary */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { label: 'Total Kurir Dibayar', value: null, rawLabel: pphReport.summary.total_couriers_paid?.toLocaleString(), color: 'text-info' },
                    { label: 'Total Payout', value: pphReport.summary.total_payout_amount, color: 'text-success' },
                    { label: 'Kurir Kena PPh', value: null, rawLabel: pphReport.summary.couriers_subject_to_pph?.toString(), color: 'text-accent' },
                    { label: 'Est. PPh 21 Total', value: pphReport.summary.estimated_pph21_total, color: 'text-error' },
                  ].map((item) => (
                    <div key={item.label} className="glass-card p-5 rounded-[24px] border-border space-y-2">
                      <p className="text-xs font-black text-foreground-muted uppercase tracking-wide">{item.label}</p>
                      <p className={`text-xl font-black ${item.color}`}>
                        {item.rawLabel ?? `Rp ${Number(item.value || 0).toLocaleString('id-ID')}`}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="glass-card p-8 rounded-[36px] border-border space-y-4">
                  <div className="flex items-center gap-3">
                    <h4 className="text-base font-black text-foreground-muted uppercase italic">Detail Kurir</h4>
                    <span className="px-2 py-0.5 rounded-full bg-accent-surface text-accent text-xs font-black uppercase tracking-wide">
                      {pphReport.couriers.filter((c: any) => c.subject_to_pph).length} kena PPh
                    </span>
                  </div>
                  <div role="region" aria-label="Courier income tax detail table" tabIndex={0} className="max-h-80 overflow-auto">
                    <table className="w-full text-sm min-w-[600px]">
                      <thead>
                        <tr className="border-b border-border">
                          {['Kurir', 'Total Payout', 'Jml Payout', 'Est. PPh 21', 'Status'].map(h => (
                            <th scope="col" key={h} className="pb-3 text-left text-xs font-black text-foreground-muted uppercase tracking-wide">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {pphReport.couriers.map((c: any) => (
                          <tr key={c.courier_id} className="border-b border-border/[0.03] hover:bg-surface/[0.02] transition-colors">
                            <td className="py-3">
                              <div>
                                <p className="font-bold text-foreground-muted text-sm">{c.courier_name}</p>
                                <p className="text-xs text-foreground-muted">{c.phone}</p>
                              </div>
                            </td>
                            <td className="py-3 font-bold text-foreground-muted">Rp {Number(c.total_earned).toLocaleString('id-ID')}</td>
                            <td className="py-3 text-foreground-muted">{c.payout_count}</td>
                            <td className="py-3">
                              {c.subject_to_pph ? (
                                <span className="font-black text-error">Rp {Number(c.estimated_pph21).toLocaleString('id-ID')}</span>
                              ) : (
                                <span className="text-foreground-muted italic">Di bawah PTKP</span>
                              )}
                            </td>
                            <td className="py-3">
                              <span className={cn(
                                'px-2.5 py-1 rounded-full text-xs font-black uppercase tracking-wide',
                                c.subject_to_pph ? 'bg-error-surface text-error' : 'bg-success-surface text-success'
                              )}>
                                {c.subject_to_pph ? 'Kena PPh' : 'Bebas Pajak'}
                              </span>
                            </td>
                          </tr>
                        ))}
                        {pphReport.couriers.length === 0 && (
                          <tr><td colSpan={5} className="py-10 text-center text-foreground-muted italic">Tidak ada data untuk periode ini</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>

        </div>
      )}
    </>
  );
}
