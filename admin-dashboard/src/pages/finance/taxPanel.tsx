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
            <div className="flex items-center justify-center py-20"><Loader2 size={32} className="animate-spin text-zinc-600" /></div>
          ) : taxDashboard && (
            <>
              {/* Deadline Alert */}
              <div className={cn(
                'flex items-center gap-4 p-5 rounded-2xl border',
                taxDashboard.days_until_deadline <= 5
                  ? 'bg-red-500/10 border-red-500/30 text-red-300'
                  : taxDashboard.days_until_deadline <= 10
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                  : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              )}>
                <AlertCircle size={20} />
                <div className="flex-1">
                  <p className="font-black text-sm uppercase tracking-widest">
                    Deadline Lapor SPT Masa PPN: {taxDashboard.deadline_date}
                  </p>
                  <p className="text-[11px] opacity-70 mt-0.5">
                    {taxDashboard.days_until_deadline > 0
                      ? `${taxDashboard.days_until_deadline} hari lagi — pastikan PPN masa ${taxDashboard.current_masa} sudah dilaporkan ke DJP`
                      : 'Deadline telah lewat!'}
                  </p>
                </div>
              </div>

              {/* PPN Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                  { label: `PPN Masa ${taxDashboard.current_masa}`, value: taxDashboard.ppn_current_masa, color: 'text-amber-400', desc: 'Harus disetor ke DJP' },
                  { label: 'Gross Revenue Masa Ini', value: taxDashboard.gross_revenue_current_masa, color: 'text-emerald-400', desc: 'Dasar pengenaan pajak' },
                  { label: 'Jumlah Transaksi', value: null, rawLabel: taxDashboard.transaction_count_current_masa?.toLocaleString('id-ID'), color: 'text-blue-400', desc: 'Transaksi kena PPN' },
                ].map((item) => (
                  <div key={item.label} className="glass-card p-6 rounded-[28px] border-white/5 space-y-2">
                    <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">{item.label}</p>
                    <p className={`text-3xl font-black ${item.color} tracking-tight`}>
                      {item.rawLabel ?? `Rp ${Number(item.value || 0).toLocaleString('id-ID')}`}
                    </p>
                    <p className="text-[10px] text-zinc-600">{item.desc}</p>
                  </div>
                ))}
              </div>

              {/* PPN Masa History Table */}
              <div className="glass-card p-8 rounded-[36px] border-white/5 space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-black text-zinc-100 italic uppercase">Riwayat Masa PPN (12 Bulan)</h3>
                  <div className="flex gap-2">
                    <button
                      onClick={handleExportEfaktur}
                      className="px-4 py-2 rounded-xl bg-primary hover:bg-primary-light text-white font-black text-[10px] uppercase tracking-widest transition-all flex items-center gap-2"
                    >
                      <Download size={12} />Export e-Faktur
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
                      className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-zinc-300 font-black text-[10px] uppercase tracking-widest hover:bg-white/10 transition-all flex items-center gap-2"
                    >
                      <Download size={12} />Export Laporan PPN
                    </button>
                  </div>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/5">
                      {['Masa', 'Transaksi', 'Gross Revenue', 'PPN Dipungut', 'Status'].map(h => (
                        <th key={h} className="pb-4 text-left text-[10px] font-black text-zinc-600 uppercase tracking-widest">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {taxDashboard.masa_history.map((row: any) => (
                      <tr key={row.masa} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                        <td className="py-4 font-black text-zinc-100">{row.masa}</td>
                        <td className="py-4 text-zinc-400">{row.transaction_count.toLocaleString()}</td>
                        <td className="py-4 font-bold text-zinc-300">Rp {Number(row.gross_revenue).toLocaleString('id-ID')}</td>
                        <td className="py-4 font-black text-amber-400">Rp {Number(row.ppn_collected).toLocaleString('id-ID')}</td>
                        <td className="py-4">
                          <span className={cn(
                            'px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest',
                            row.status === 'submitted' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'
                          )}>
                            {row.status === 'submitted' ? '✓ Dilaporkan' : 'Draft'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* PPh Report Section */}
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-black text-zinc-100 italic uppercase">PPh Kurir (Pasal 21/23)</h3>
                <p className="text-zinc-500 text-xs mt-1">Estimasi pajak penghasilan mitra kurir yang melebihi PTKP TK/0 (Rp 50jt/tahun)</p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleExportPPh23}
                  className="px-4 py-2 rounded-xl bg-primary hover:bg-primary-light text-white font-black text-[10px] uppercase tracking-widest transition-all flex items-center gap-2"
                >
                  <Download size={12} />Export PPh 23
                </button>
                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Periode:</label>
                <input
                  type="month"
                  value={pphPeriod}
                  onChange={(e) => setPphPeriod(e.target.value)}
                  className="px-4 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-zinc-100 text-sm font-bold focus:outline-none focus:border-primary"
                />
              </div>
            </div>

            {isLoadingPph ? (
              <div className="flex items-center justify-center py-10"><Loader2 size={24} className="animate-spin text-zinc-600" /></div>
            ) : pphReport && (
              <>
                {/* PPh Summary */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { label: 'Total Kurir Dibayar', value: null, rawLabel: pphReport.summary.total_couriers_paid?.toLocaleString(), color: 'text-blue-400' },
                    { label: 'Total Payout', value: pphReport.summary.total_payout_amount, color: 'text-emerald-400' },
                    { label: 'Kurir Kena PPh', value: null, rawLabel: pphReport.summary.couriers_subject_to_pph?.toString(), color: 'text-orange-400' },
                    { label: 'Est. PPh 21 Total', value: pphReport.summary.estimated_pph21_total, color: 'text-red-400' },
                  ].map((item) => (
                    <div key={item.label} className="glass-card p-5 rounded-[24px] border-white/5 space-y-2">
                      <p className="text-[9px] font-black text-zinc-600 uppercase tracking-widest">{item.label}</p>
                      <p className={`text-xl font-black ${item.color}`}>
                        {item.rawLabel ?? `Rp ${Number(item.value || 0).toLocaleString('id-ID')}`}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="glass-card p-8 rounded-[36px] border-white/5 space-y-4">
                  <div className="flex items-center gap-3">
                    <h4 className="text-base font-black text-zinc-100 uppercase italic">Detail Kurir</h4>
                    <span className="px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-400 text-[10px] font-black uppercase tracking-widest">
                      {pphReport.couriers.filter((c: any) => c.subject_to_pph).length} kena PPh
                    </span>
                  </div>
                  <div className="overflow-auto max-h-80">
                    <table className="w-full text-sm min-w-[600px]">
                      <thead>
                        <tr className="border-b border-white/5">
                          {['Kurir', 'Total Payout', 'Jml Payout', 'Est. PPh 21', 'Status'].map(h => (
                            <th key={h} className="pb-3 text-left text-[10px] font-black text-zinc-600 uppercase tracking-widest">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {pphReport.couriers.map((c: any) => (
                          <tr key={c.courier_id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                            <td className="py-3">
                              <div>
                                <p className="font-bold text-zinc-200 text-sm">{c.courier_name}</p>
                                <p className="text-[10px] text-zinc-600">{c.phone}</p>
                              </div>
                            </td>
                            <td className="py-3 font-bold text-zinc-300">Rp {Number(c.total_earned).toLocaleString('id-ID')}</td>
                            <td className="py-3 text-zinc-400">{c.payout_count}</td>
                            <td className="py-3">
                              {c.subject_to_pph ? (
                                <span className="font-black text-red-400">Rp {Number(c.estimated_pph21).toLocaleString('id-ID')}</span>
                              ) : (
                                <span className="text-zinc-600 italic">Di bawah PTKP</span>
                              )}
                            </td>
                            <td className="py-3">
                              <span className={cn(
                                'px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest',
                                c.subject_to_pph ? 'bg-red-500/10 text-red-400' : 'bg-emerald-500/10 text-emerald-400'
                              )}>
                                {c.subject_to_pph ? 'Kena PPh' : 'Bebas Pajak'}
                              </span>
                            </td>
                          </tr>
                        ))}
                        {pphReport.couriers.length === 0 && (
                          <tr><td colSpan={5} className="py-10 text-center text-zinc-600 italic">Tidak ada data untuk periode ini</td></tr>
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
