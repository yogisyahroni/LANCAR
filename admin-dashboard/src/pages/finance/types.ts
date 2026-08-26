import type { UseMutationResult } from '@tanstack/react-query'
import type { ReactNode } from 'react'

// View-model passed from the Finance() orchestrator to each tab section component.
// Every section only destructures what it renders — no logic lives here.
export interface FinanceView {
  // raw query data
  financialData: any
  payouts: any[]
  payoutAccounts: any[]
  payoutRequests: any[]
  payoutOps: any
  payoutReviewQueue: any[]
  payoutReviewDetail: any
  serviceSettlementSummary: any
  cashPosition: any
  pnlReport: any
  taxDashboard: any
  pphReport: any
  trialBalanceData: any[]
  ledgerEntriesData: any[]
  reconciliationSummary: any
  unitEconomicsData: any
  closingPeriods: any[]
  closingPnl: any
  closingTB: any[]
  closingCashLiability: any[]
  closingTaxSummary: any[]
  closingSettlementOutstanding: any[]

  // loaders
  isLoadingStats: boolean
  isLoadingServiceSettlement: boolean
  isLoadingPnl: boolean
  isLoadingTax: boolean
  isLoadingPph: boolean
  isLoadingTrialBalance: boolean
  isLoadingLedgerEntries: boolean
  isLoadingRecon: boolean
  isLoadingUnitEconomics: boolean
  isLoadingPeriods: boolean
  isLoadingClosingPnl: boolean
  isLoadingClosingTB: boolean
  isLoadingCashLiability: boolean
  isLoadingTaxSummary: boolean
  isLoadingSettlementOutstanding: boolean
  isLoadingCashPosition: boolean

  // derived helpers
  stats: any[]
  revenueBreakdown: any[]
  emergencyFund: number
  opsCounts: any
  latestReconItems: any[]
  formatCurrency: (value: number | string) => string
  serviceSettlementRows: any[]
  serviceSettlementTotals: any
  activeReviewId: string | null
  reviewRequest: any
  reviewRisk: any
  reviewAccount: any

  // state + setters
  pnlPeriod: string
  pphPeriod: string
  closingPeriod: string
  totpInput: string
  ledgerStartDate: string
  ledgerEndDate: string
  ledgerAccountFilter: string
  ledgerJournalTypeFilter: string
  simInfraCost: number
  simSalaryCost: number
  simReserveCost: number

  setActiveTab: (tab: FinanceTab) => void
  setSelectedReviewId: (id: string | null) => void
  setPnlPeriod: (v: string) => void
  setPphPeriod: (v: string) => void
  setClosingPeriod: (v: string) => void
  setTotpInput: (v: string) => void
  setLedgerStartDate: (v: string) => void
  setLedgerEndDate: (v: string) => void
  setLedgerAccountFilter: (v: string) => void
  setLedgerJournalTypeFilter: (v: string) => void
  setSimInfraCost: (v: number) => void
  setSimSalaryCost: (v: number) => void
  setSimReserveCost: (v: number) => void

  // callbacks
  runReviewAction: (action: string) => void
  handleExportEfaktur: () => Promise<void>
  handleExportPPh23: () => Promise<void>

  // mutations
  updatePayoutAccountMutation: UseMutationResult<any, any, { id: string; status: string; reason: string }>
  updatePayoutRequestMutation: UseMutationResult<any, any, { id: string; status: string; reason: string }>
  payoutReviewActionMutation: UseMutationResult<any, any, { id: string; action: string; reason: string }>
  dispatchApprovedPayoutsMutation: UseMutationResult<any, any, string>
  reconcilePayoutsMutation: UseMutationResult<any, any, string>
  releaseMutation: UseMutationResult<any, any, string>
  batchReleaseMutation: UseMutationResult<any, any, void>
  topUpMutation: UseMutationResult<any, any, number>
  lockPeriodMutation: UseMutationResult<any, any, { period: string; totpCode?: string }>
  runReconciliationMutation: UseMutationResult<any, any, void>
}

export type FinanceTab = 'treasury' | 'pnl' | 'tax' | 'trial-balance' | 'ledger' | 'reconciliation' | 'closing' | 'unit-economics'

export type SectionProps = { view: FinanceView }
