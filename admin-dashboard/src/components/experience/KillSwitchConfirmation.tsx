import { AlertTriangle } from 'lucide-react'

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
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby="kill-switch-confirm-title">
      <div className="w-full max-w-xl rounded-3xl border border-red-500/30 bg-zinc-950 p-6 shadow-2xl">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-1 shrink-0 text-amber-300" size={22} />
          <div>
            <h2 id="kill-switch-confirm-title" className="text-lg font-black text-zinc-100">Konfirmasi service control</h2>
            <p className="mt-1 text-xs text-zinc-500">Perubahan ini akan dicatat sebagai high-severity operational action dan dikirim ke channel ops.</p>
          </div>
        </div>
        <div className="mt-5 space-y-3 rounded-2xl border border-amber-500/20 bg-amber-500/[0.06] p-4 text-sm text-zinc-300">
          <p><strong className="text-zinc-100">{active ? 'Aktifkan' : 'Nonaktifkan'}</strong> <code className="text-primary-light">{switchType}</code> untuk <code className="text-primary-light">{serviceCode || 'service belum diisi'}</code>.</p>
          <p className="text-xs leading-relaxed text-zinc-400">{impactFor(switchType)}</p>
          <p className="text-xs text-zinc-400">Active orders dipertahankan: <strong className="text-zinc-200">{preserveActiveOrders ? 'ya' : 'tidak'}</strong>.</p>
          <p className="text-xs text-zinc-400">Alasan: <strong className="text-zinc-200">{reason || 'belum diisi'}</strong></p>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onCancel} disabled={busy} className="rounded-xl border border-white/10 px-4 py-2.5 text-xs font-black uppercase tracking-widest text-zinc-400">Batal</button>
          <button type="button" onClick={onConfirm} disabled={busy || !reason.trim()} className="rounded-xl bg-red-600 px-4 py-2.5 text-xs font-black uppercase tracking-widest text-white disabled:opacity-50">{busy ? 'Menyimpan...' : active ? 'Aktifkan control' : 'Nonaktifkan control'}</button>
        </div>
      </div>
    </div>
  )
}
