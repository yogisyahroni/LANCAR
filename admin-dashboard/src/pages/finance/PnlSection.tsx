import { useState } from 'react'
import type { SectionProps } from './types'
import { serviceLabel, payoutStatusLabel, riskActionLabel } from './FinanceHelpers'

export function PnlSection({ view }: SectionProps) {
  const {
    financialData, payouts, payoutAccounts, payoutRequests, payoutOps, payoutReviewQueue,
    payoutReviewDetail, serviceSettlementSummary, cashPosition, pnlReport, taxDashboard,
    pphReport, trialBalanceData, ledgerEntriesData, reconciliationSummary, unitEconomicsData,
    closingPeriods, closingPnl, closingTB, closingCashLiability, closingTaxSummary,
    closingSettlementOutstanding,
    isLoadingStats, isLoadingServiceSettlement, isLoadingPnl, isLoadingTax, isLoadingPph,
    isLoadingTrialBalance, isLoadingLedgerEntries, isLoadingRecon, isLoadingUnitEconomics,
    isLoadingPeriods, isLoadingClosingPnl, isLoadingClosingTB, isLoadingCashLiability,
    isLoadingTaxSummary, isLoadingSettlementOutstanding, isLoadingCashPosition,
    stats, revenueBreakdown, emergencyFund, opsCounts, latestReconItems, formatCurrency,
    serviceSettlementRows, serviceSettlementTotals, activeReviewId, reviewRequest,
    reviewRisk, reviewAccount,
    pnlPeriod, pphPeriod, closingPeriod, totpInput, ledgerStartDate, ledgerEndDate,
    ledgerAccountFilter, ledgerJournalTypeFilter, simInfraCost, simSalaryCost, simReserveCost,
    setActiveTab, setSelectedReviewId, setPnlPeriod, setPphPeriod, setClosingPeriod,
    setTotpInput, setLedgerStartDate, setLedgerEndDate, setLedgerAccountFilter,
    setLedgerJournalTypeFilter, setSimInfraCost, setSimSalaryCost, setSimReserveCost,
    runReviewAction, handleExportEfaktur, handleExportPPh23,
    updatePayoutAccountMutation, updatePayoutRequestMutation, payoutReviewActionMutation,
    dispatchApprovedPayoutsMutation, reconcilePayoutsMutation, releaseMutation,
    batchReleaseMutation, topUpMutation, lockPeriodMutation, runReconciliationMutation,
  } = view

  return (
        <div className="space-y-8">
          {/* Period Picker */}
          <div className="flex items-center gap-4">
            <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Periode:</label>
            <input
              type="month"
              value={pnlPeriod}
              onChange={(e) => setPnlPeriod(e.target.value)}
              className="px-4 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-zinc-100 text-sm font-bold focus:outline-none focus:border-primary"
            />
            {isLoadingPnl && <Loader2 size={16} className="animate-spin text-zinc-500" />}
          </div>

          {pnlReport && (
            <div className="space-y-6">
              {/* Architecture Simulator Configuration */}
              <div className="glass-card p-6 rounded-[28px] border-white/5 space-y-4">
                <div className="flex items-center gap-3">
                  <BarChart2 className="text-primary-light" size={20} />
                  <h3 className="text-lg font-black text-zinc-100 uppercase italic">Simulator Struktur Biaya / Transaksi</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Modal Infra (Rp/Trx)</label>
                    <input 
                      type="number" 
                      value={simInfraCost} 
                      onChange={(e) => setSimInfraCost(Number(e.target.value))}
                      className="w-full px-4 py-3 rounded-xl bg-black/20 border border-white/5 text-zinc-100 text-sm font-bold focus:outline-none focus:border-primary"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Gaji/Operasional (Rp/Trx)</label>
                    <input 
                      type="number" 
                      value={simSalaryCost} 
                      onChange={(e) => setSimSalaryCost(Number(e.target.value))}
                      className="w-full px-4 py-3 rounded-xl bg-black/20 border border-white/5 text-zinc-100 text-sm font-bold focus:outline-none focus:border-primary"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Kas Perusahaan (Rp/Trx)</label>
                    <input 
                      type="number" 
                      value={simReserveCost} 
                      onChange={(e) => setSimReserveCost(Number(e.target.value))}
                      className="w-full px-4 py-3 rounded-xl bg-black/20 border border-white/5 text-zinc-100 text-sm font-bold focus:outline-none focus:border-primary"
                    />
                  </div>
                </div>
              </div>

              {/* WATERFALL DASHBOARD */}
              <div className="glass-card p-8 rounded-[36px] border-white/5 space-y-8 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl" />
                
                <h3 className="text-xl font-black text-zinc-100 italic uppercase">Aliran Dana (Waterfall) — {pnlPeriod}</h3>
                
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
                      <div className="p-6 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex justify-between items-center">
                        <div>
                          <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">Level 1: GTV (Total Uang Masuk)</p>
                          <p className="text-3xl font-black text-emerald-400 mt-1">Rp {gtv.toLocaleString('id-ID')}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] font-black text-emerald-500/70 uppercase tracking-widest">Total Transaksi</p>
                          <p className="text-lg font-black text-emerald-400/90">{totalTrx.toLocaleString('id-ID')}</p>
                        </div>
                      </div>

                      {/* DOWN ARROWS */}
                      <div className="flex justify-center -my-2 opacity-50">
                        <ArrowDownRight className="text-zinc-500" />
                        <ArrowDownRight className="text-zinc-500" />
                      </div>

                      {/* LEVEL 2: SPLIT GTV */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="p-5 rounded-2xl bg-blue-500/5 border border-blue-500/10">
                          <p className="text-[10px] font-black text-blue-500 uppercase tracking-widest">Hutang Dagang (Milik Kurir)</p>
                          <p className="text-xl font-black text-blue-400 mt-1">Rp {courierEscrow.toLocaleString('id-ID')}</p>
                          <p className="text-[10px] text-zinc-500 mt-2 leading-relaxed">Dana ini adalah titipan murni milik mitra kurir, tidak boleh dihitung sebagai pendapatan.</p>
                        </div>
                        
                        <div className="p-6 rounded-2xl bg-primary/10 border border-primary/20 ring-1 ring-primary/30 shadow-[0_0_30px_-5px_rgba(var(--primary-rgb),0.2)]">
                          <p className="text-[10px] font-black text-primary-light uppercase tracking-widest">Omzet Asli Perusahaan</p>
                          <p className="text-3xl font-black text-white mt-1">Rp {realOmzet.toLocaleString('id-ID')}</p>
                          <p className="text-[10px] text-zinc-400 mt-2">GTV dikurangi Hutang Dagang. Ini adalah angka dasar perusahaan (Komisi + Platform Fee).</p>
                        </div>
                      </div>

                      {/* DOWN ARROW */}
                      <div className="flex justify-end pr-[25%] -my-2 opacity-50">
                        <ArrowDownRight className="text-zinc-500" />
                      </div>

                      {/* LEVEL 3: DEDUCTIONS FROM OMZET */}
                      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                        <div className="md:col-span-6" /> {/* Spacer */}
                        
                        <div className="md:col-span-6 p-6 rounded-2xl bg-zinc-900/50 border border-white/5 space-y-4">
                          <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest border-b border-white/5 pb-2">Potongan Operasional (Dari Omzet)</p>
                          
                          <div className="flex justify-between items-center text-sm">
                            <span className="text-zinc-400 font-bold">Modal Infra (API/OTP)</span>
                            <span className="text-red-400 font-black">- Rp {totalInfra.toLocaleString('id-ID')}</span>
                          </div>
                          <div className="flex justify-between items-center text-sm">
                            <span className="text-zinc-400 font-bold">Gaji & Operasional</span>
                            <span className="text-red-400 font-black">- Rp {totalSalary.toLocaleString('id-ID')}</span>
                          </div>
                          <div className="flex justify-between items-center text-sm">
                            <span className="text-zinc-400 font-bold">Kas Perusahaan (Reserve)</span>
                            <span className="text-red-400 font-black">- Rp {totalReserve.toLocaleString('id-ID')}</span>
                          </div>
                          <div className="pt-2 border-t border-white/5 flex justify-between items-center">
                            <span className="text-[10px] font-black text-zinc-500 uppercase">Total Potongan</span>
                            <span className="text-red-400 font-black">- Rp {totalCompanyDeductions.toLocaleString('id-ID')}</span>
                          </div>
                        </div>
                      </div>

                      {/* DOWN ARROW */}
                      <div className="flex justify-end pr-[25%] -my-2 opacity-50">
                        <ArrowDownRight className="text-zinc-500" />
                      </div>

                      {/* LEVEL 4: NET PROFIT & TAX */}
                      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                        <div className="md:col-span-4" /> {/* Spacer */}
                        
                        <div className="md:col-span-8 grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className={cn(
                            "p-6 rounded-2xl border",
                            netProfit >= 0 ? "bg-emerald-500/10 border-emerald-500/20" : "bg-red-500/10 border-red-500/20"
                          )}>
                            <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Profit Bersih Kena Pajak</p>
                            <p className={cn(
                              "text-3xl font-black mt-1",
                              netProfit >= 0 ? "text-emerald-400" : "text-red-400"
                            )}>
                              Rp {netProfit.toLocaleString('id-ID')}
                            </p>
                            <p className="text-[10px] text-zinc-500 mt-2">Omzet dikurangi seluruh potongan.</p>
                          </div>

                          <div className="p-6 rounded-2xl bg-red-950/30 border border-red-500/30 relative overflow-hidden">
                            <div className="absolute top-0 right-0 p-2 opacity-10"><Ban size={64} /></div>
                            <p className="text-[10px] font-black text-red-400 uppercase tracking-widest relative z-10">Pajak PPh Badan (22%) Ghoib</p>
                            <p className="text-3xl font-black text-red-500 mt-1 relative z-10">
                              Rp {pphBadan22.toLocaleString('id-ID')}
                            </p>
                            <p className="text-[10px] text-red-400/60 mt-2 relative z-10">
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
              <details className="glass-card rounded-[28px] border-white/5 overflow-hidden group">
                <summary className="p-6 font-black text-zinc-300 italic uppercase cursor-pointer hover:bg-white/[0.02] transition-colors flex items-center justify-between">
                  <span>Data Pendukung (PPN, Layanan, Diskon)</span>
                  <ChevronRight size={18} className="text-zinc-500 group-open:rotate-90 transition-transform" />
                </summary>
                <div className="p-6 pt-0 border-t border-white/5 mt-2 space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/5 flex justify-between items-center">
                        <div>
                          <p className="text-[10px] font-black text-amber-500 uppercase tracking-widest">Total PPN Dipungut</p>
                          <p className="text-xl font-black text-amber-400 mt-1">Rp {Number(pnlReport.summary.ppn_collected).toLocaleString('id-ID')}</p>
                        </div>
                     </div>
                     <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/5 flex justify-between items-center">
                        <div>
                          <p className="text-[10px] font-black text-red-500 uppercase tracking-widest">Subsidi Promo/Voucher</p>
                          <p className="text-xl font-black text-red-400 mt-1">Rp {Number(pnlReport.summary.promo_subsidy).toLocaleString('id-ID')}</p>
                        </div>
                     </div>
                  </div>

                  <div className="space-y-3">
                    <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Revenue per Layanan</p>
                    {pnlReport.model_breakdown.map((m: any) => (
                      <div key={m.model} className="space-y-1">
                        <div className="flex justify-between text-sm">
                          <span className="font-bold text-zinc-300 capitalize">{m.model}</span>
                          <span className="font-black text-zinc-100">Rp {Number(m.revenue).toLocaleString('id-ID')}</span>
                        </div>
                        <div className="w-full bg-white/5 rounded-full h-2">
                          <div
                            className="bg-primary h-2 rounded-full transition-all"
                            style={{ width: `${m.share_pct}%` }}
                          />
                        </div>
                        <div className="flex justify-between text-[10px] text-zinc-600">
                          <span>{m.order_count} order</span>
                          <span>{m.share_pct}%</span>
                        </div>
                      </div>
                    ))}
                    {pnlReport.model_breakdown.length === 0 && (
                      <p className="text-zinc-600 text-sm italic text-center py-4">Tidak ada data untuk periode ini</p>
                    )}
                  </div>
                </div>
              </details>
            </div>
          )}

          {!pnlReport && !isLoadingPnl && (
            <div className="glass-card p-16 rounded-[36px] border-white/5 text-center">
              <p className="text-zinc-500 font-bold italic uppercase text-sm">Pilih periode untuk melihat laporan P&L</p>
            </div>
          )}
        </div>
  )
}
