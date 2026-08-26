import { useState } from 'react'
import type { SectionProps } from './types'
import { serviceLabel, payoutStatusLabel, riskActionLabel } from './FinanceHelpers'

export function ReconciliationSection({ view }: SectionProps) {
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
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold text-zinc-100">Wallet & Ledger Reconciliation Center</h2>
              <p className="text-sm text-zinc-400 mt-1">
                Audit otomatis secara real-time saldo wallet, ledger akuntansi, dan transaksi penyelesaian.
              </p>
            </div>
            <button
              onClick={() => runReconciliationMutation.mutate()}
              disabled={runReconciliationMutation.isPending}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-white font-bold text-sm shadow-lg shadow-primary/20 transition-all disabled:opacity-50"
            >
              {runReconciliationMutation.isPending ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <ShieldCheck size={16} />
              )}
              Jalankan Rekonsiliasi Sekarang
            </button>
          </div>

          <div className="glass-card p-6 rounded-3xl border-white/5">
            {isLoadingRecon ? (
              <div className="py-12 flex justify-center">
                <Loader2 size={32} className="text-primary animate-spin" />
              </div>
            ) : reconciliationSummary && reconciliationSummary.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {reconciliationSummary.map((item: any, idx: number) => (
                  <div key={idx} className="p-5 rounded-2xl bg-white/[0.03] border border-white/5 space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black uppercase tracking-wider text-zinc-400">
                        {item.domain || item.name || `Domain #${idx + 1}`}
                      </span>
                      <span className={cn(
                        "px-2.5 py-1 rounded-full text-xs font-bold uppercase",
                        item.status === 'balanced' || item.mismatches === 0
                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                          : "bg-red-500/10 text-red-400 border border-red-500/20"
                      )}>
                        {item.status || (item.mismatches === 0 ? 'Balanced' : 'Mismatch Found')}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="p-3 rounded-xl bg-black/20">
                        <p className="text-[10px] text-zinc-500 uppercase font-bold">Matched</p>
                        <p className="text-lg font-black text-zinc-200 mt-1">{item.matched_count || item.matched || 0}</p>
                      </div>
                      <div className="p-3 rounded-xl bg-black/20">
                        <p className="text-[10px] text-zinc-500 uppercase font-bold">Mismatches</p>
                        <p className="text-lg font-black text-red-400 mt-1">{item.mismatch_count || item.mismatches || 0}</p>
                      </div>
                    </div>
                    {item.discrepancy_idr !== undefined && (
                      <div className="pt-2 border-t border-white/5 flex justify-between text-xs">
                        <span className="text-zinc-500">Discrepancy:</span>
                        <span className="font-bold text-zinc-300">
                          Rp {Number(item.discrepancy_idr || 0).toLocaleString('id-ID')}
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-12 text-center text-zinc-500 text-sm">
                Belum ada riwayat rekonsiliasi. Klik tombol &quot;Jalankan Rekonsiliasi Sekarang&quot; untuk memulai audit.
              </div>
            )}
          </div>
        </div>
  )
}
