import { useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'
import { FocusTrap } from '../a11y/FocusTrap'

type Props = {
  open: boolean
  busy?: boolean
  serviceCode: string
  switchType: string
  active: boolean
  reason: string
  preserveActiveOrders: boolean
  onCancel: () => void
  onConfirm: () => void
}

const impactFor = (type: string) => ({
  marketing_hide: 'Hanya menyembunyikan entry atau promo. Order yang sudah berjalan dan kemampuan transaksi tidak berubah.',
  new_order_gate: 'Mencegah order baru untuk service dan scope terpilih. Active order, tracking, proof, support, refund, dan recovery tetap dapat diakses.',
  provider_gate: 'Menonaktifkan capability provider/carrier/payment/map yang dipilih. Ini bukan berarti seluruh service dihapus.',
  checkout_gate: 'Menghentikan inisiasi checkout atau pembayaran baru. Active order tetap dipertahankan sesuai policy.',
}[type] ?? 'Dampak control belum dikenali.')

export default function KillSwitchConfirmation({
  open,
  busy = false,
  serviceCode,
  switchType,
  active,
  reason,
  preserveActiveOrders,
  onCancel,
  onConfirm,
}: Props) {
  useEffect(() => {
    if (!open) return undefined

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) {
        event.preventDefault()
        onCancel()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [busy, onCancel, open])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim/70 p-4" role="dialog" aria-modal="true" aria-labelledby="kill-switch-confirm-title">
      <FocusTrap className="relative z-10 w-full max-w-xl">
      <div className="w-full rounded-3xl border border-error bg-background p-6 shadow-2xl">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-1 shrink-0 text-warning" size={22} aria-hidden="true" />
          <div>
            <h2 id="kill-switch-confirm-title" className="text-lg font-black text-foreground-muted">Konfirmasi service control</h2>
            <p className="mt-1 text-xs text-foreground-muted">Perubahan ini akan dicatat sebagai high-severity operational action dan dikirim ke channel ops.</p>
          </div>
        </div>
        <div className="mt-5 space-y-3 rounded-2xl border border-warning bg-warning/[0.06] p-4 text-sm text-on-warning">
          <p><strong className="text-foreground-muted">{active ? 'Aktifkan' : 'Nonaktifkan'}</strong> <code className="text-primary-light">{switchType}</code> untuk <code className="text-primary-light">{serviceCode || 'service belum diisi'}</code>.</p>
          <p className="text-xs leading-relaxed text-foreground-muted">{impactFor(switchType)}</p>
          <p className="text-xs text-foreground-muted">Active orders dipertahankan: <strong className="text-foreground-muted">{preserveActiveOrders ? 'ya' : 'tidak'}</strong>.</p>
          <p className="text-xs text-foreground-muted">Alasan: <strong className="text-foreground-muted">{reason || 'belum diisi'}</strong></p>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onCancel} disabled={busy} className="rounded-xl border border-border px-4 py-2.5 text-xs font-black uppercase tracking-widest text-foreground-muted">Batal</button>
          <button type="button" onClick={onConfirm} disabled={busy || !reason.trim()} className="rounded-xl bg-error px-4 py-2.5 text-xs font-black uppercase tracking-widest text-on-error disabled:opacity-50">{busy ? 'Menyimpan...' : active ? 'Aktifkan control' : 'Nonaktifkan control'}</button>
        </div>
      </div>
      </FocusTrap>
    </div>
  )
}
