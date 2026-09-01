import { useCallback, useEffect, useState } from 'react'
import { FileUp, ImageOff, Pencil, Plus, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { api, apiErrorMessage } from '../lib/api'
import MenuEditor from '../components/MenuEditor'
import { MerchantPageSkeleton } from '../components/Skeleton'
import type { MenuItem, MenuListResponse } from '../lib/types'
import { rupiah } from '../lib/types'

interface BulkMenuRow {
  nama: string
  harga: number
  kategori: string
  prep_time_minutes: number
}

const parseCsvLine = (line: string) => {
  const values: string[] = []
  let value = ''
  let quoted = false
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]
    if (char === '"' && line[i + 1] === '"' && quoted) { value += '"'; i += 1 }
    else if (char === '"') quoted = !quoted
    else if (char === ',' && !quoted) { values.push(value.trim()); value = '' }
    else value += char
  }
  values.push(value.trim())
  return values
}

const parseBulkMenuCsv = (text: string): BulkMenuRow[] => {
  const lines = text.split(/\r?\n/).filter((line) => line.trim())
  if (lines.length < 2) throw new Error('CSV harus memiliki header dan minimal satu baris menu')
  const headers = parseCsvLine(lines[0]).map((header) => header.toLowerCase())
  const required = ['nama', 'harga', 'kategori']
  if (required.some((header) => !headers.includes(header))) throw new Error('Header wajib: nama,harga,kategori (prep_time_minutes opsional)')
  return lines.slice(1).map((line, index) => {
    const values = parseCsvLine(line)
    const get = (name: string) => values[headers.indexOf(name)] || ''
    const harga = Number(get('harga').replace(/[^\d]/g, ''))
    const prep = Number(get('prep_time_minutes') || 15)
    if (get('nama').length < 2 || !harga || harga < 100 || !get('kategori') || !Number.isFinite(prep) || prep < 1) throw new Error(`Baris ${index + 2} tidak valid`)
    return { nama: get('nama'), harga, kategori: get('kategori'), prep_time_minutes: Math.round(prep) }
  })
}

export default function Menu() {
  const [items, setItems] = useState<MenuItem[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [editing, setEditing] = useState<MenuItem | null>(null)
  const [showEditor, setShowEditor] = useState(false)
  const [bulkRows, setBulkRows] = useState<BulkMenuRow[]>([])
  const [bulkError, setBulkError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)

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

  const chooseBulkFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      setBulkError(null)
      setBulkRows(parseBulkMenuCsv(await file.text()))
    } catch (err) {
      setBulkRows([])
      setBulkError(err instanceof Error ? err.message : 'CSV tidak dapat dibaca')
    }
  }

  const importBulkMenu = async () => {
    if (bulkRows.length === 0) return
    setImporting(true)
    try {
      for (const row of bulkRows) await api.post('/merchant/menu', { ...row, is_available: true, foto: null })
      toast.success(`${bulkRows.length} menu berhasil diimpor`)
      setBulkRows([])
      await load()
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Import berhenti karena ada menu yang gagal disimpan'))
    } finally { setImporting(false) }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-zinc-900">Menu</h1>
          <p className="mt-1 text-sm text-zinc-500">{items.length} item · tandai habis bila stok kosong.</p>
        </div>
        <div className="flex gap-2">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-zinc-200 bg-white px-4 py-2.5 text-sm font-bold text-zinc-600 transition hover:border-emerald-900/30 hover:text-emerald-900">
            <FileUp className="h-4 w-4" /> Import CSV
            <input type="file" accept=".csv,text/csv" onChange={chooseBulkFile} className="sr-only" />
          </label>
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

      {(bulkRows.length > 0 || bulkError) && (
        <section className="rounded-2xl border border-orange-200 bg-orange-50/60 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><p className="font-black text-orange-950">Preview import menu</p><p className="text-xs text-orange-800">Kolom: nama, harga, kategori, prep_time_minutes.</p></div>
            {bulkRows.length > 0 && <button onClick={importBulkMenu} disabled={importing} className="rounded-xl bg-orange-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-60">{importing ? 'Mengimpor…' : `Impor ${bulkRows.length} menu`}</button>}
          </div>
          {bulkError ? <p className="mt-3 text-sm font-semibold text-red-700">{bulkError}</p> : <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[500px] text-left text-sm"><thead><tr className="text-xs uppercase text-orange-800"><th className="pb-2">Nama</th><th className="pb-2">Harga</th><th className="pb-2">Kategori</th><th className="pb-2">Prep</th></tr></thead><tbody>{bulkRows.slice(0, 10).map((row, index) => <tr key={`${row.nama}-${index}`} className="border-t border-orange-200"><td className="py-2 font-semibold">{row.nama}</td><td className="py-2">{rupiah(row.harga)}</td><td className="py-2">{row.kategori}</td><td className="py-2">{row.prep_time_minutes} menit</td></tr>)}</tbody></table>{bulkRows.length > 10 && <p className="mt-2 text-xs text-orange-800">Menampilkan 10 dari {bulkRows.length} baris.</p>}</div>}
        </section>
      )}

      {loading ? (
        <MerchantPageSkeleton />
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
