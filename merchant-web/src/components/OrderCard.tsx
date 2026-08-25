import { useState } from 'react'
import { Check, ChevronDown, ChevronUp, Clock3, MapPin, Phone, Utensils } from 'lucide-react'
import StatusBadge from './StatusBadge'
import { REJECT_REASONS, rupiah } from '../lib/types'
import type { MerchantOrder } from '../lib/types'

export default function OrderCard({ order, onAccept, onReject, onReady }: {
  order: MerchantOrder
  onAccept: (id: string) => Promise<void>
  onReject: (id: string, reason: string, detail: string) => Promise<void>
  onReady: (id: string) => Promise<void>
}) {
  const [expanded, setExpanded] = useState(order.status === 'pending_merchant')
  const [busy, setBusy] = useState(false)
  const [showReject, setShowReject] = useState(false)
  const [reason, setReason] = useState<string>('stok_habis')
  const [detail, setDetail] = useState('')

  if (!order.id) return null

  const act = async (fn: () => Promise<void>) => {
    setBusy(true)
    try {
      await fn()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={`rounded-2xl border bg-white shadow-sm transition ${order.status === 'pending_merchant' ? 'border-[#F97316]/40 ring-2 ring-orange-500/10' : 'border-zinc-100'}`}>
      <button onClick={() => setExpanded((v) => !v)} className="flex w-full items-start justify-between gap-4 p-5 text-left">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-black text-zinc-900">#{order.order_number || order.id.slice(0, 8)}</span>
            <StatusBadge status={order.status} />
          </div>
          <p className="mt-1 truncate text-sm text-zinc-600">{order.customer_name || 'Pelanggan'}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-400">
            {order.dropoff_address && <span className="inline-flex max-w-[220px] items-center gap-1 truncate"><MapPin className="h-3.5 w-3.5 shrink-0" />{order.dropoff_address}</span>}
            {order.scheduled_at && <span className="inline-flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" />Jadwal: {new Date(order.scheduled_at).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>}
            <span>{order.items.length} item · {rupiah(order.total_price_idr)}</span>
          </div>
        </div>
        {expanded ? <ChevronUp className="h-5 w-5 shrink-0 text-zinc-400" /> : <ChevronDown className="h-5 w-5 shrink-0 text-zinc-400" />}
      </button>

      {expanded && (
        <div className="border-t border-zinc-100 px-5 pb-5 pt-4">
          <ul className="space-y-1.5">
            {order.items.map((it, i) => (
              <li key={i} className="flex items-start justify-between gap-3 text-sm">
                <span className="text-zinc-700">
                  <Utensils className="mr-1.5 inline h-3.5 w-3.5 text-zinc-300" />
                  {it.quantity}× {it.item_name}
                  {it.variants && it.variants.length > 0 && (
                    <span className="block pl-5 text-xs text-zinc-400">
                      {it.variants.map((v) => `${v.variant_name}: ${v.option_name}`).join(', ')}
                    </span>
                  )}
                  {it.notes && <span className="block pl-5 text-xs italic text-orange-700">Catatan: {it.notes}</span>}
                </span>
                <span className="shrink-0 font-semibold text-zinc-900">{rupiah(it.subtotal)}</span>
              </li>
            ))}
          </ul>
          {order.order_notes && (
            <p className="mt-3 rounded-xl bg-amber-50 px-4 py-2.5 text-sm text-amber-900">Catatan order: {order.order_notes}</p>
          )}

          <div className="mt-4 flex flex-wrap gap-2.5">
            {order.customer_phone && (
              <a href={`tel:${order.customer_phone}`} className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-bold text-zinc-700 transition hover:border-emerald-900/30 hover:text-emerald-900">
                <Phone className="h-4 w-4" /> Telepon
              </a>
            )}
            {order.status === 'pending_merchant' && (
              <>
                <button
                  disabled={busy}
                  onClick={() => act(() => onAccept(order.id))}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#003A20] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-950 disabled:opacity-60"
                >
                  <Check className="h-4 w-4" /> Terima Order
                </button>
                {!showReject ? (
                  <button disabled={busy} onClick={() => setShowReject(true)} className="rounded-xl border border-red-200 px-5 py-2.5 text-sm font-bold text-red-600 transition hover:bg-red-50 disabled:opacity-60">
                    Tolak
                  </button>
                ) : null}
              </>
            )}
            {order.status === 'preparing' && !order.food_ready_at && (
              <button
                disabled={busy}
                onClick={() => act(() => onReady(order.id))}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#F97316] px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-orange-500/20 transition hover:bg-orange-600 disabled:opacity-60"
              >
                <Check className="h-4 w-4" /> Pesanan Siap
              </button>
            )}
          </div>

          {showReject && order.status === 'pending_merchant' && (
            <div className="mt-4 rounded-xl border border-red-100 bg-red-50/50 p-4">
              <p className="text-sm font-bold text-red-800">Alasan penolakan (wajib)</p>
              <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                {REJECT_REASONS.map((r) => (
                  <label key={r.value} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-zinc-700 hover:bg-white">
                    <input type="radio" name={`reject-${order.id}`} checked={reason === r.value} onChange={() => setReason(r.value)} className="accent-red-600" />
                    {r.label}
                  </label>
                ))}
              </div>
              {reason === 'lainnya' && (
                <input
                  value={detail}
                  onChange={(e) => setDetail(e.target.value)}
                  placeholder="Detail alasan (opsional)"
                  className="mt-2 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-red-400"
                />
              )}
              <div className="mt-3 flex gap-2">
                <button
                  disabled={busy}
                  onClick={() =>
                    act(async () => {
                      await onReject(order.id, reason, detail.trim())
                      setShowReject(false)
                    })
                  }
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-red-700 disabled:opacity-60"
                >
                  Konfirmasi Tolak
                </button>
                <button onClick={() => setShowReject(false)} className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-bold text-zinc-600">
                  Batal
                </button>
              </div>
            </div>
          )}

          {busy && !showReject && <p className="mt-3 text-xs font-semibold text-zinc-400">Memproses…</p>}
        </div>
      )}
    </div>
  )
}
