import { useEffect, useState } from 'react'
import { CheckCircle2, ShieldCheck, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import { api, apiErrorMessage } from '../lib/api'
import type { Merchant, MerchantPortalContext, SettlementSummary, WithdrawalRecord } from '../lib/types'
import { rupiah } from '../lib/types'
import { MerchantPageSkeleton } from '../components/Skeleton'
import { loadMerchantPortalContext } from '../lib/portal-context'

export default function Settlements() {
  const [summary, setSummary] = useState<SettlementSummary | null>(null)
  const [withdrawals, setWithdrawals] = useState<WithdrawalRecord[]>([])
  const [merchant, setMerchant] = useState<Merchant | null>(null)
  const [loading, setLoading] = useState(true)
  const [amount, setAmount] = useState('')
  const [bank, setBank] = useState({ name: '', number: '', holder: '' })
  const [approvalId, setApprovalId] = useState('')
  const [approvalLoading, setApprovalLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const load = async () => {
    const context: MerchantPortalContext = await loadMerchantPortalContext()
    setMerchant(context.merchant)
    const [settlementResponse, withdrawalResponse] = await Promise.all([
      api.get<SettlementSummary>('/merchant/settlements'),
      api.get<WithdrawalRecord[]>('/merchant/withdrawals'),
    ])
    setSummary(settlementResponse.data)
    setWithdrawals(withdrawalResponse.data || [])
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

  if (loading) return <MerchantPageSkeleton />
  return <div className="space-y-6">
    <div><h1 className="text-2xl font-black text-zinc-900">Keuangan dan pencairan</h1><p className="mt-1 text-sm text-zinc-500">Saldo dan riwayat pencairan diambil dari catatan transaksi server. Pencairan tidak dianggap berhasil sebelum status penyedia dan catatan keuangan berubah.</p></div>
    <div className="grid gap-4 sm:grid-cols-3"><Stat label="Bisa ditarik" value={rupiah(summary?.available_idr || 0)} accent /><Stat label="Sudah cair" value={rupiah(summary?.total_idr || 0)} /><Stat label="Ditahan / proses" value={rupiah(summary?.holding_idr || 0)} /></div>
    <section className="rounded-[1.75rem] border border-amber-200 bg-amber-50 p-5"><div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" /><div><h2 className="font-black text-amber-950">Pencairan dilindungi persetujuan</h2><p className="mt-1 text-sm leading-relaxed text-amber-900/80">Sesi 2FA dan persetujuan Admin diperlukan. Minta persetujuan, tunggu sampai disetujui, lalu masukkan ID persetujuan pada formulir.</p><button type="button" onClick={() => void requestApproval()} disabled={approvalLoading} className="mt-3 inline-flex items-center gap-2 rounded-xl border border-amber-300 bg-white px-4 py-2.5 text-xs font-bold text-amber-900 disabled:opacity-60">{approvalLoading ? 'Membuat permintaan…' : 'Minta persetujuan pencairan'}</button></div></div></section>
    <form onSubmit={withdraw} className="grid gap-4 rounded-[1.75rem] border border-zinc-100 bg-white p-6 shadow-sm md:grid-cols-2"><div className="md:col-span-2"><h2 className="font-black">Ajukan pencairan</h2><p className="mt-1 text-xs text-zinc-500">Nominal minimum Rp10.000 dan maksimum Rp50.000.000 per permintaan.</p></div><label className="text-sm font-bold">Nominal<input required type="number" min="10000" max="50000000" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Nominal IDR" className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-3 font-normal" /></label><label className="text-sm font-bold">Nama bank<input required value={bank.name} onChange={(e) => setBank({ ...bank, name: e.target.value })} className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-3 font-normal" /></label><label className="text-sm font-bold">Nomor rekening<input required value={bank.number} onChange={(e) => setBank({ ...bank, number: e.target.value.replace(/\D/g, '') })} inputMode="numeric" className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-3 font-normal" /></label><label className="text-sm font-bold">Nama pemilik rekening<input required value={bank.holder} onChange={(e) => setBank({ ...bank, holder: e.target.value })} className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-3 font-normal" /></label><label className="text-sm font-bold md:col-span-2">ID persetujuan Admin<input required value={approvalId} onChange={(e) => setApprovalId(e.target.value)} placeholder="Tempel ID setelah disetujui" className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-3 font-normal" /></label><button disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#003A20] px-5 py-3 font-bold text-white disabled:opacity-60 md:col-span-2"><Wallet className="h-4 w-4" />{saving ? 'Memproses…' : 'Ajukan pencairan'}</button></form>
    <section className="rounded-[1.75rem] border border-zinc-100 bg-white p-6 shadow-sm"><h2 className="font-black">Riwayat settlement</h2>{!summary?.records?.length ? <p className="py-8 text-sm text-zinc-400">Belum ada settlement.</p> : <div className="mt-4 divide-y divide-zinc-100">{summary.records.map((record) => <div key={record.id} className="flex flex-wrap justify-between gap-2 py-3 text-sm"><span><b>{rupiah(record.net_payout_idr)}</b><span className="ml-2 text-zinc-400">{new Date(record.created_at).toLocaleDateString('id-ID')}</span></span><span className="font-bold text-zinc-500">{record.status}</span></div>)}</div>}</section>
    <section className="rounded-[1.75rem] border border-zinc-100 bg-white p-6 shadow-sm"><h2 className="font-black">Riwayat pencairan</h2>{!withdrawals.length ? <p className="py-8 text-sm text-zinc-400">Belum ada permintaan pencairan.</p> : <div className="divide-y divide-zinc-100">{withdrawals.map((item) => <div key={item.id} className="flex items-center justify-between gap-3 py-3 text-sm"><span>{rupiah(item.amount_idr)} · {item.bank_name}</span><span className="inline-flex items-center gap-1 font-bold text-zinc-600">{item.status === 'completed' && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}{item.status}</span></div>)}</div>}</section>
  </div>
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) { return <div className={`rounded-2xl border p-5 shadow-sm ${accent ? 'border-orange-200 bg-orange-50' : 'border-zinc-100 bg-white'}`}><p className="text-xs font-bold uppercase tracking-wide text-zinc-400">{label}</p><p className="mt-2 text-xl font-black text-emerald-950">{value}</p></div> }
