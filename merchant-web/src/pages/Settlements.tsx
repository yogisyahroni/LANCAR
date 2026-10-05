import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, FileText, Landmark, Pencil, RefreshCw, ShieldCheck, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import { api, apiErrorMessage } from '../lib/api'
import type { Merchant, MerchantFinanceStatement, MerchantPortalContext, SettlementSummary, WithdrawalRecord } from '../lib/types'
import { rupiah } from '../lib/types'
import { MerchantPageSkeleton } from '../components/Skeleton'
import { loadMerchantPortalContext } from '../lib/portal-context'

export default function Settlements() {
  const [summary, setSummary] = useState<SettlementSummary | null>(null)
  const [statement, setStatement] = useState<MerchantFinanceStatement | null>(null)
  const [withdrawals, setWithdrawals] = useState<WithdrawalRecord[]>([])
  const [merchant, setMerchant] = useState<Merchant | null>(null)
  const [loading, setLoading] = useState(true)
  const [amount, setAmount] = useState('')
  const [bank, setBank] = useState({ name: '', number: '', holder: '' })
  const [accountDraft, setAccountDraft] = useState({ name: '', number: '', holder: '' })
  const [approvalId, setApprovalId] = useState('')
  const [accountApprovalId, setAccountApprovalId] = useState('')
  const [approvalLoading, setApprovalLoading] = useState(false)
  const [accountApprovalLoading, setAccountApprovalLoading] = useState(false)
  const [accountSaving, setAccountSaving] = useState(false)
  const [saving, setSaving] = useState(false)

  const load = async () => {
    const context: MerchantPortalContext = await loadMerchantPortalContext()
    setMerchant(context.merchant)
    setAccountDraft({
      name: context.merchant.bank_name || '',
      number: context.merchant.bank_account_number || '',
      holder: context.merchant.bank_account_holder || '',
    })
    const [settlementResponse, withdrawalResponse, statementResponse] = await Promise.all([
      api.get<SettlementSummary>('/merchant/settlements'),
      api.get<WithdrawalRecord[]>('/merchant/withdrawals'),
      api.get<MerchantFinanceStatement>('/merchant/finance-statement?limit=100'),
    ])
    setSummary(settlementResponse.data)
    setWithdrawals(withdrawalResponse.data || [])
    setStatement(statementResponse.data)
  }

  useEffect(() => { load().catch((err) => toast.error(apiErrorMessage(err, 'Gagal memuat keuangan'))).finally(() => setLoading(false)) }, [])

  const requestApproval = async () => {
    if (!merchant) return
    setApprovalLoading(true)
    try {
      const response = await api.post<{ data?: { id?: string; status?: string } }>(`/merchant/security-approvals/${merchant.id}`, { change_type: 'payout', idempotency_key: crypto.randomUUID() })
      const id = response.data?.data?.id
      if (id) setApprovalId(id)
      toast.success(id ? 'Permintaan persetujuan dibuat. Berikan ID ini ke Admin.' : 'Permintaan persetujuan dibuat')
    } catch (err) { toast.error(apiErrorMessage(err, 'Persetujuan payout belum dapat dibuat')) } finally { setApprovalLoading(false) }
  }

  const withdraw = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!approvalId.trim()) return toast.error('ID persetujuan Admin wajib diisi')
    setSaving(true)
    try {
      await api.post('/merchant/withdraw', { amount_idr: Number(amount), bank_name: bank.name, bank_account_number: bank.number, bank_account_holder: bank.holder, approval_id: approvalId.trim(), idempotency_key: crypto.randomUUID() })
      toast.success('Permintaan pencairan diterima untuk diproses')
      setAmount('')
      await load()
    } catch (err) { toast.error(apiErrorMessage(err, 'Pencairan belum dapat diajukan')) } finally { setSaving(false) }
  }

  const requestBankAccountApproval = async () => {
    if (!merchant) return
    setAccountApprovalLoading(true)
    try {
      const response = await api.post<{ data?: { id?: string; status?: string } }>(`/merchant/security-approvals/${merchant.id}`, { change_type: 'bank_account', idempotency_key: crypto.randomUUID() })
      const id = response.data?.data?.id
      if (id) setAccountApprovalId(id)
      toast.success(id ? 'Permintaan perubahan rekening dibuat. Berikan ID ini ke Admin.' : 'Permintaan perubahan rekening dibuat')
    } catch (err) { toast.error(apiErrorMessage(err, 'Persetujuan perubahan rekening belum dapat dibuat')) } finally { setAccountApprovalLoading(false) }
  }

  const updateBankAccount = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!accountApprovalId.trim()) return toast.error('ID persetujuan Admin wajib diisi')
    setAccountSaving(true)
    try {
      await api.put('/merchant/bank-account', {
        bank_name: accountDraft.name,
        bank_account_number: accountDraft.number,
        bank_account_holder: accountDraft.holder,
        approval_id: accountApprovalId.trim(),
        idempotency_key: crypto.randomUUID(),
      })
      toast.success('Perubahan rekening tersimpan dan menunggu verifikasi ulang')
      setAccountApprovalId('')
      await load()
    } catch (err) { toast.error(apiErrorMessage(err, 'Perubahan rekening belum dapat disimpan')) } finally { setAccountSaving(false) }
  }

  if (loading) return <MerchantPageSkeleton />
  return <div className="space-y-6">
    <div><h1 className="text-2xl font-black text-zinc-900">Keuangan dan pencairan</h1><p className="mt-1 text-sm text-zinc-500">Saldo dan riwayat pencairan diambil dari catatan transaksi server. Pencairan tidak dianggap berhasil sebelum status penyedia dan catatan keuangan berubah.</p></div>
    <div className="grid gap-4 sm:grid-cols-3"><Stat label="Bisa ditarik" value={rupiah(summary?.available_idr || 0)} accent /><Stat label="Sudah cair" value={rupiah(summary?.total_idr || 0)} /><Stat label="Ditahan / proses" value={rupiah(summary?.holding_idr || 0)} /></div>
    <section className="rounded-[1.75rem] border border-zinc-100 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3"><Landmark className="mt-0.5 h-5 w-5 text-emerald-800" /><div><h2 className="font-black">Rekening pencairan</h2><p className="mt-1 text-sm text-zinc-500">Nomor rekening disamarkan. Perubahan rekening memerlukan verifikasi keamanan dan persetujuan terpisah.</p></div></div>
        <span className={`rounded-full px-3 py-1 text-xs font-bold ${merchant?.bank_account_verified ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>{merchant?.bank_account_verified ? 'Terverifikasi' : 'Perlu verifikasi'}</span>
      </div>
      {merchant?.bank_name ? <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3"><div><p className="text-xs text-zinc-400">Bank</p><p className="mt-1 font-bold text-zinc-800">{merchant.bank_name}</p></div><div><p className="text-xs text-zinc-400">Nomor rekening</p><p className="mt-1 font-bold text-zinc-800">{maskAccount(merchant.bank_account_number)}</p></div><div><p className="text-xs text-zinc-400">Nama pemilik</p><p className="mt-1 font-bold text-zinc-800">{merchant.bank_account_holder || '—'}</p></div></div> : <p className="mt-4 rounded-xl border border-dashed border-zinc-200 px-4 py-3 text-sm text-zinc-500">Rekening pencairan belum tersimpan.</p>}
      <form onSubmit={updateBankAccount} className="mt-5 grid gap-3 border-t border-zinc-100 pt-5 sm:grid-cols-2">
        <div className="sm:col-span-2"><h3 className="flex items-center gap-2 text-sm font-black text-zinc-800"><Pencil className="h-4 w-4 text-emerald-800" /> Ubah rekening pencairan</h3><p className="mt-1 text-xs leading-relaxed text-zinc-500">Perubahan hanya dapat dilakukan pemilik usaha. Sesi keamanan, persetujuan Admin, dan verifikasi rekening akan dicek server.</p></div>
        <label className="text-sm font-bold">Nama bank<input required value={accountDraft.name} onChange={(e) => setAccountDraft({ ...accountDraft, name: e.target.value })} className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-3 font-normal" /></label>
        <label className="text-sm font-bold">Nomor rekening<input required value={accountDraft.number} onChange={(e) => setAccountDraft({ ...accountDraft, number: e.target.value.replace(/\D/g, '') })} inputMode="numeric" autoComplete="off" className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-3 font-normal" /></label>
        <label className="text-sm font-bold sm:col-span-2">Nama pemilik rekening<input required value={accountDraft.holder} onChange={(e) => setAccountDraft({ ...accountDraft, holder: e.target.value })} className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-3 font-normal" /></label>
        <button type="button" onClick={() => void requestBankAccountApproval()} disabled={accountApprovalLoading} className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-900 disabled:opacity-60">{accountApprovalLoading ? 'Membuat permintaan…' : 'Minta persetujuan perubahan'}</button>
        <label className="text-sm font-bold">ID persetujuan Admin<input required value={accountApprovalId} onChange={(e) => setAccountApprovalId(e.target.value)} placeholder="Tempel ID setelah disetujui" className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-3 font-normal" /></label>
        <button disabled={accountSaving} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#003A20] px-5 py-3 text-sm font-bold text-white disabled:opacity-60 sm:col-span-2"><Pencil className="h-4 w-4" />{accountSaving ? 'Menyimpan…' : 'Simpan rekening baru'}</button>
      </form>
    </section>
    <section className="rounded-[1.75rem] border border-amber-200 bg-amber-50 p-5"><div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" /><div><h2 className="font-black text-amber-950">Pencairan dilindungi persetujuan</h2><p className="mt-1 text-sm leading-relaxed text-amber-900/80">Sesi 2FA dan persetujuan Admin diperlukan. Minta persetujuan, tunggu sampai disetujui, lalu masukkan ID persetujuan pada formulir.</p><button type="button" onClick={() => void requestApproval()} disabled={approvalLoading} className="mt-3 inline-flex items-center gap-2 rounded-xl border border-amber-300 bg-white px-4 py-2.5 text-xs font-bold text-amber-900 disabled:opacity-60">{approvalLoading ? 'Membuat permintaan…' : 'Minta persetujuan pencairan'}</button></div></div></section>
    <form onSubmit={withdraw} className="grid gap-4 rounded-[1.75rem] border border-zinc-100 bg-white p-6 shadow-sm md:grid-cols-2"><div className="md:col-span-2"><h2 className="font-black">Ajukan pencairan</h2><p className="mt-1 text-xs text-zinc-500">Nominal minimum Rp10.000 dan maksimum Rp50.000.000 per permintaan.</p></div><label className="text-sm font-bold">Nominal<input required type="number" min="10000" max="50000000" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Nominal IDR" className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-3 font-normal" /></label><label className="text-sm font-bold">Nama bank<input required value={bank.name} onChange={(e) => setBank({ ...bank, name: e.target.value })} className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-3 font-normal" /></label><label className="text-sm font-bold">Nomor rekening<input required value={bank.number} onChange={(e) => setBank({ ...bank, number: e.target.value.replace(/\D/g, '') })} inputMode="numeric" className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-3 font-normal" /></label><label className="text-sm font-bold">Nama pemilik rekening<input required value={bank.holder} onChange={(e) => setBank({ ...bank, holder: e.target.value })} className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-3 font-normal" /></label><label className="text-sm font-bold md:col-span-2">ID persetujuan Admin<input required value={approvalId} onChange={(e) => setApprovalId(e.target.value)} placeholder="Tempel ID setelah disetujui" className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-3 font-normal" /></label><button disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#003A20] px-5 py-3 font-bold text-white disabled:opacity-60 md:col-span-2"><Wallet className="h-4 w-4" />{saving ? 'Memproses…' : 'Ajukan pencairan'}</button></form>
    <section className="rounded-[1.75rem] border border-zinc-100 bg-white p-6 shadow-sm"><h2 className="font-black">Riwayat settlement</h2>{!summary?.records?.length ? <p className="py-8 text-sm text-zinc-400">Belum ada settlement.</p> : <div className="mt-4 divide-y divide-zinc-100">{summary.records.map((record) => <div key={record.id} className="flex flex-wrap justify-between gap-2 py-3 text-sm"><span><b>{rupiah(record.net_payout_idr)}</b><span className="ml-2 text-zinc-400">{new Date(record.created_at).toLocaleDateString('id-ID')}</span></span><span className="font-bold text-zinc-500">{record.status}</span></div>)}</div>}</section>
    <section className="rounded-[1.75rem] border border-zinc-100 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3"><div className="flex items-start gap-3"><FileText className="mt-0.5 h-5 w-5 text-emerald-800" /><div><h2 className="font-black">Catatan transaksi</h2><p className="mt-1 text-sm text-zinc-500">Ringkasan berasal dari catatan keuangan server dan dipisahkan menurut jenis transaksi.</p></div></div><button type="button" onClick={() => void load().catch((err) => toast.error(apiErrorMessage(err, 'Gagal memuat catatan keuangan')))} className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 px-3 py-2 text-xs font-bold text-zinc-700"><RefreshCw className="h-3.5 w-3.5" /> Muat ulang</button></div>
      {!statement?.entries?.length ? <p className="mt-5 rounded-xl border border-dashed border-zinc-200 px-4 py-5 text-sm text-zinc-500">Belum ada catatan transaksi.</p> : <div className="mt-4 divide-y divide-zinc-100">{statement.entries.slice(0, 12).map((entry) => <div key={entry.id} className="flex flex-wrap justify-between gap-3 py-3 text-sm"><div><p className="font-bold text-zinc-800">{entry.description || entry.entry_type}</p><p className="mt-0.5 text-xs text-zinc-400">{new Date(entry.occurred_at).toLocaleString('id-ID')} · {entry.status || 'tercatat'}</p></div><span className={`font-black ${entry.signed_amount_minor < 0 ? 'text-orange-700' : 'text-emerald-800'}`}>{entry.signed_amount_minor < 0 ? '-' : '+'}{rupiah(Math.abs(entry.signed_amount_minor))}</span></div>)}</div>}
      {statement?.discrepancies?.length ? <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4"><div className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 text-amber-700" /><div><p className="text-sm font-bold text-amber-950">Ada {statement.discrepancies.length} pencocokan yang perlu ditinjau</p><p className="mt-1 text-xs leading-relaxed text-amber-900/80">Nilai tidak diubah oleh halaman ini. Tim operasional perlu meninjau referensi dan menyelesaikannya dari alur rekonsiliasi.</p></div></div></div> : null}
    </section>
    <section className="rounded-[1.75rem] border border-zinc-100 bg-white p-6 shadow-sm"><h2 className="font-black">Riwayat pencairan</h2>{!withdrawals.length ? <p className="py-8 text-sm text-zinc-400">Belum ada permintaan pencairan.</p> : <div className="divide-y divide-zinc-100">{withdrawals.map((item) => <div key={item.id} className="flex items-center justify-between gap-3 py-3 text-sm"><span>{rupiah(item.amount_idr)} · {item.bank_name}</span><span className="inline-flex items-center gap-1 font-bold text-zinc-600">{item.status === 'completed' && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}{item.status}</span></div>)}</div>}</section>
  </div>
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) { return <div className={`rounded-2xl border p-5 shadow-sm ${accent ? 'border-orange-200 bg-orange-50' : 'border-zinc-100 bg-white'}`}><p className="text-xs font-bold uppercase tracking-wide text-zinc-400">{label}</p><p className="mt-2 text-xl font-black text-emerald-950">{value}</p></div> }

function maskAccount(value?: string | null) {
  const digits = String(value || '').replace(/\D/g, '')
  if (!digits) return 'Belum tersedia'
  return `•••• ${digits.slice(-4)}`
}
