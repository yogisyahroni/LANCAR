import { useCallback, useEffect, useState } from 'react'
import { Loader2, Plus, Power, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { api, apiErrorMessage } from '../lib/api'
import { MerchantPageSkeleton } from '../components/Skeleton'
import type { MerchantPromo, MenuItem, MenuListResponse } from '../lib/types'
import { rupiah } from '../lib/types'

const toIso = (value: string) => new Date(value).toISOString()
const toLocal = (value: string) => new Date(value).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })

export default function Promo() {
  const [items, setItems] = useState<MerchantPromo[]>([])
  const [menu, setMenu] = useState<MenuItem[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ type: 'percent', value: '10', max: '', menuItemId: '', starts: '', ends: '' })

  const load = useCallback(async () => {
    try {
      const [promos, menuRes] = await Promise.all([
        api.get<{ items: MerchantPromo[] }>('/merchant/promos?page=1&page_size=100'),
        api.get<MenuListResponse>('/merchant/menu?page=1&page_size=100'),
      ])
      setItems(promos.data?.items || [])
      setMenu(menuRes.data?.items || [])
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Gagal memuat promo'))
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const create = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!form.starts || !form.ends) return toast.error('Periode promo wajib diisi')
    setSaving(true)
    try {
      await api.post('/merchant/promos', {
        discount_type: form.type,
        discount_value: Number(form.value),
        max_discount_idr: form.type === 'percent' && form.max ? Number(form.max) : undefined,
        menu_item_id: form.menuItemId || undefined,
        starts_at: toIso(form.starts),
        ends_at: toIso(form.ends),
      })
      toast.success('Promo dibuat dan tersimpan')
      setForm({ type: 'percent', value: '10', max: '', menuItemId: '', starts: '', ends: '' })
      await load()
    } catch (err) { toast.error(apiErrorMessage(err, 'Gagal membuat promo')) }
    finally { setSaving(false) }
  }

  const setActive = async (promo: MerchantPromo) => {
    try { await api.post(`/merchant/promos/${promo.id}/active`, { is_active: !promo.is_active }); await load() }
    catch (err) { toast.error(apiErrorMessage(err, 'Gagal mengubah status promo')) }
  }

  const remove = async (id: string) => {
    if (!window.confirm('Hapus promo ini?')) return
    try { await api.delete(`/merchant/promos/${id}`); setItems((prev) => prev.filter((p) => p.id !== id)); toast.success('Promo dihapus') }
    catch (err) { toast.error(apiErrorMessage(err, 'Gagal menghapus promo')) }
  }

  return <div className="space-y-6">
    <div><h1 className="text-2xl font-black text-zinc-900">Promo toko</h1><p className="mt-1 text-sm text-zinc-500">Promo dibiayai toko dan otomatis dipakai saat periode aktif.</p></div>
    <form onSubmit={create} className="grid gap-4 rounded-[1.75rem] border border-zinc-100 bg-white p-6 shadow-sm md:grid-cols-2">
      <label className="text-sm font-bold text-zinc-700">Jenis diskon<select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-3 font-normal"><option value="percent">Persen</option><option value="fixed">Nominal tetap</option><option value="buy1get1">Buy 1 Get 1</option></select></label>
      <label className="text-sm font-bold text-zinc-700">Nilai diskon<input type="number" min="1" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-3 font-normal" /></label>
      {form.type === 'percent' && <label className="text-sm font-bold text-zinc-700">Maksimal diskon (opsional)<input type="number" min="0" value={form.max} onChange={(e) => setForm({ ...form, max: e.target.value })} placeholder="Rp0" className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-3 font-normal" /></label>}
      <label className="text-sm font-bold text-zinc-700">Menu (opsional)<select value={form.menuItemId} onChange={(e) => setForm({ ...form, menuItemId: e.target.value })} className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-3 font-normal"><option value="">Semua menu</option>{menu.map((item) => <option key={item.id} value={item.id}>{item.nama}</option>)}</select></label>
      <label className="text-sm font-bold text-zinc-700">Mulai<input required type="datetime-local" value={form.starts} onChange={(e) => setForm({ ...form, starts: e.target.value })} className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-3 font-normal" /></label>
      <label className="text-sm font-bold text-zinc-700">Berakhir<input required type="datetime-local" value={form.ends} onChange={(e) => setForm({ ...form, ends: e.target.value })} className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-3 font-normal" /></label>
      <button disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#F97316] px-5 py-3 font-bold text-white disabled:opacity-60 md:col-span-2">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Buat promo</button>
    </form>
    {loading ? <MerchantPageSkeleton /> : items.length === 0 ? <Empty text="Belum ada promo tersimpan." /> : <div className="grid gap-4 md:grid-cols-2">{items.map((promo) => <article key={promo.id} className="rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div><p className="font-black text-zinc-900">{promo.discount_type === 'percent' ? `${promo.discount_value}%` : promo.discount_type === 'fixed' ? rupiah(promo.discount_value) : 'Buy 1 Get 1'}</p><p className="mt-1 text-xs text-zinc-500">{toLocal(promo.starts_at)} — {toLocal(promo.ends_at)}</p></div><span className={`rounded-full px-3 py-1 text-xs font-bold ${promo.is_active ? 'bg-emerald-100 text-emerald-800' : 'bg-zinc-100 text-zinc-500'}`}>{promo.is_active ? 'Aktif' : 'Nonaktif'}</span></div><div className="mt-4 flex gap-2"><button onClick={() => setActive(promo)} className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 px-3 py-2 text-xs font-bold text-zinc-600"><Power className="h-3.5 w-3.5" /> {promo.is_active ? 'Nonaktifkan' : 'Aktifkan'}</button><button onClick={() => remove(promo.id)} className="inline-flex items-center gap-1.5 rounded-xl border border-red-100 px-3 py-2 text-xs font-bold text-red-600"><Trash2 className="h-3.5 w-3.5" /> Hapus</button></div></article>)}</div>}
  </div>
}

function Empty({ text }: { text: string }) { return <div className="rounded-[1.75rem] border border-dashed border-zinc-200 bg-white p-12 text-center text-sm text-zinc-500">{text}</div> }
