import { useEffect, useState } from 'react'
import { Building2, Loader2, Plus, Save, Store } from 'lucide-react'
import { toast } from 'sonner'
import { api, apiErrorMessage } from '../lib/api'
import { loadMerchantPortalContext } from '../lib/portal-context'
import type { Merchant, MerchantBranch } from '../lib/types'
import { MerchantPageSkeleton } from '../components/Skeleton'

type BranchDraft = { name: string; address: string }

export default function Outlets() {
  const [merchant, setMerchant] = useState<Merchant | null>(null)
  const [branches, setBranches] = useState<MerchantBranch[]>([])
  const [drafts, setDrafts] = useState<Record<string, BranchDraft>>({})
  const [newBranch, setNewBranch] = useState({ code: '', name: '', address: '' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)

  const load = async () => {
    const context = await loadMerchantPortalContext()
    setMerchant(context.merchant)
    const response = await api.get<{ data: MerchantBranch[] }>(`/merchant/branches/${context.merchant.id}`)
    const next = response.data?.data || []
    setBranches(next)
    setDrafts(Object.fromEntries(next.map((branch) => [branch.id, { name: branch.name, address: branch.address }])))
  }

  useEffect(() => {
    load().catch((err) => toast.error(apiErrorMessage(err, 'Gagal memuat outlet'))).finally(() => setLoading(false))
  }, [])

  const create = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!merchant) return
    setSaving('new')
    try {
      await api.post(`/merchant/branches/${merchant.id}`, newBranch, { headers: { 'Idempotency-Key': crypto.randomUUID() } })
      setNewBranch({ code: '', name: '', address: '' })
      await load()
      toast.success('Outlet berhasil ditambahkan')
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Outlet belum dapat ditambahkan'))
    } finally {
      setSaving(null)
    }
  }

  const save = async (branch: MerchantBranch) => {
    const draft = drafts[branch.id]
    if (!draft || !merchant) return
    setSaving(branch.id)
    try {
      await api.patch(`/merchant/branches/${merchant.id}/${branch.id}`, draft)
      await load()
      toast.success('Informasi outlet disimpan')
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Perubahan outlet belum tersimpan'))
    } finally {
      setSaving(null)
    }
  }

  const toggle = async (branch: MerchantBranch) => {
    if (!merchant) return
    const action = branch.is_active ? 'menonaktifkan' : 'mengaktifkan'
    if (!window.confirm(`Yakin ingin ${action} outlet ${branch.name}?`)) return
    setSaving(branch.id)
    try {
      await api.patch(`/merchant/branches/${merchant.id}/${branch.id}`, { is_active: !branch.is_active })
      await load()
      toast.success(branch.is_active ? 'Outlet dinonaktifkan' : 'Outlet diaktifkan')
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Status outlet belum dapat diubah'))
    } finally {
      setSaving(null)
    }
  }

  if (loading) return <MerchantPageSkeleton />
  if (!merchant) return <p className="rounded-2xl border border-zinc-100 bg-white p-8 text-center text-sm text-zinc-500">Profil bisnis tidak dapat dimuat.</p>

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black tracking-tight text-zinc-900">Outlet bisnis</h1>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-zinc-500">Kelola alamat dan status setiap lokasi. Data pesanan, menu, laporan, dan akses staff mengikuti outlet yang dipilih.</p>
      </div>

      <form onSubmit={create} className="rounded-[1.75rem] border border-emerald-100 bg-emerald-50/60 p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-900 text-white"><Plus className="h-5 w-5" /></span>
          <div><h2 className="font-black text-emerald-950">Tambah outlet</h2><p className="mt-1 text-xs text-emerald-900/70">Outlet baru dibuat aktif setelah berhasil disimpan. Pastikan alamat dapat ditemukan kurir.</p></div>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <label className="text-sm font-bold text-zinc-700">Kode outlet<input required maxLength={32} value={newBranch.code} onChange={(e) => setNewBranch({ ...newBranch, code: e.target.value.toUpperCase() })} placeholder="JKT-02" className="mt-1.5 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 font-normal outline-none focus:border-emerald-900" /></label>
          <label className="text-sm font-bold text-zinc-700">Nama outlet<input required maxLength={120} value={newBranch.name} onChange={(e) => setNewBranch({ ...newBranch, name: e.target.value })} placeholder="Soto Ayam Gandaria" className="mt-1.5 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 font-normal outline-none focus:border-emerald-900" /></label>
          <label className="text-sm font-bold text-zinc-700 md:col-span-1">Alamat lengkap<input required maxLength={500} value={newBranch.address} onChange={(e) => setNewBranch({ ...newBranch, address: e.target.value })} placeholder="Jl. ..." className="mt-1.5 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 font-normal outline-none focus:border-emerald-900" /></label>
        </div>
        <button disabled={saving !== null} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#003A20] px-5 py-3 text-sm font-bold text-white transition hover:bg-emerald-950 disabled:opacity-60"><Plus className="h-4 w-4" />{saving === 'new' ? 'Menyimpan…' : 'Simpan outlet'}</button>
      </form>

      <section className="space-y-3">
        <div className="flex items-center justify-between"><h2 className="text-lg font-black text-zinc-900">Daftar outlet</h2><span className="text-sm font-bold text-zinc-500">{branches.length} lokasi</span></div>
        {!branches.length ? <div className="rounded-2xl border border-dashed border-zinc-200 bg-white p-8 text-center text-sm text-zinc-500">Belum ada outlet. Tambahkan lokasi pertama di atas.</div> : branches.map((branch) => {
          const draft = drafts[branch.id] || { name: branch.name, address: branch.address }
          const busy = saving === branch.id
          return <article key={branch.id} className="rounded-[1.5rem] border border-zinc-100 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-3"><span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${branch.is_active ? 'bg-emerald-100 text-emerald-900' : 'bg-zinc-100 text-zinc-500'}`}><Store className="h-5 w-5" /></span><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-black text-zinc-900">{branch.name}</h3><span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${branch.is_active ? 'bg-emerald-100 text-emerald-800' : 'bg-zinc-100 text-zinc-600'}`}>{branch.is_active ? 'Aktif' : 'Nonaktif'}</span></div><p className="mt-1 text-xs font-bold uppercase tracking-wide text-zinc-400">{branch.code}</p></div></div>
              <button type="button" onClick={() => void toggle(branch)} disabled={busy || branches.length === 1 && branch.is_active} className="rounded-xl border border-zinc-200 px-3 py-2 text-xs font-bold text-zinc-700 transition hover:border-emerald-300 disabled:cursor-not-allowed disabled:opacity-50">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : branch.is_active ? 'Nonaktifkan' : 'Aktifkan'}</button>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2"><label className="text-xs font-bold text-zinc-500">Nama outlet<input value={draft.name} onChange={(e) => setDrafts({ ...drafts, [branch.id]: { ...draft, name: e.target.value } })} className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm font-normal outline-none focus:border-emerald-900" /></label><label className="text-xs font-bold text-zinc-500">Alamat<input value={draft.address} onChange={(e) => setDrafts({ ...drafts, [branch.id]: { ...draft, address: e.target.value } })} className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm font-normal outline-none focus:border-emerald-900" /></label></div>
            <div className="mt-4 flex items-center justify-between gap-3 border-t border-zinc-100 pt-4"><p className="flex items-center gap-2 text-xs text-zinc-500"><Building2 className="h-4 w-4" /> Perubahan dicatat di server</p><button type="button" onClick={() => void save(branch)} disabled={busy || saving === 'new'} className="inline-flex items-center gap-2 rounded-xl bg-[#003A20] px-4 py-2.5 text-xs font-bold text-white disabled:opacity-60"><Save className="h-4 w-4" /> Simpan perubahan</button></div>
          </article>
        })}
      </section>
    </div>
  )
}
