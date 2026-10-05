import { useState } from 'react'
import { Check, ChevronDown, ChevronUp, Clock3, FileText, LifeBuoy, MapPin, Phone, Utensils, XCircle } from 'lucide-react'
import StatusBadge from './StatusBadge'
import { REJECT_REASONS, rupiah } from '../lib/types'
import type { MenuItem, MerchantOrder, MerchantOrderDetail } from '../lib/types'

export default function OrderCard({ order, menuItems, onAccept, onReject, onCancel, onReady, onPrint, onPartialReject, onProposeSubstitution, onLoadDetail, onReportIssue }: {
  order: MerchantOrder
  menuItems: MenuItem[]
  onAccept: (id: string) => Promise<void>
  onReject: (id: string, reason: string, detail: string) => Promise<void>
  onCancel: (id: string, reason: string) => Promise<void>
  onReady: (id: string) => Promise<void>
  onPrint: (id: string) => Promise<void>
  onPartialReject: (id: string, items: { menu_item_id: string; quantity: number; reason: string }[], reason: string) => Promise<void>
  onProposeSubstitution: (id: string, originalMenuItemId: string, replacementMenuItemId: string, reason: string) => Promise<void>
  onLoadDetail: (id: string) => Promise<MerchantOrderDetail>
  onReportIssue: (id: string) => void
}) {
  const [expanded, setExpanded] = useState(order.status === 'pending_merchant')
  const [busy, setBusy] = useState(false)
  const [showReject, setShowReject] = useState(false)
  const [showCancel, setShowCancel] = useState(false)
  const [showPartialReject, setShowPartialReject] = useState(false)
  const [showSubstitution, setShowSubstitution] = useState(false)
  const [partialItemIds, setPartialItemIds] = useState<Set<string>>(new Set())
  const [partialReason, setPartialReason] = useState('Stok menu habis')
  const [originalSubstitutionItem, setOriginalSubstitutionItem] = useState(order.items[0]?.menu_item_id || '')
  const [replacementSubstitutionItem, setReplacementSubstitutionItem] = useState('')
  const [substitutionReason, setSubstitutionReason] = useState('Item tidak tersedia')
  const [reason, setReason] = useState<string>('stok_habis')
  const [detail, setDetail] = useState('')
  const [serverDetail, setServerDetail] = useState<MerchantOrderDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [cancelReason, setCancelReason] = useState('Operasional toko tidak memungkinkan pesanan dilanjutkan')

  const merchantCancellable = ['preparing', 'searching', 'accepted', 'picking_up'].includes(order.status)

  if (!order.id) return null

  const act = async (fn: () => Promise<void>) => {
    setBusy(true)
    try {
      await fn()
    } finally {
      setBusy(false)
    }
  }

  const loadDetail = async () => {
    setDetailLoading(true)
    try {
      setServerDetail(await onLoadDetail(order.id))
    } finally {
      setDetailLoading(false)
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
            <button
              disabled={busy}
              onClick={() => act(() => onPrint(order.id))}
              className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-bold text-zinc-700 transition hover:border-emerald-900/30 hover:text-emerald-900 disabled:opacity-60"
            >
              <FileText className="h-4 w-4" /> Cetak struk
            </button>
            <button
              disabled={detailLoading}
              onClick={() => act(loadDetail)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 px-4 py-2.5 text-sm font-bold text-emerald-800 transition hover:bg-emerald-50 disabled:opacity-60"
            >
              {detailLoading ? 'Memuat…' : 'Lihat timeline'}
            </button>
            <button
              disabled={busy}
              onClick={() => onReportIssue(order.id)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-orange-200 px-4 py-2.5 text-sm font-bold text-orange-700 transition hover:bg-orange-50 disabled:opacity-60"
            >
              <LifeBuoy className="h-4 w-4" /> Laporkan masalah
            </button>
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
                {!showPartialReject && order.items.length > 0 ? (
                  <button disabled={busy} onClick={() => setShowPartialReject(true)} className="rounded-xl border border-orange-200 px-5 py-2.5 text-sm font-bold text-orange-700 transition hover:bg-orange-50 disabled:opacity-60">
                    Item tidak tersedia
                  </button>
                ) : null}
              </>
            )}
            {order.status === 'preparing' && order.items.some((item) => item.menu_item_id) && (
              <button disabled={busy} onClick={() => setShowSubstitution(true)} className="rounded-xl border border-emerald-200 px-5 py-2.5 text-sm font-bold text-emerald-800 transition hover:bg-emerald-50 disabled:opacity-60">
                Ajukan pengganti
              </button>
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
            {merchantCancellable && !showCancel && (
              <button
                disabled={busy}
                onClick={() => setShowCancel(true)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 px-4 py-2.5 text-sm font-bold text-red-700 transition hover:bg-red-50 disabled:opacity-60"
              >
                <XCircle className="h-4 w-4" /> Batalkan pesanan
              </button>
            )}
          </div>

          {showCancel && merchantCancellable && (
            <div className="mt-4 rounded-xl border border-red-100 bg-red-50/60 p-4">
              <p className="text-sm font-bold text-red-900">Batalkan pesanan ini?</p>
              <p className="mt-1 text-xs leading-5 text-red-800">Pelanggan akan diberi tahu. Pengembalian dana mengikuti status kurir dan kebijakan pesanan.</p>
              <textarea
                value={cancelReason}
                onChange={(event) => setCancelReason(event.target.value)}
                maxLength={500}
                rows={2}
                className="mt-3 w-full rounded-lg border border-red-200 bg-white px-3 py-2 text-sm outline-none focus:border-red-400"
                aria-label="Alasan pembatalan pesanan"
              />
              <div className="mt-3 flex gap-2">
                <button
                  disabled={busy || !cancelReason.trim()}
                  onClick={() => act(async () => { await onCancel(order.id, cancelReason.trim()); setShowCancel(false) })}
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-red-700 disabled:opacity-60"
                >
                  Konfirmasi pembatalan
                </button>
                <button onClick={() => setShowCancel(false)} className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-bold text-zinc-600">Kembali</button>
              </div>
            </div>
          )}

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

          {showPartialReject && (order.status === 'pending_merchant' || order.status === 'preparing') && (
            <div className="mt-4 rounded-xl border border-orange-100 bg-orange-50/50 p-4">
              <p className="text-sm font-bold text-orange-900">Item tidak tersedia</p>
              <p className="mt-1 text-xs text-orange-800">Pilih item yang direfund. Order lain tetap diproses.</p>
              <div className="mt-2 space-y-1.5">
                {order.items.map((item, index) => {
                  const key = item.menu_item_id || String(index)
                  return (
                    <label key={key} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-zinc-700 hover:bg-white">
                      <input type="checkbox" checked={partialItemIds.has(key)} onChange={(event) => setPartialItemIds((current) => { const next = new Set(current); if (event.target.checked) next.add(key); else next.delete(key); return next })} className="accent-orange-600" />
                      {item.quantity}× {item.item_name}
                    </label>
                  )
                })}
              </div>
              <input value={partialReason} onChange={(event) => setPartialReason(event.target.value)} className="mt-2 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-orange-400" aria-label="Alasan item tidak tersedia" />
              <div className="mt-3 flex gap-2">
                <button
                  disabled={busy || partialItemIds.size === 0 || !partialReason.trim()}
                  onClick={() => act(async () => { await onPartialReject(order.id, order.items.filter((item, index) => partialItemIds.has(item.menu_item_id || String(index))).map((item) => ({ menu_item_id: item.menu_item_id, quantity: item.quantity, reason: partialReason.trim() })), partialReason.trim()); setShowPartialReject(false); setPartialItemIds(new Set()) })}
                  className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-orange-700 disabled:opacity-60"
                >
                  Konfirmasi refund item
                </button>
                <button onClick={() => setShowPartialReject(false)} className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-bold text-zinc-600">Batal</button>
              </div>
            </div>
          )}

          {showSubstitution && order.status === 'preparing' && (
            <div className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50/50 p-4">
              <p className="text-sm font-bold text-emerald-900">Usulkan item pengganti</p>
              <p className="mt-1 text-xs text-emerald-800">Harga dihitung server dan pelanggan harus menyetujui sebelum item berubah.</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <select value={originalSubstitutionItem} onChange={(event) => setOriginalSubstitutionItem(event.target.value)} className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-400" aria-label="Item yang tidak tersedia">
                  {order.items.filter((item) => item.menu_item_id).map((item) => <option key={item.menu_item_id} value={item.menu_item_id}>{item.item_name}</option>)}
                </select>
                <select value={replacementSubstitutionItem} onChange={(event) => setReplacementSubstitutionItem(event.target.value)} className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-400" aria-label="Item pengganti">
                  <option value="">Pilih menu pengganti</option>
                  {menuItems.filter((item) => item.is_available && item.id !== originalSubstitutionItem).map((item) => <option key={item.id} value={item.id}>{item.nama} · {rupiah(item.harga)}</option>)}
                </select>
              </div>
              <input value={substitutionReason} onChange={(event) => setSubstitutionReason(event.target.value)} className="mt-2 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-emerald-400" aria-label="Alasan pengganti" />
              <div className="mt-3 flex gap-2">
                <button
                  disabled={busy || !originalSubstitutionItem || !replacementSubstitutionItem || !substitutionReason.trim()}
                  onClick={() => act(async () => { await onProposeSubstitution(order.id, originalSubstitutionItem, replacementSubstitutionItem, substitutionReason.trim()); setShowSubstitution(false); setReplacementSubstitutionItem('') })}
                  className="rounded-lg bg-[#003A20] px-4 py-2 text-sm font-bold text-white transition hover:bg-emerald-950 disabled:opacity-60"
                >
                  Kirim usulan
                </button>
                <button onClick={() => setShowSubstitution(false)} className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-bold text-zinc-600">Batal</button>
              </div>
            </div>
          )}

          {busy && !showReject && <p className="mt-3 text-xs font-semibold text-zinc-400">Memproses…</p>}

          {serverDetail && (
            <div className="mt-5 grid gap-4 rounded-2xl border border-emerald-100 bg-emerald-50/40 p-4 lg:grid-cols-[1fr_1.3fr]">
              <div>
                <p className="text-xs font-black uppercase tracking-wide text-emerald-900">Ringkasan pembayaran</p>
                <dl className="mt-3 space-y-2 text-sm text-zinc-600">
                  <div className="flex justify-between gap-3"><dt>Subtotal menu</dt><dd className="font-bold text-zinc-900">{rupiah(serverDetail.financials.subtotal_idr)}</dd></div>
                  <div className="flex justify-between gap-3"><dt>Biaya antar</dt><dd>{rupiah(serverDetail.financials.delivery_fee_idr)}</dd></div>
                  <div className="flex justify-between gap-3"><dt>Biaya platform</dt><dd>{rupiah(serverDetail.financials.platform_fee_idr)}</dd></div>
                  <div className="flex justify-between gap-3"><dt>Promo merchant</dt><dd>{rupiah(serverDetail.financials.merchant_promo_discount_idr)}</dd></div>
                  <div className="flex justify-between gap-3 border-t border-emerald-100 pt-2"><dt>Refund</dt><dd className="font-bold text-orange-700">{rupiah(serverDetail.financials.refunded_idr)}</dd></div>
                </dl>
                <p className="mt-3 text-xs text-zinc-500">Pembayaran: {serverDetail.payment_status || 'Belum tersedia'}{serverDetail.payment_method ? ` · ${serverDetail.payment_method}` : ''}</p>
                {serverDetail.courier && <p className="mt-2 text-xs text-zinc-600">Kurir: <b>{serverDetail.courier.name || 'Sedang ditugaskan'}</b> · {serverDetail.courier.status || 'status belum tersedia'}</p>}
                {serverDetail.substitutions && serverDetail.substitutions.length > 0 && (
                  <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">
                    <p className="font-black">Perubahan item</p>
                    <ul className="mt-2 space-y-2">
                      {serverDetail.substitutions.map((proposal) => (
                        <li key={proposal.id}>
                          <p className="font-semibold">{proposal.original_item_name} → {proposal.replacement_item_name}</p>
                          <p className="text-amber-800">Pelanggan: {proposal.customer_decision === 'pending' ? 'menunggu persetujuan' : proposal.customer_decision === 'approved' ? 'disetujui' : 'ditolak'}</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-wide text-emerald-900">Jejak pesanan</p>
                <ol className="mt-3 space-y-3">
                  {serverDetail.timeline.map((event) => (
                    <li key={event.id} className="relative pl-5 text-sm before:absolute before:left-0 before:top-1.5 before:h-2 before:w-2 before:rounded-full before:bg-emerald-700">
                      <p className="font-bold text-zinc-800">{event.to_status || event.event_type}</p>
                      <p className="text-xs text-zinc-500">{event.description || 'Perubahan status tercatat'} · {new Date(event.created_at).toLocaleString('id-ID')}</p>
                    </li>
                  ))}
                  {serverDetail.timeline.length === 0 && <li className="text-sm text-zinc-500">Belum ada jejak status tersimpan.</li>}
                </ol>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
