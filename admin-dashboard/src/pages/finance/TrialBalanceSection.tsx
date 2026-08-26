import { useState } from 'react'
import type { SectionProps } from './types'
import { serviceLabel, payoutStatusLabel, riskActionLabel } from './FinanceHelpers'

export function TrialBalanceSection({ view }: SectionProps) {
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
        <div className="space-y-8 animate-in">
          <div className="flex items-center justify-between p-6 rounded-2xl bg-zinc-900 border border-white/5">
            <div>
              <h3 className="text-lg font-black text-white uppercase tracking-widest">Neraca Saldo (Trial Balance)</h3>
              <p className="text-sm text-zinc-500 mt-1">Laporan saldo awal, mutasi debit/kredit, dan saldo akhir per akun GL.</p>
            </div>
            <div className="flex items-center gap-4">
              <input
                type="date"
                value={ledgerStartDate}
                onChange={(e) => setLedgerStartDate(e.target.value)}
                className="bg-zinc-950 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white font-medium focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
              />
              <span className="text-zinc-600 font-black tracking-widest uppercase">To</span>
              <input
                type="date"
                value={ledgerEndDate}
                onChange={(e) => setLedgerEndDate(e.target.value)}
                className="bg-zinc-950 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white font-medium focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
              />
            </div>
          </div>

          <div className="glass-card rounded-[24px] border border-white/5 overflow-hidden">
            <div className="p-6 border-b border-white/5 flex items-center justify-between">
              <h3 className="text-sm font-black text-white uppercase tracking-widest">Detail Neraca Saldo</h3>
            </div>
            
            {isLoadingTrialBalance ? (
              <div className="flex items-center justify-center py-20"><Loader2 size={32} className="animate-spin text-zinc-600" /></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-white/[0.02]">
                    <tr>
                      {['Kode GL', 'Nama Akun', 'Saldo Awal', 'Total Debit', 'Total Kredit', 'Saldo Akhir'].map(h => (
                        <th key={h} className="px-6 py-4 text-left text-[10px] font-black text-zinc-500 uppercase tracking-widest border-b border-white/5">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(trialBalanceData || []).map((row: any) => (
                      <tr key={row.gl_code} className="border-b border-white/[0.02] hover:bg-white/[0.02] transition-colors group">
                        <td className="px-6 py-4">
                          <span className="px-2.5 py-1 rounded-md bg-white/5 text-[10px] font-mono text-zinc-400 group-hover:text-primary-light transition-colors">{row.gl_code}</span>
                        </td>
                        <td className="px-6 py-4 font-bold text-zinc-300 text-sm">{row.gl_name}</td>
                        <td className="px-6 py-4 font-medium text-zinc-400 text-sm">Rp {Number(row.opening_balance).toLocaleString('id-ID')}</td>
                        <td className="px-6 py-4 font-medium text-emerald-400 text-sm">Rp {Number(row.total_debit).toLocaleString('id-ID')}</td>
                        <td className="px-6 py-4 font-medium text-red-400 text-sm">Rp {Number(row.total_credit).toLocaleString('id-ID')}</td>
                        <td className="px-6 py-4 font-bold text-white text-sm bg-white/[0.01]">Rp {Number(row.closing_balance).toLocaleString('id-ID')}</td>
                      </tr>
                    ))}
                    {(trialBalanceData || []).length === 0 && (
                      <tr>
                        <td colSpan={6} className="py-12 text-center text-zinc-600 text-sm font-medium">
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
  )
}
