import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, FileUp, ImageOff, Pencil, Plus, RefreshCw, RotateCcw, UploadCloud } from 'lucide-react'
import { toast } from 'sonner'
import { api, apiErrorMessage } from '../lib/api'
import MenuEditor from '../components/MenuEditor'
import { MerchantPageSkeleton } from '../components/Skeleton'
import type { CatalogPublication, CatalogReadiness, MenuItem, MenuItemOutletOverride, MenuListResponse, MerchantPortalContext } from '../lib/types'
import { loadMerchantPortalContext } from '../lib/portal-context'
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
  const [bulkCsv, setBulkCsv] = useState('')
  const [bulkError, setBulkError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [validating, setValidating] = useState(false)
  const [readiness, setReadiness] = useState<CatalogReadiness | null>(null)
  const [publications, setPublications] = useState<CatalogPublication[]>([])
  const [publishing, setPublishing] = useState(false)
  const [rollingBack, setRollingBack] = useState(false)
  const [outletOverrides, setOutletOverrides] = useState<MenuItemOutletOverride[]>([])
  const [portalContext, setPortalContext] = useState<MerchantPortalContext | null>(null)
  const [overrideDrafts, setOverrideDrafts] = useState<Record<string, { price: string; availability: 'inherit' | 'available' | 'unavailable' }>>({})
  const [savingOverride, setSavingOverride] = useState<string | null>(null)

  const activeBranch = useMemo(() => {
    if (!portalContext) return null
    return portalContext.branches.find((branch) => branch.id === portalContext.current_branch_id) || null
  }, [portalContext])

  const load = useCallback(async (spinner = false) => {
    if (spinner) setRefreshing(true)
    try {
      // Bootstrap tenant/branch headers first. Without this ordering an owner
      // can race the context request and accidentally load every outlet into
      // a page that is meant to edit only the selected outlet.
      const context = await loadMerchantPortalContext()
      const [res, readinessRes, publicationsRes, overridesRes] = await Promise.all([
        api.get<MenuListResponse>('/merchant/menu?page=1&page_size=100'),
        api.get<CatalogReadiness>('/merchant/menu/readiness'),
        api.get<{ items: CatalogPublication[] }>('/merchant/menu/publications?limit=20'),
        api.get<{ items: MenuItemOutletOverride[] }>('/merchant/menu/outlet-overrides'),
      ])
      setItems(res.data?.items || [])
      setReadiness(readinessRes.data)
      setPublications(publicationsRes.data?.items || [])
      const loadedOverrides = overridesRes.data?.items || []
      setOutletOverrides(loadedOverrides)
      setPortalContext(context)
      setOverrideDrafts(Object.fromEntries(loadedOverrides.map((override) => [override.menu_item_id, {
        price: override.price_idr == null ? '' : String(override.price_idr),
        availability: override.is_available == null ? 'inherit' : override.is_available ? 'available' : 'unavailable',
      }])))
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Gagal memuat menu'))
    } finally {
      setLoading(false)
      if (spinner) setRefreshing(false)
    }
  }, [])

  const publishCatalog = async () => {
    if (!readiness?.ready) return
    setPublishing(true)
    try {
      await api.post('/merchant/menu/publish', { expected_catalog_version: readiness.catalog_version }, {
        headers: { 'Idempotency-Key': crypto.randomUUID() },
      })
      toast.success('Menu berhasil dipublikasikan ke pelanggan')
      await load()
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Katalog belum dapat dipublikasikan'))
    } finally { setPublishing(false) }
  }

  const rollbackCatalog = async (publication: CatalogPublication) => {
    setRollingBack(true)
    try {
      await api.post('/merchant/menu/rollback', { publication_version: publication.publication_version }, {
        headers: { 'Idempotency-Key': crypto.randomUUID() },
      })
      toast.success(`Katalog dikembalikan ke versi ${publication.publication_version}`)
      await load()
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Katalog belum dapat dikembalikan'))
    } finally { setRollingBack(false) }
  }

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

  const saveOutletOverride = async (item: MenuItem) => {
    if (!activeBranch) {
      toast.error('Pilih outlet aktif terlebih dahulu')
      return
    }
    const draft = overrideDrafts[item.id] || { price: '', availability: 'inherit' as const }
    const current = outletOverrides.find((override) => override.menu_item_id === item.id)
    const price = draft.price.trim() === '' ? null : Number(draft.price.replace(/[^\d]/g, ''))
    if (price !== null && (!Number.isSafeInteger(price) || price < 0)) {
      toast.error('Harga outlet harus berupa angka yang valid')
      return
    }
    setSavingOverride(item.id)
    try {
      await api.put<MenuItemOutletOverride>('/merchant/menu/outlet-overrides', {
        menu_item_id: item.id,
        branch_id: activeBranch.id,
        price_idr: price,
        is_available: draft.availability === 'inherit' ? null : draft.availability === 'available',
        promo_id: current?.promo_id ?? null,
        expected_version: current?.version || undefined,
      }, { headers: { 'Idempotency-Key': crypto.randomUUID() } })
      toast.success(`Pengaturan ${activeBranch.name} disimpan`)
      await load()
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Pengaturan outlet belum tersimpan'))
    } finally { setSavingOverride(null) }
  }

  const chooseBulkFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      setBulkError(null)
      const content = await file.text()
      setBulkCsv(content)
      setBulkRows(parseBulkMenuCsv(content))
    } catch (err) {
      setBulkCsv('')
      setBulkRows([])
      setBulkError(err instanceof Error ? err.message : 'CSV tidak dapat dibaca')
    }
  }

  const importBulkMenu = async () => {
    if (bulkRows.length === 0 || !bulkCsv) return
    setImporting(true)
    try {
      const result = await api.post<{ rows?: number; created_count?: number }>('/merchant/menu/import', bulkCsv, {
        headers: { 'Content-Type': 'text/csv', 'Idempotency-Key': crypto.randomUUID() },
      })
      toast.success(`${result.data?.created_count ?? bulkRows.length} menu berhasil diimpor dalam satu batch`)
      setBulkRows([])
      setBulkCsv('')
      await load()
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Import berhenti karena ada menu yang gagal disimpan'))
    } finally { setImporting(false) }
  }

  const validateBulkMenu = async () => {
    if (!bulkRows.length || !bulkCsv) return
    setValidating(true)
    try {
      const result = await api.post<{ created_count?: number; errors?: { row: number; message: string }[] }>('/merchant/menu/import?preview=1', bulkCsv, {
        headers: { 'Content-Type': 'text/csv', 'Idempotency-Key': crypto.randomUUID() },
      })
      const errors = result.data?.errors || []
      if (errors.length) {
        setBulkError(errors.map((error) => `Baris ${error.row}: ${error.message}`).join(' · '))
        return
      }
      setBulkError(null)
      toast.success(`Validasi server lulus untuk ${result.data?.created_count ?? bulkRows.length} menu; belum ada data yang disimpan`)
    } catch (err) {
      setBulkError(apiErrorMessage(err, 'Validasi server gagal'))
    } finally { setValidating(false) }
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
            {bulkRows.length > 0 && <div className="flex flex-wrap gap-2"><button onClick={validateBulkMenu} disabled={importing || validating} className="rounded-xl border border-orange-300 px-4 py-2 text-sm font-bold text-orange-800 disabled:opacity-60">{validating ? 'Memvalidasi…' : 'Validasi server'}</button><button onClick={importBulkMenu} disabled={importing || validating} className="rounded-xl bg-orange-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-60">{importing ? 'Mengimpor…' : `Impor ${bulkRows.length} menu`}</button></div>}
          </div>
          {bulkError ? <p className="mt-3 text-sm font-semibold text-red-700">{bulkError}</p> : <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[500px] text-left text-sm"><thead><tr className="text-xs uppercase text-orange-800"><th className="pb-2">Nama</th><th className="pb-2">Harga</th><th className="pb-2">Kategori</th><th className="pb-2">Prep</th></tr></thead><tbody>{bulkRows.slice(0, 10).map((row, index) => <tr key={`${row.nama}-${index}`} className="border-t border-orange-200"><td className="py-2 font-semibold">{row.nama}</td><td className="py-2">{rupiah(row.harga)}</td><td className="py-2">{row.kategori}</td><td className="py-2">{row.prep_time_minutes} menit</td></tr>)}</tbody></table>{bulkRows.length > 10 && <p className="mt-2 text-xs text-orange-800">Menampilkan 10 dari {bulkRows.length} baris.</p>}</div>}
        </section>
      )}

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              {readiness?.ready ? <CheckCircle2 className="h-5 w-5 text-emerald-700" /> : <AlertTriangle className="h-5 w-5 text-orange-600" />}
              <h2 className="font-black text-zinc-900">Kesiapan katalog pelanggan</h2>
            </div>
            <p className="mt-1 text-sm text-zinc-500">
              {readiness ? `Versi edit ${readiness.catalog_version} · ${readiness.item_count} menu siap` : 'Memeriksa data menu…'}
            </p>
            {!readiness?.ready && readiness?.blocking_reasons?.length ? (
              <ul className="mt-3 space-y-1 text-sm text-orange-800">{readiness.blocking_reasons.map((reason) => <li key={reason}>• {reason}</li>)}</ul>
            ) : null}
          </div>
          <button onClick={publishCatalog} disabled={!readiness?.ready || publishing} className="inline-flex items-center gap-2 rounded-xl bg-emerald-900 px-4 py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">
            <UploadCloud className="h-4 w-4" /> {publishing ? 'Mempublikasikan…' : 'Publikasikan ke pelanggan'}
          </button>
        </div>
        <div className="mt-4 flex flex-wrap gap-3 text-xs text-zinc-500">
          <span className="rounded-full bg-zinc-100 px-3 py-1.5">Terbit ke pelanggan: {readiness?.published_version ? `versi ${readiness.published_version}` : 'belum ada'}</span>
          <span className="rounded-full bg-zinc-100 px-3 py-1.5">Perubahan baru tidak tampil sebelum diterbitkan</span>
        </div>
        {publications.length > 1 && (
          <div className="mt-4 border-t border-zinc-100 pt-4">
            <p className="text-xs font-black uppercase tracking-wide text-zinc-400">Riwayat publikasi</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {publications.slice(1).map((publication) => (
                <button key={publication.id} onClick={() => rollbackCatalog(publication)} disabled={rollingBack} className="inline-flex items-center gap-2 rounded-full border border-zinc-200 px-3 py-1.5 text-xs font-bold text-zinc-600 hover:border-orange-300 hover:text-orange-700 disabled:opacity-50">
                  <RotateCcw className="h-3.5 w-3.5" /> Kembalikan versi {publication.publication_version}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-wide text-emerald-700">Pengaturan per outlet</p>
            <h2 className="mt-1 font-black text-emerald-950">Harga dan ketersediaan mengikuti outlet aktif</h2>
            <p className="mt-1 text-sm text-emerald-900/70">Katalog pusat tetap menjadi dasar. Kosongkan harga atau pilih “Ikuti katalog” untuk menghapus override outlet.</p>
          </div>
          <span className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-emerald-900">{activeBranch?.name || 'Outlet belum dipilih'}</span>
        </div>
      </section>

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
              <details className="mt-3 border-t border-zinc-100 pt-3">
                <summary className="cursor-pointer text-xs font-black text-emerald-900">Atur outlet {activeBranch?.name || ''}</summary>
                <div className="mt-3 space-y-3 rounded-xl bg-zinc-50 p-3">
                  <p className="text-xs text-zinc-500">Harga katalog: <span className="font-bold text-zinc-700">{rupiah(item.harga)}</span></p>
                  <label className="block text-xs font-bold text-zinc-600">Harga outlet
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder={String(item.harga)}
                      value={overrideDrafts[item.id]?.price ?? ''}
                      onChange={(event) => setOverrideDrafts((prev) => ({ ...prev, [item.id]: { ...(prev[item.id] || { availability: 'inherit' }), price: event.target.value } }))}
                      className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-normal outline-none focus:border-emerald-700"
                    />
                  </label>
                  <label className="block text-xs font-bold text-zinc-600">Ketersediaan outlet
                    <select
                      value={overrideDrafts[item.id]?.availability ?? 'inherit'}
                      onChange={(event) => setOverrideDrafts((prev) => ({ ...prev, [item.id]: { ...(prev[item.id] || { price: '' }), availability: event.target.value as 'inherit' | 'available' | 'unavailable' } }))}
                      className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-normal outline-none focus:border-emerald-700"
                    >
                      <option value="inherit">Ikuti katalog</option>
                      <option value="available">Tersedia di outlet</option>
                      <option value="unavailable">Tidak tersedia di outlet</option>
                    </select>
                  </label>
                  <button onClick={() => void saveOutletOverride(item)} disabled={!activeBranch || savingOverride === item.id} className="w-full rounded-lg bg-emerald-900 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">
                    {savingOverride === item.id ? 'Menyimpan…' : 'Simpan pengaturan outlet'}
                  </button>
                </div>
              </details>
            </div>
          ))}
        </div>
      )}

      {showEditor && <MenuEditor item={editing} onClose={() => setShowEditor(false)} onSaved={() => load()} />}
    </div>
  )
}
