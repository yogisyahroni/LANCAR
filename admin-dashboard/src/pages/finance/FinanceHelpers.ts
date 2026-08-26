import { cn } from '../../lib/utils'
import type { ComponentType } from 'react'
import { Landmark, BarChart2, Receipt, PieChart, Wallet, ShieldCheck, Lock, TrendingUp } from 'lucide-react'

export { cn }

export const COLORS = ['#006437', '#10b981', '#34d399', '#6ee7b7']

export const activePayoutStatuses = ['requested', 'risk_screening', 'approved_auto', 'risk_hold', 'manual_review', 'under_review', 'approved', 'processing']

export const payoutStatusLabel = (request: any) => request.status_label || ({
  requested: 'Pemeriksaan otomatis',
  risk_screening: 'Pemeriksaan otomatis',
  approved_auto: 'Auto approved',
  risk_hold: 'Needs review',
  manual_review: 'Needs review',
  under_review: 'Needs review',
  approved: 'Diproses',
  processing: 'Diproses',
  paid: 'Berhasil',
  blocked: 'Blocked by risk',
  rejected: 'Ditolak',
  failed: 'Gagal',
  cancelled: 'Dibatalkan',
} as Record<string, string>)[request.status] || String(request.status || '').replaceAll('_', ' ')

export const riskActionLabel = (request: any) => ({
  auto_approved: 'Auto approved',
  needs_review: 'Needs review',
  blocked_by_risk: 'Blocked by risk',
  processing: 'Processing',
  screening: 'Screening',
  terminal: 'Closed',
} as Record<string, string>)[request.risk_action] || payoutStatusLabel(request)

export type FinanceTab = 'treasury' | 'pnl' | 'tax' | 'trial-balance' | 'ledger' | 'reconciliation' | 'closing' | 'unit-economics'

export const financeTabs: { id: FinanceTab; label: string; icon: ComponentType<{ size?: number; className?: string }> }[] = [
  { id: 'treasury', label: 'Treasury & Settlement', icon: Landmark },
  { id: 'pnl', label: 'Laporan P&L', icon: BarChart2 },
  { id: 'tax', label: 'Pajak (PPN + PPh)', icon: Receipt },
  { id: 'trial-balance', label: 'Neraca Saldo', icon: PieChart },
  { id: 'ledger', label: 'Buku Besar', icon: Wallet },
  { id: 'reconciliation', label: 'Reconciliation Center', icon: ShieldCheck },
  { id: 'closing', label: 'Monthly Closing', icon: Lock },
  { id: 'unit-economics', label: 'Unit Economics', icon: TrendingUp },
]

export const serviceLabel = (value: string) => ({
  on_demand: 'Paket',
  food_delivery: 'Food',
  tambal_ban: 'Tambal Ban',
  towing: 'Towing',
  regular: 'Regular',
  p2p: 'Paket',
} as Record<string, string>)[value] || String(value || '-').replaceAll('_', ' ')
