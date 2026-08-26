import { useState } from 'react'
import type { SectionProps } from './types'
import { serviceLabel, payoutStatusLabel, riskActionLabel } from './FinanceHelpers'

export function UnitEconomicsSection({ view }: SectionProps) {
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
          <div className="glass-card p-10 rounded-[48px] border-white/5 space-y-8">
            <h3 className="text-2xl font-black text-zinc-100 italic uppercase">Unit Economics</h3>
            <p className="text-zinc-400">Analisis metrik per transaksi (Margin, subsidi, promo) secara real-time.</p>
            {isLoadingUnitEconomics ? (
              <div className="py-12 flex justify-center"><Loader2 className="w-12 h-12 text-primary animate-spin" /></div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                 {unitEconomicsData?.metrics?.map((item: any, i: number) => (
                   <div key={i} className="flex flex-col p-6 rounded-3xl bg-white/[0.02] border border-white/5">
                      <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">{item.label}</p>
                      <p className="text-2xl font-black text-zinc-100 mt-2">{formatCurrency(item.value)}</p>
                      <span className={cn(
                        "mt-4 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest w-fit",
                        item.status === 'Healthy' ? "text-emerald-400 bg-emerald-500/10" : "text-amber-400 bg-amber-500/10"
                      )}>
                         {item.status}
                      </span>
                   </div>
                 ))}
              </div>
            )}
          </div>
        </div>
  )
}
