import { useCallback, useEffect, useState } from 'react'
import { ImageOff, Loader2, Pencil, Plus, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { api, apiErrorMessage } from '../lib/api'
import MenuEditor from '../components/MenuEditor'
import type { MenuItem, MenuListResponse } from '../lib/types'
import { rupiah } from '../lib/types'

export default function Menu() {
  const [items, setItems] = useState<MenuItem[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [editing, setEditing] = useState<MenuItem | null>(null)
  const [showEditor, setShowEditor] = useState(false)

  const load = useCallback(async (spinner = false) => {
    if (spinner) setRefreshing(true)
    try {
      const res = await api.get<MenuListResponse>('/merchant/menu?page=1&page_size=100')
      setItems(res.data?.items || [])
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Gagal memuat menu'))
    } finally {
      setLoading(false)
      if (spinner) setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    load(true)
  }, [load])

  const toggleAvailability = async (item: MenuItem) => {
    try {
      const res = await api.post<MenuItem>(`/merchant/menu/${item.id}/availability`, { is_available: !item.is_available })
      setItems((prev) => prev.map((i) => (i.id === item.id ? res.data : i)))
      toast.success(res.data.is_available ? `${res.data.nama} dijual kembali` : `${res.data.nama} ditandai habis`)
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Gagal mengubah ketersediaan'))
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-zinc-900">Menu</h1>
          <p className="mt-1 text-sm text-zinc-500">{items.length} item · tandai habis bila stok kosong.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => load(true)} disabled={refreshing} className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-4 py-2.5 text-sm font-bold text-zinc-600 transition hover:border-emerald-900/30 hover:text-emerald-900 disabled:opacity-60">
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => { setEditing(null); setShowEditor(true) }}
            className="inline-flex items-center gap-2 rounded-full bg-[#F97316] px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-orange-500/20 transition hover:bg-orange-600"
          >
            <Plus className="h-4 w-4" /> Tambah Menu
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-emerald-900" /></div>
      ) : items.length === 0 ? (
        <div className="rounded-[1.75rem] border border-zinc-100 bg-white p-12 text-center shadow-sm">
          <p className="font-bold text-zinc-700">Belum ada menu</p>
          <p className="mt-1 text-sm text-zinc-400">Tambahkan menu pertamamu supaya pelanggan bisa order.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => (
            <div key={item.id} className={`flex flex-col rounded-2xl border bg-white p-4 shadow-sm transition ${item.is_available ? 'border-zinc-100' : 'border-dashed border-zinc-200 opacity-75'}`}>
              <div className="flex items-start gap-3">
                <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-zinc-100">
                  {item.foto ? (
                    <img src={item.foto} alt={item.nama} className="h-full w-full object-cover" onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')} />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center"><ImageOff className="h-5 w-5 text-zinc-300" /></div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold text-zinc-900">{item.nama}</p>
                  <p className="text-xs text-zinc-400">{item.kategori}</p>
                  <p className="mt-1 font-black text-emerald-900">{rupiah(item.harga)}</p>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-zinc-50 pt-3">
                <button
                  onClick={() => toggleAvailability(item)}
                  className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${item.is_available ? 'bg-emerald-100 text-emerald-800 hover:bg-red-50 hover:text-red-700' : 'bg-red-100 text-red-700 hover:bg-emerald-50 hover:text-emerald-800'}`}
                >
                  {item.is_available ? 'Tersedia' : 'Habis'}
                </button>
                <button
                  onClick={() => { setEditing(item); setShowEditor(true) }}
                  className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 px-3 py-1.5 text-xs font-bold text-zinc-600 transition hover:border-emerald-900/30 hover:text-emerald-900"
                >
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showEditor && <MenuEditor item={editing} onClose={() => setShowEditor(false)} onSaved={() => load()} />}
    </div>
  )
}
