import { useState } from 'react'
import type { SectionProps } from './types'
import { serviceLabel, payoutStatusLabel, riskActionLabel } from './FinanceHelpers'

export function LedgerSection({ view }: SectionProps) {
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
          <div className="flex flex-col md:flex-row md:items-center justify-between p-6 rounded-2xl bg-zinc-900 border border-white/5 gap-4">
            <div>
              <h3 className="text-lg font-black text-white uppercase tracking-widest">Buku Besar (Ledger)</h3>
              <p className="text-sm text-zinc-500 mt-1">Daftar entri jurnal berdasarkan waktu riil.</p>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <input
                type="text"
                placeholder="Filter Akun GL"
                value={ledgerAccountFilter}
                onChange={(e) => setLedgerAccountFilter(e.target.value)}
                className="bg-zinc-950 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white font-medium focus:ring-2 focus:ring-primary focus:border-transparent outline-none w-40"
              />
              <select
                value={ledgerJournalTypeFilter}
                onChange={(e) => setLedgerJournalTypeFilter(e.target.value)}
                className="bg-zinc-950 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white font-medium focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
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
              <h3 className="text-sm font-black text-white uppercase tracking-widest">Detail Journal Entries</h3>
            </div>
            
            {isLoadingLedgerEntries ? (
              <div className="flex items-center justify-center py-20"><Loader2 size={32} className="animate-spin text-zinc-600" /></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-white/[0.02]">
                    <tr>
                      {['Tanggal', 'Journal ID', 'Tipe Journal', 'Akun', 'Debit', 'Kredit', 'Keterangan'].map(h => (
                        <th key={h} className="px-6 py-4 text-left text-[10px] font-black text-zinc-500 uppercase tracking-widest border-b border-white/5">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(ledgerEntriesData || []).map((row: any) => (
                      <tr key={row.entry_id} className="border-b border-white/[0.02] hover:bg-white/[0.02] transition-colors group">
                        <td className="px-6 py-4 font-medium text-zinc-400 text-[11px] whitespace-nowrap">
                          {new Date(row.created_at).toLocaleString('id-ID')}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col">
                            <span className="px-2 py-0.5 rounded-md bg-white/5 text-[10px] font-mono text-zinc-400 w-max">{row.journal_id?.substring(0,8)}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="px-2 py-1 rounded bg-zinc-800 text-xs text-zinc-300 font-bold uppercase">{row.journal_type}</span>
                        </td>
                        <td className="px-6 py-4 font-bold text-zinc-300 text-sm">{row.account_name}</td>
                        <td className="px-6 py-4 font-medium text-emerald-400 text-sm">{row.debit_idr ? `Rp ${Number(row.debit_idr).toLocaleString('id-ID')}` : '-'}</td>
                        <td className="px-6 py-4 font-medium text-red-400 text-sm">{row.credit_idr ? `Rp ${Number(row.credit_idr).toLocaleString('id-ID')}` : '-'}</td>
                        <td className="px-6 py-4 text-zinc-400 text-xs">{row.reason}</td>
                      </tr>
                    ))}
                    {(ledgerEntriesData || []).length === 0 && (
                      <tr>
                        <td colSpan={7} className="py-12 text-center text-zinc-600 text-sm font-medium">
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
  )
}
