import { useEffect, useState } from 'react'
import { Loader2, Plus, Trash2, X } from 'lucide-react'
import { api, apiErrorMessage } from '../lib/api'
import { toast } from 'sonner'
import type { MenuItem, MenuItemRequest, ReplaceVariantsRequest } from '../lib/types'
import { rupiah } from '../lib/types'

interface VariantDraft {
  nama: string
  is_required: boolean
  min_select: number
  max_select: number
  options: { nama: string; price_delta: number }[]
}

const emptyForm = { nama: '', harga: '', kategori: '', foto: '', prep_time_minutes: '15', is_available: true }
const emptyVariant: VariantDraft = { nama: '', is_required: false, min_select: 0, max_select: 1, options: [] }

export default function MenuEditor({ item, onClose, onSaved }: {
  item: MenuItem | null
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState(emptyForm)
  const [variants, setVariants] = useState<VariantDraft[]>([])
  const [saving, setSaving] = useState(false)
  const [loadingVariants, setLoadingVariants] = useState(false)

  useEffect(() => {
    if (item) {
      setForm({
        nama: item.nama,
        harga: String(item.harga),
        kategori: item.kategori,
        foto: item.foto || '',
        prep_time_minutes: String(item.prep_time_minutes ?? 15),
        is_available: item.is_available,
      })
      setLoadingVariants(true)
      api
        .get(`/merchant/menu/${item.id}/variants`)
        .then((res) => {
          const list = (res.data ?? []) as { nama: string; is_required: boolean; min_select: number; max_select: number; options: { nama: string; price_delta: number }[] }[]
          setVariants(list.map((v) => ({ ...v, options: v.options.map((o) => ({ nama: o.nama, price_delta: o.price_delta })) })))
        })
        .catch(() => console.warn('Endpoint varian tidak tersedia'))
        .finally(() => setLoadingVariants(false))
    } else {
      setForm(emptyForm)
      setVariants([])
    }
  }, [item])

  const save = async () => {
    if (form.nama.trim().length < 2) return toast.error('Nama menu minimal 2 karakter')
    const harga = Number(form.harga.replace(/\D/g, ''))
    if (!harga || harga < 100) return toast.error('Harga minimal Rp100')
    if (!form.kategori.trim()) return toast.error('Kategori wajib diisi')

    const payload: MenuItemRequest = {
      nama: form.nama.trim(),
      harga,
      kategori: form.kategori.trim(),
      prep_time_minutes: Math.max(1, Number(form.prep_time_minutes) || 15),
      is_available: form.is_available,
      foto: form.foto.trim() || null,
    }

    setSaving(true)
    try {
      let saved: MenuItem
      if (item) {
        const res = await api.patch<MenuItem>(`/merchant/menu/${item.id}`, payload)
        saved = res.data
      } else {
        const res = await api.post<MenuItem>('/merchant/menu', payload)
        saved = res.data
      }
      if (saved?.id) {
        const body: ReplaceVariantsRequest = {
          variants: variants
            .filter((v) => v.nama.trim())
            .map((v) => ({
              nama: v.nama.trim(),
              is_required: v.is_required,
              min_select: Math.max(0, Number(v.min_select) || 0),
              max_select: Math.max(1, Number(v.max_select) || 1),
              options: v.options.filter((o) => o.nama.trim()).map((o) => ({ nama: o.nama.trim(), price_delta: Number(o.price_delta) || 0 })),
            })),
        }
        await api.put(`/merchant/menu/${saved.id}/variants`, body).catch(() => console.warn('Simpan varian gagal — endpoint varian mungkin belum tersedia'))
      }
      toast.success(item ? 'Menu diperbarui' : 'Menu ditambahkan')
      onSaved()
      onClose()
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Gagal menyimpan menu'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-6">
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-[1.75rem] bg-white p-6 shadow-2xl sm:rounded-[1.75rem]">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-black text-zinc-900">{item ? 'Edit Menu' : 'Tambah Menu'}</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100"><X className="h-5 w-5" /></button>
        </div>

        <div className="mt-5 space-y-4">
          <label className="block">
            <span className="text-sm font-bold text-zinc-700">Nama menu <span className="text-[#F97316]">*</span></span>
            <input value={form.nama} onChange={(e) => setForm({ ...form, nama: e.target.value })} placeholder="Nasi Goreng Spesial" className="mt-1.5 w-full rounded-xl border border-zinc-200 px-4 py-3 outline-none focus:border-emerald-900" />
          </label>
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="text-sm font-bold text-zinc-700">Harga <span className="text-[#F97316]">*</span></span>
              <input inputMode="numeric" value={form.harga ? `Rp${Number(form.harga.replace(/\D/g, '')).toLocaleString('id-ID')}` : ''} onChange={(e) => setForm({ ...form, harga: e.target.value })} placeholder="Rp15.000" className="mt-1.5 w-full rounded-xl border border-zinc-200 px-4 py-3 outline-none focus:border-emerald-900" />
              <span className="mt-1 block text-xs text-zinc-400">{rupiah(Number(form.harga.replace(/\D/g, '')) || 0)}</span>
            </label>
            <label className="block">
              <span className="text-sm font-bold text-zinc-700">Kategori <span className="text-[#F97316]">*</span></span>
              <input value={form.kategori} onChange={(e) => setForm({ ...form, kategori: e.target.value })} placeholder="Makanan Utama" className="mt-1.5 w-full rounded-xl border border-zinc-200 px-4 py-3 outline-none focus:border-emerald-900" />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="text-sm font-bold text-zinc-700">Waktu siap (menit)</span>
              <input type="number" min={1} value={form.prep_time_minutes} onChange={(e) => setForm({ ...form, prep_time_minutes: e.target.value })} className="mt-1.5 w-full rounded-xl border border-zinc-200 px-4 py-3 outline-none focus:border-emerald-900" />
            </label>
            <label className="block">
              <span className="text-sm font-bold text-zinc-700">URL Foto</span>
              <input value={form.foto} onChange={(e) => setForm({ ...form, foto: e.target.value })} placeholder="https://…jpg" className="mt-1.5 w-full rounded-xl border border-zinc-200 px-4 py-3 outline-none focus:border-emerald-900" />
            </label>
          </div>
          <label className="flex cursor-pointer items-center justify-between rounded-xl border border-zinc-100 bg-zinc-50 px-4 py-3.5">
            <span>
              <span className="text-sm font-bold text-zinc-800">Tersedia dijual</span>
              <span className="block text-xs text-zinc-400">Nonaktifkan bila stok habis sementara.</span>
            </span>
            <input type="checkbox" checked={form.is_available} onChange={(e) => setForm({ ...form, is_available: e.target.checked })} className="h-5 w-5 accent-emerald-900" />
          </label>

          <div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-zinc-700">Grup varian</span>
              <button onClick={() => setVariants([...variants, structuredClone(emptyVariant)])} className="inline-flex items-center gap-1 text-xs font-bold text-emerald-900 hover:underline">
                <Plus className="h-3.5 w-3.5" /> Tambah Grup
              </button>
            </div>
            {loadingVariants ? (
              <Loader2 className="mx-auto mt-3 h-5 w-5 animate-spin text-emerald-900" />
            ) : variants.length === 0 ? (
              <p className="mt-2 text-xs text-zinc-400">Contoh: Ukuran (Reguler/Besar), Level Pedas, Tambahan.</p>
            ) : (
              <div className="mt-2 space-y-3">
                {variants.map((v, vi) => (
                  <div key={vi} className="rounded-xl border border-zinc-100 bg-zinc-50 p-3">
                    <div className="flex items-center gap-2">
                      <input value={v.nama} onChange={(e) => setVariants(variants.map((x, i) => i === vi ? { ...x, nama: e.target.value } : x))} placeholder="Nama grup (mis. Level Pedas)" className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-emerald-900" />
                      <button onClick={() => setVariants(variants.filter((_, i) => i !== vi))} className="shrink-0 rounded-lg p-2 text-red-500 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-600">
                      <label className="flex items-center gap-1.5">
                        <input type="checkbox" checked={v.is_required} onChange={(e) => setVariants(variants.map((x, i) => i === vi ? { ...x, is_required: e.target.checked } : x))} className="h-4 w-4 accent-emerald-900" /> Wajib pilih
                      </label>
                      <label>Min <input type="number" min={0} value={v.min_select} onChange={(e) => setVariants(variants.map((x, i) => i === vi ? { ...x, min_select: Number(e.target.value) } : x))} className="w-14 rounded-md border border-zinc-200 px-1.5 py-1" /></label>
                      <label>Maks <input type="number" min={1} value={v.max_select} onChange={(e) => setVariants(variants.map((x, i) => i === vi ? { ...x, max_select: Number(e.target.value) } : x))} className="w-14 rounded-md border border-zinc-200 px-1.5 py-1" /></label>
                    </div>
                    <div className="mt-2 space-y-1.5">
                      {v.options.map((o, oi) => (
                        <div key={oi} className="flex items-center gap-2">
                          <input value={o.nama} onChange={(e) => setVariants(variants.map((x, i) => i === vi ? { ...x, options: x.options.map((y, j) => j === oi ? { ...y, nama: e.target.value } : y) } : x))} placeholder="Nama opsi" className="w-full rounded-lg border border-zinc-200 px-3 py-1.5 text-sm outline-none focus:border-emerald-900" />
                          <input inputMode="numeric" value={o.price_delta ? `+Rp${o.price_delta.toLocaleString('id-ID')}` : '+Rp'} onChange={(e) => setVariants(variants.map((x, i) => i === vi ? { ...x, options: x.options.map((y, j) => j === oi ? { ...y, price_delta: Number(e.target.value.replace(/\D/g, '')) } : y) } : x))} className="w-28 shrink-0 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm outline-none focus:border-emerald-900" />
                          <button onClick={() => setVariants(variants.map((x, i) => i === vi ? { ...x, options: x.options.filter((_, j) => j !== oi) } : x))} className="shrink-0 rounded-md p-1.5 text-zinc-400 hover:bg-zinc-200"><X className="h-3.5 w-3.5" /></button>
                        </div>
                      ))}
                      <button onClick={() => setVariants(variants.map((x, i) => i === vi ? { ...x, options: [...x.options, { nama: '', price_delta: 0 }] } : x))} className="inline-flex items-center gap-1 pl-1 text-xs font-bold text-emerald-900 hover:underline">
                        <Plus className="h-3 w-3" /> Opsi
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button onClick={onClose} className="rounded-xl border border-zinc-200 px-5 py-3 font-bold text-zinc-600 transition hover:border-zinc-300">Batal</button>
          <button onClick={save} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-[#003A20] px-6 py-3 font-bold text-white transition hover:bg-emerald-950 disabled:opacity-60">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Simpan Menu
          </button>
        </div>
      </div>
    </div>
  )
}
