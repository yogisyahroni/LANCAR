import { useEffect, useState } from 'react'
import { Check, Users, Save, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import { api, apiErrorMessage } from '../lib/api'
import type { Merchant, MerchantBranch, MerchantPortalContext, MerchantStaff } from '../lib/types'
import { MerchantPageSkeleton } from '../components/Skeleton'
import { loadMerchantPortalContext } from '../lib/portal-context'

const PERMISSIONS = [
  [1, 'Lihat toko'], [2, 'Kelola menu'], [4, 'Terima pesanan'], [8, 'Perbarui proses masak'],
  [16, 'Chat customer'], [32, 'Kelola staff'], [64, 'Lihat laporan'], [128, 'Kelola promo'],
] as const
const ROLES = [['manager', 'Manager'], ['cashier', 'Kasir'], ['kitchen', 'Kitchen'], ['marketing', 'Marketing'], ['finance', 'Finance']] as const
type StaffDraft = { role: string; permissions: number; branch_ids: string[] }

export default function Staff() {
  const [merchant, setMerchant] = useState<Merchant | null>(null)
  const [branches, setBranches] = useState<MerchantBranch[]>([])
  const [staff, setStaff] = useState<MerchantStaff[]>([])
  const [canManage, setCanManage] = useState(false)
  const [drafts, setDrafts] = useState<Record<string, StaffDraft>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [invite, setInvite] = useState({ email: '', role: 'cashier', branch_ids: [] as string[] })

  const load = async () => {
    const context: MerchantPortalContext = await loadMerchantPortalContext()
    setMerchant(context.merchant)
    setBranches(context.branches || [])
    const response = await api.get<{ data: MerchantStaff[]; can_manage?: boolean }>(`/merchant/staff/${context.merchant.id}`)
    const next = response.data?.data || []
    setStaff(next)
    setCanManage(response.data?.can_manage !== false)
    setDrafts(Object.fromEntries(next.map((person) => [person.id, { role: person.role, permissions: person.permissions || 0, branch_ids: person.branch_ids || [] }])))
    setInvite((current) => ({ ...current, branch_ids: current.branch_ids.length ? current.branch_ids : (context.branches || []).filter((branch) => branch.is_active).map((branch) => branch.id) }))
  }

  useEffect(() => { load().catch((err) => toast.error(apiErrorMessage(err, 'Gagal memuat staff'))).finally(() => setLoading(false)) }, [])

  const sendInvite = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!merchant || !invite.branch_ids.length) return toast.error('Pilih minimal satu outlet untuk staff')
    setSaving('new')
    try {
      await api.post(`/merchant/staff/${merchant.id}`, { email: invite.email, role: invite.role, branch_ids: invite.branch_ids }, { headers: { 'Idempotency-Key': crypto.randomUUID() } })
      setInvite({ email: '', role: 'cashier', branch_ids: branches.filter((branch) => branch.is_active).map((branch) => branch.id) })
      await load()
      toast.success('Undangan staff dikirim')
    } catch (err) { toast.error(apiErrorMessage(err, 'Gagal mengirim undangan')) } finally { setSaving(null) }
  }

  const save = async (person: MerchantStaff) => {
    if (!merchant) return
    const draft = drafts[person.id]
    if (!draft || !draft.branch_ids.length) return toast.error('Pilih minimal satu outlet untuk staff')
    setSaving(person.id)
    try {
      await api.patch(`/merchant/staff/${merchant.id}/${person.id}`, { role: draft.role, permissions: draft.permissions })
      await api.put(`/merchant/branches/${merchant.id}/staff/${person.id}`, { branch_ids: draft.branch_ids })
      await load()
      toast.success('Peran, hak akses, dan outlet staff disimpan')
    } catch (err) { toast.error(apiErrorMessage(err, 'Perubahan staff belum tersimpan')) } finally { setSaving(null) }
  }

  const setStatus = async (person: MerchantStaff, status: 'active' | 'revoked') => {
    if (!merchant) return
    if (status === 'revoked' && !window.confirm(`Cabut akses ${person.staff_name || person.staff_email || 'staff ini'}?`)) return
    setSaving(person.id)
    try { await api.patch(`/merchant/staff/${merchant.id}/${person.id}`, { status }); await load(); toast.success(status === 'revoked' ? 'Akses staff dicabut' : 'Akses staff diaktifkan') } catch (err) { toast.error(apiErrorMessage(err, 'Status staff belum dapat diubah')) } finally { setSaving(null) }
  }

  if (loading) return <MerchantPageSkeleton />
  if (!merchant || merchant.business_type !== 'perusahaan') return <div className="rounded-[1.75rem] border border-amber-200 bg-amber-50 p-10 text-center"><h1 className="text-xl font-black text-amber-900">Staff hanya untuk toko perusahaan</h1><p className="mt-2 text-sm text-amber-700">Toko perorangan tidak memiliki fitur manajemen staff.</p></div>

  return <div className="space-y-6">
    <div><h1 className="text-2xl font-black text-zinc-900">Staff dan hak akses</h1><p className="mt-1 max-w-2xl text-sm leading-relaxed text-zinc-500">Setiap orang memakai akun sendiri. Atur peran, kemampuan, dan outlet yang boleh diakses tanpa membagikan password pemilik.</p></div>
    {canManage && <form onSubmit={sendInvite} className="rounded-[1.75rem] border border-emerald-100 bg-emerald-50/60 p-6 shadow-sm"><div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-900 text-white"><UserPlus className="h-5 w-5" /></span><div><h2 className="font-black text-emerald-950">Undang staff</h2><p className="mt-1 text-xs text-emerald-900/70">Undangan sekali pakai dikirim melalui kontak yang terdaftar.</p></div></div><div className="mt-5 grid gap-3 md:grid-cols-3"><label className="text-sm font-bold text-zinc-700 md:col-span-2">Email<input required type="email" value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} className="mt-1.5 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 font-normal outline-none focus:border-emerald-900" /></label><label className="text-sm font-bold text-zinc-700">Peran<select value={invite.role} onChange={(e) => setInvite({ ...invite, role: e.target.value })} className="mt-1.5 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 font-normal">{ROLES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div><BranchPicker ids={invite.branch_ids} branches={branches} onChange={(ids) => setInvite({ ...invite, branch_ids: ids })} /><button disabled={saving !== null} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#003A20] px-5 py-3 text-sm font-bold text-white disabled:opacity-60"><UserPlus className="h-4 w-4" />{saving === 'new' ? 'Mengirim…' : 'Kirim undangan'}</button></form>}
    <section className="space-y-3"><div className="flex items-center justify-between"><h2 className="text-lg font-black text-zinc-900">Daftar staff</h2><span className="text-sm font-bold text-zinc-500">{staff.length} akun</span></div>{!staff.length ? <div className="rounded-2xl border border-dashed border-zinc-200 bg-white p-8 text-center text-sm text-zinc-500"><Users className="mx-auto mb-2 h-6 w-6 text-zinc-400" />Belum ada staff yang diundang.</div> : staff.map((person) => { const draft = drafts[person.id] || { role: person.role, permissions: person.permissions || 0, branch_ids: person.branch_ids || [] }; const busy = saving === person.id; return <article key={person.id} className="rounded-[1.5rem] border border-zinc-100 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-black text-zinc-900">{person.staff_name || person.staff_email || 'Undangan staff'}</p><p className="mt-1 text-xs text-zinc-500">{person.staff_email || 'Email tidak ditampilkan'} · {person.status === 'pending' ? 'Menunggu diterima' : person.status}</p></div><div className="flex items-center gap-2">{person.status === 'revoked' ? <button disabled={!canManage || busy} onClick={() => void setStatus(person, 'active')} className="rounded-xl border border-emerald-200 px-3 py-2 text-xs font-bold text-emerald-700 disabled:opacity-50">Aktifkan</button> : <button disabled={!canManage || busy} onClick={() => void setStatus(person, 'revoked')} className="rounded-xl border border-red-200 px-3 py-2 text-xs font-bold text-red-600 disabled:opacity-50">Cabut akses</button>}</div></div><div className="mt-4 grid gap-4 lg:grid-cols-2"><label className="text-xs font-bold text-zinc-500">Peran<select disabled={!canManage || busy} value={draft.role === 'kasir' ? 'cashier' : draft.role} onChange={(e) => setDrafts({ ...drafts, [person.id]: { ...draft, role: e.target.value } })} className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm font-normal"><option value="manager">Manager</option><option value="cashier">Kasir</option><option value="kitchen">Kitchen</option><option value="marketing">Marketing</option><option value="finance">Finance</option></select></label><div><p className="text-xs font-bold text-zinc-500">Outlet yang dapat diakses</p><BranchPicker ids={draft.branch_ids} branches={branches} disabled={!canManage || busy} onChange={(ids) => setDrafts({ ...drafts, [person.id]: { ...draft, branch_ids: ids } })} /></div></div><div className="mt-4"><p className="text-xs font-bold text-zinc-500">Hak akses</p><div className="mt-2 grid gap-2 sm:grid-cols-2">{PERMISSIONS.map(([bit, label]) => <label key={bit} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${draft.permissions & bit ? 'border-emerald-200 bg-emerald-50 text-emerald-950' : 'border-zinc-100 text-zinc-500'}`}><input type="checkbox" checked={Boolean(draft.permissions & bit)} disabled={!canManage || busy} onChange={() => setDrafts({ ...drafts, [person.id]: { ...draft, permissions: draft.permissions & bit ? draft.permissions & ~bit : draft.permissions | bit } })} className="h-4 w-4 accent-emerald-900" />{label}</label>)}</div></div>{canManage && <button disabled={busy} onClick={() => void save(person)} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#003A20] px-4 py-2.5 text-xs font-bold text-white disabled:opacity-60"><Save className="h-4 w-4" />{busy ? 'Menyimpan…' : 'Simpan perubahan'}</button>}</article> })}</section>
  </div>
}

function BranchPicker({ ids, branches, onChange, disabled = false }: { ids: string[]; branches: MerchantBranch[]; onChange: (ids: string[]) => void; disabled?: boolean }) {
  return <div className="mt-3 flex flex-wrap gap-2">{branches.filter((branch) => branch.is_active || ids.includes(branch.id)).map((branch) => { const selected = ids.includes(branch.id); return <button type="button" key={branch.id} disabled={disabled} onClick={() => onChange(selected ? ids.filter((id) => id !== branch.id) : [...ids, branch.id])} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition ${selected ? 'border-emerald-300 bg-emerald-100 text-emerald-900' : 'border-zinc-200 bg-white text-zinc-500 hover:border-emerald-200'} disabled:opacity-50`}><Check className={`h-3.5 w-3.5 ${selected ? 'opacity-100' : 'opacity-0'}`} />{branch.name}</button> })}</div>
}
