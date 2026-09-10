import { createElement } from 'react'
import { AlertTriangle, CalendarClock, CheckCircle2, CircleHelp, Clock, Info, Loader2, ShieldCheck, XCircle, type LucideIcon } from 'lucide-react'
import { cn } from '../lib/utils'

type StatusPresentation = {
  label: string
  icon: LucideIcon
  className: string
}

const humanize = (status: string) =>
  status.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())

/** Shared non-order status vocabulary for operational surfaces. */
export const getStatusPresentation = (status?: unknown): StatusPresentation => {
  const normalized = String(status || '').trim().toLowerCase()
  switch (normalized) {
    case 'paid':
    case 'success':
    case 'successful':
    case 'completed':
    case 'resolved':
    case 'closed':
    case 'verified':
    case 'active':
    case 'live':
    case 'hired':
    case 'approved':
    case 'approved_auto':
    case 'published':
    case 'sent':
    case 'enabled':
    case 'ready':
    case 'balanced':
    case 'submitted':
      return { label: normalized === 'paid' ? 'Sudah dibayar' : normalized === 'verified' ? 'Terverifikasi' : normalized === 'active' ? 'Aktif' : normalized === 'live' ? 'Live' : normalized === 'hired' ? 'Diterima' : normalized === 'approved' || normalized === 'approved_auto' ? 'Disetujui' : normalized === 'published' ? 'Dipublikasi' : normalized === 'sent' ? 'Terkirim' : normalized === 'enabled' ? 'Aktif' : normalized === 'ready' ? 'Siap' : normalized === 'balanced' ? 'Seimbang' : normalized === 'submitted' ? 'Dilaporkan' : normalized === 'closed' ? 'Ditutup' : normalized === 'resolved' ? 'Selesai' : 'Berhasil', icon: normalized === 'verified' ? ShieldCheck : CheckCircle2, className: 'text-success' }
    case 'protected':
      return { label: 'Dilindungi', icon: ShieldCheck, className: 'text-info' }
    case 'deprecated':
      return { label: 'Deprecated', icon: Info, className: 'text-foreground-muted' }
    case 'scheduled_deletion':
      return { label: 'Penghapusan terjadwal', icon: CalendarClock, className: 'text-warning' }
    case 'high':
      return { label: 'Tinggi', icon: AlertTriangle, className: 'text-accent' }
    case 'medium':
      return { label: 'Sedang', icon: AlertTriangle, className: 'text-warning' }
    case 'low':
      return { label: 'Rendah', icon: CheckCircle2, className: 'text-success' }
    case 'allow':
      return { label: 'Diizinkan', icon: CheckCircle2, className: 'text-success' }
    case 'failed':
    case 'error':
    case 'rejected':
    case 'cancelled':
    case 'canceled':
    case 'expired':
    case 'disabled':
    case 'blocked':
    case 'killed':
    case 'revoked':
    case 'suspended':
      return { label: normalized === 'rejected' ? 'Ditolak' : normalized === 'expired' ? 'Kedaluwarsa' : normalized === 'disabled' ? 'Dinonaktifkan' : normalized === 'blocked' ? 'Diblokir' : normalized === 'killed' ? 'Dihentikan' : normalized === 'revoked' ? 'Dicabut' : normalized === 'suspended' ? 'Ditangguhkan' : normalized === 'cancelled' || normalized === 'canceled' ? 'Dibatalkan' : 'Gagal', icon: XCircle, className: 'text-error' }
    case 'pending':
    case 'pending_review':
    case 'pending_customer':
    case 'pending_internal':
    case 'requested':
    case 'processing':
    case 'scheduled':
    case 'risk_screening':
    case 'risk_hold':
    case 'manual_review':
    case 'under_review':
      return { label: normalized === 'pending_review' ? 'Menunggu review' : normalized === 'pending_customer' ? 'Menunggu customer' : normalized === 'pending_internal' ? 'Menunggu internal' : normalized === 'requested' ? 'Diminta' : normalized === 'processing' ? 'Sedang diproses' : normalized === 'scheduled' ? 'Terjadwal' : ['risk_screening', 'risk_hold', 'manual_review', 'under_review'].includes(normalized) ? 'Menunggu review' : 'Menunggu', icon: Clock, className: 'text-warning' }
    case 'review':
      return { label: 'Perlu review', icon: Clock, className: 'text-warning' }
    case 'hold':
      return { label: 'Ditahan', icon: Clock, className: 'text-accent' }
    case 'challenge':
      return { label: 'Perlu challenge', icon: Info, className: 'text-info' }
    case 'block':
      return { label: 'Diblokir', icon: XCircle, className: 'text-error' }
    case 'open':
      return { label: 'Terbuka', icon: Info, className: 'text-info' }
    case 'new':
      return { label: 'Baru', icon: Info, className: 'text-info' }
    case 'healthy':
      return { label: 'Sehat', icon: CheckCircle2, className: 'text-success' }
    case 'degraded':
      return { label: 'Menurun', icon: Clock, className: 'text-warning' }
    case 'unhealthy':
      return { label: 'Tidak sehat', icon: XCircle, className: 'text-error' }
    case 'operational':
      return { label: 'Operasional', icon: CheckCircle2, className: 'text-success' }
    case 'critical':
      return { label: 'Kritis', icon: XCircle, className: 'text-error' }
    case 'fallback':
      return { label: 'Fallback aktif', icon: Info, className: 'text-warning' }
    case 'failure':
      return { label: 'Gagal', icon: XCircle, className: 'text-error' }
    case 'valid':
    case 'passed':
      return { label: 'Lolos validasi', icon: CheckCircle2, className: 'text-success' }
    case 'locked':
      return { label: 'Dikunci', icon: XCircle, className: 'text-error' }
    case 'mismatch':
    case 'mismatch_found':
      return { label: 'Ditemukan mismatch', icon: XCircle, className: 'text-error' }
    case 'investigating':
      return { label: 'Sedang diperiksa', icon: Loader2, className: 'text-warning' }
    case 'running':
    case 'in_progress':
      return { label: normalized === 'running' ? 'Berjalan' : 'Sedang berjalan', icon: Loader2, className: 'text-info' }
    case 'bypassed':
      return { label: 'Dilewati', icon: ShieldCheck, className: 'text-accent' }
    case 'canary':
      return { label: 'Canary', icon: Info, className: 'text-info' }
    case 'draft':
      return { label: 'Draft', icon: Clock, className: 'text-warning' }
    case 'awaiting_approval':
      return { label: 'Menunggu persetujuan', icon: Clock, className: 'text-accent' }
    case 'rolled_back':
      return { label: 'Dikembalikan', icon: Info, className: 'text-foreground-muted' }
    case 'superseded':
      return { label: 'Digantikan', icon: Info, className: 'text-foreground-muted' }
    case 'kill_switched':
      return { label: 'Kill switch aktif', icon: XCircle, className: 'text-error' }
    default:
      return { label: normalized ? humanize(normalized) : 'Status belum tersedia', icon: CircleHelp, className: 'text-foreground-muted' }
  }
}

type StatusBadgeProps = {
  status?: unknown
  className?: string
  labelPrefix?: string
  label?: string
}

export function StatusBadge({ status, className, labelPrefix = 'Status', label }: StatusBadgeProps) {
  const presentation = getStatusPresentation(status)
  const visibleLabel = label || presentation.label
  return (
    <span
      aria-label={`${labelPrefix}: ${visibleLabel}`}
      data-status-badge="true"
      className={cn('inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-subtle px-2.5 py-1 text-xs font-bold', presentation.className, className)}
    >
      {createElement(presentation.icon, { className: 'h-3.5 w-3.5 shrink-0', 'aria-hidden': true })}
      {visibleLabel}
    </span>
  )
}
