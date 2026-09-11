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

export function PnlPanel({ data }: { data: FinanceData }) {
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
      {activeTab === 'pnl' && (
        <div className="space-y-8">
          {/* Period Picker */}
          <div className="flex items-center gap-4">
            <label className="text-xs font-bold text-foreground-muted tracking-wide">Periode:</label>
            <input
              type="month"
              aria-label="Periode"
              value={pnlPeriod}
              onChange={(e) => setPnlPeriod(e.target.value)}
              className="px-4 py-2 rounded-xl bg-surface/[0.04] border border-border text-foreground-muted text-sm font-bold focus:outline-none focus:border-primary"
            />
            {isLoadingPnl && <Loader2 size={16} className="animate-spin text-foreground-muted" aria-hidden="true" />}
          </div>

          {pnlReport && (
            <div className="space-y-6">
              {/* Architecture Simulator Configuration */}
              <div className="glass-card p-6 rounded-[28px] border-border space-y-4">
                <div className="flex items-center gap-3">
                  <BarChart2 className="text-primary-light" size={20} aria-hidden="true" />
                  <h3 className="text-lg font-black text-foreground-muted uppercase italic">Simulator Struktur Biaya / Transaksi</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-foreground-muted tracking-wide">Modal Infra (Rp/Trx)</label>
                    <input 
                      type="number" 
                      aria-label="Modal Infra (Rp/Trx)"
                      value={simInfraCost} 
                      onChange={(e) => setSimInfraCost(Number(e.target.value))}
                      className="w-full px-4 py-3 rounded-xl bg-surface-subtle border border-border text-foreground-muted text-sm font-bold focus:outline-none focus:border-primary"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-foreground-muted tracking-wide">Gaji/Operasional (Rp/Trx)</label>
                    <input 
                      type="number" 
                      aria-label="Gaji/Operasional (Rp/Trx)"
                      value={simSalaryCost} 
                      onChange={(e) => setSimSalaryCost(Number(e.target.value))}
                      className="w-full px-4 py-3 rounded-xl bg-surface-subtle border border-border text-foreground-muted text-sm font-bold focus:outline-none focus:border-primary"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-foreground-muted tracking-wide">Kas Perusahaan (Rp/Trx)</label>
                    <input 
                      type="number" 
                      aria-label="Kas Perusahaan (Rp/Trx)"
                      value={simReserveCost} 
                      onChange={(e) => setSimReserveCost(Number(e.target.value))}
                      className="w-full px-4 py-3 rounded-xl bg-surface-subtle border border-border text-foreground-muted text-sm font-bold focus:outline-none focus:border-primary"
                    />
                  </div>
                </div>
              </div>

              {/* WATERFALL DASHBOARD */}
              <div className="glass-card p-8 rounded-[36px] border-border space-y-8 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl" />
                
                <h3 className="text-xl font-black text-foreground-muted italic uppercase">Aliran Dana (Waterfall) — {pnlPeriod}</h3>
                
                {(() => {
                  const gtv = pnlReport.summary.gross_revenue;
                  const courierEscrow = pnlReport.summary.courier_payout;
                  const totalTrx = pnlReport.summary.total_transactions;
                  const realOmzet = Math.max(0, gtv - courierEscrow);
                  
                  const totalInfra = simInfraCost * totalTrx;
                  const totalSalary = simSalaryCost * totalTrx;
                  const totalReserve = simReserveCost * totalTrx;
                  
                  const totalCompanyDeductions = totalInfra + totalSalary + totalReserve;
                  const netProfit = realOmzet - totalCompanyDeductions;
                  
                  // PPh Badan is exactly 22% of Net Profit
                  const pphBadan22 = netProfit > 0 ? Math.round(netProfit * 0.22) : 0;
                  const finalCompanyCash = netProfit - pphBadan22;

                  return (
                    <div className="space-y-6 relative z-10">
                      
                      {/* LEVEL 1: GTV */}
                      <div className="p-6 rounded-2xl bg-success-surface border border-success flex justify-between items-center">
                        <div>
                          <p className="text-xs font-black text-success uppercase tracking-wide">Level 1: GTV (Total Uang Masuk)</p>
                          <p className="text-3xl font-black text-success mt-1">Rp {gtv.toLocaleString('id-ID')}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-black text-success uppercase tracking-wide">Total Transaksi</p>
                          <p className="text-lg font-black text-success">{totalTrx.toLocaleString('id-ID')}</p>
                        </div>
                      </div>

                      {/* DOWN ARROWS */}
                      <div className="flex justify-center -my-2 opacity-50">
                        <ArrowDownRight className="text-foreground-muted" aria-hidden="true" />
                        <ArrowDownRight className="text-foreground-muted" aria-hidden="true" />
                      </div>

                      {/* LEVEL 2: SPLIT GTV */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="p-5 rounded-2xl bg-info-surface border border-info">
                          <p className="text-xs font-black text-info uppercase tracking-wide">Hutang Dagang (Milik Kurir)</p>
                          <p className="text-xl font-black text-info mt-1">Rp {courierEscrow.toLocaleString('id-ID')}</p>
                          <p className="text-xs text-foreground-muted mt-2 leading-relaxed">Dana ini adalah titipan murni milik mitra kurir, tidak boleh dihitung sebagai pendapatan.</p>
                        </div>
                        
                        <div className="p-6 rounded-2xl bg-primary/10 border border-primary/20 ring-1 ring-primary/30 shadow-[0_0_30px_-5px_rgba(var(--primary-rgb),0.2)]">
                          <p className="text-xs font-black text-primary-light uppercase tracking-wide">Omzet Asli Perusahaan</p>
                          <p className="text-3xl font-black text-foreground mt-1">Rp {realOmzet.toLocaleString('id-ID')}</p>
                          <p className="text-xs text-foreground-muted mt-2">GTV dikurangi Hutang Dagang. Ini adalah angka dasar perusahaan (Komisi + Platform Fee).</p>
                        </div>
                      </div>

                      {/* DOWN ARROW */}
                      <div className="flex justify-end pr-[25%] -my-2 opacity-50">
                        <ArrowDownRight className="text-foreground-muted" aria-hidden="true" />
                      </div>

                      {/* LEVEL 3: DEDUCTIONS FROM OMZET */}
                      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                        <div className="md:col-span-6" /> {/* Spacer */}
                        
                        <div className="md:col-span-6 p-6 rounded-2xl bg-surface-subtle border border-border space-y-4">
                          <p className="text-xs font-black text-foreground-muted uppercase tracking-wide border-b border-border pb-2">Potongan Operasional (Dari Omzet)</p>
                          
                          <div className="flex justify-between items-center text-sm">
                            <span className="text-foreground-muted font-bold">Modal Infra (API/OTP)</span>
                            <span className="text-error font-black">- Rp {totalInfra.toLocaleString('id-ID')}</span>
                          </div>
                          <div className="flex justify-between items-center text-sm">
                            <span className="text-foreground-muted font-bold">Gaji & Operasional</span>
                            <span className="text-error font-black">- Rp {totalSalary.toLocaleString('id-ID')}</span>
                          </div>
                          <div className="flex justify-between items-center text-sm">
                            <span className="text-foreground-muted font-bold">Kas Perusahaan (Reserve)</span>
                            <span className="text-error font-black">- Rp {totalReserve.toLocaleString('id-ID')}</span>
                          </div>
                          <div className="pt-2 border-t border-border flex justify-between items-center">
                            <span className="text-xs font-black text-foreground-muted uppercase">Total Potongan</span>
                            <span className="text-error font-black">- Rp {totalCompanyDeductions.toLocaleString('id-ID')}</span>
                          </div>
                        </div>
                      </div>

                      {/* DOWN ARROW */}
                      <div className="flex justify-end pr-[25%] -my-2 opacity-50">
                        <ArrowDownRight className="text-foreground-muted" aria-hidden="true" />
                      </div>

                      {/* LEVEL 4: NET PROFIT & TAX */}
                      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                        <div className="md:col-span-4" /> {/* Spacer */}
                        
                        <div className="md:col-span-8 grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className={cn(
                            "p-6 rounded-2xl border",
                            netProfit >= 0 ? "bg-success-surface border-success" : "bg-error-surface border-error"
                          )}>
                            <p className="text-xs font-black text-foreground-muted uppercase tracking-wide">Profit Bersih Kena Pajak</p>
                            <p className={cn(
                              "text-3xl font-black mt-1",
                              netProfit >= 0 ? "text-success" : "text-error"
                            )}>
                              Rp {netProfit.toLocaleString('id-ID')}
                            </p>
                            <p className="text-xs text-foreground-muted mt-2">Omzet dikurangi seluruh potongan.</p>
                          </div>

                          <div className="p-6 rounded-2xl bg-error-surface border border-error relative overflow-hidden">
                            <div className="absolute top-0 right-0 p-2 opacity-10"><Ban size={64} aria-hidden="true" /></div>
                            <p className="text-xs font-black text-error uppercase tracking-wide relative z-10">Pajak PPh Badan (22%) Ghoib</p>
                            <p className="text-3xl font-black text-error mt-1 relative z-10">
                              Rp {pphBadan22.toLocaleString('id-ID')}
                            </p>
                            <p className="text-xs text-error mt-2 relative z-10">
                              Alokasi pajak (Ghoib) wajib disisihkan jika berbentuk PT Badan.
                            </p>
                          </div>
                        </div>
                      </div>

                    </div>
                  );
                })()}
              </div>

              {/* Extra Original P&L Details as Accordion/Secondary */}
              <details className="glass-card rounded-[28px] border-border overflow-hidden group">
                <summary className="p-6 font-black text-foreground-muted italic uppercase cursor-pointer hover:bg-surface/[0.02] transition-colors flex items-center justify-between">
                  <span>Data Pendukung (PPN, Layanan, Diskon)</span>
                  <ChevronRight size={18} className="text-foreground-muted group-open:rotate-90 transition-transform" aria-hidden="true" />
                </summary>
                <div className="p-6 pt-0 border-t border-border mt-2 space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     <div className="p-5 rounded-2xl bg-surface/[0.02] border border-border flex justify-between items-center">
                        <div>
                          <p className="text-xs font-black text-warning uppercase tracking-wide">Total PPN Dipungut</p>
                          <p className="text-xl font-black text-warning mt-1">Rp {Number(pnlReport.summary.ppn_collected).toLocaleString('id-ID')}</p>
                        </div>
                     </div>
                     <div className="p-5 rounded-2xl bg-surface/[0.02] border border-border flex justify-between items-center">
                        <div>
                          <p className="text-xs font-black text-error uppercase tracking-wide">Subsidi Promo/Voucher</p>
                          <p className="text-xl font-black text-error mt-1">Rp {Number(pnlReport.summary.promo_subsidy).toLocaleString('id-ID')}</p>
                        </div>
                     </div>
                  </div>

                  <div className="space-y-3">
                    <p className="text-xs font-black text-foreground-muted uppercase tracking-wide">Revenue per Layanan</p>
                    {pnlReport.model_breakdown.map((m: any) => (
                      <div key={m.model} className="space-y-1">
                        <div className="flex justify-between text-sm">
                          <span className="font-bold text-foreground-muted capitalize">{m.model}</span>
                          <span className="font-black text-foreground-muted">Rp {Number(m.revenue).toLocaleString('id-ID')}</span>
                        </div>
                        <div className="w-full bg-surface-subtle rounded-full h-2">
                          <div
                            className="bg-primary h-2 rounded-full transition-all"
                            style={{ width: `${m.share_pct}%` }}
                          />
                        </div>
                        <div className="flex justify-between text-xs text-foreground-muted">
                          <span>{m.order_count} order</span>
                          <span>{m.share_pct}%</span>
                        </div>
                      </div>
                    ))}
                    {pnlReport.model_breakdown.length === 0 && (
                      <p className="text-foreground-muted text-sm italic text-center py-4">Tidak ada data untuk periode ini</p>
                    )}
                  </div>
                </div>
              </details>
            </div>
          )}

          {!pnlReport && !isLoadingPnl && (
            <div className="glass-card p-16 rounded-[36px] border-border text-center">
              <p className="text-foreground-muted font-bold italic uppercase text-sm">Pilih periode untuk melihat laporan P&L</p>
            </div>
          )}
        </div>
      )}
    </>
  );
}
