import { useMemo, useState } from 'react'
import { CheckCircle2, Clock3, Percent, Plus, ShieldCheck, XCircle } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '../lib/api'
import { createClientId } from '../lib/clientId'
import { AdminPageSkeleton } from '../components/ui/Skeleton'
import { cn } from '../lib/utils'

type ContractStatus = 'draft' | 'approved' | 'retired'

type MerchantCommissionContract = {
  id: string
  merchant_id: string
  market_code: string
  service_code: string
  contract_version: string
  commission_basis: string
  commission_percent: number
  fixed_fee_idr: number
  effective_from: string
  effective_to: string | null
  status: ContractStatus
  approval_reference?: string | null
  approved_by?: string | null
  approved_at?: string | null
  metadata?: Record<string, unknown>
  created_at: string
}

const today = () => new Date().toISOString().slice(0, 10)
const plusDays = (days: number) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10)
const inputClass = 'mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40'

export default function MerchantCommissionContracts() {
  const queryClient = useQueryClient()
  const [form, setForm] = useState({
    merchant_id: '',
    contract_version: 'food-intro-2026-01',
    commission_percent: '5',
    effective_from: today(),
    effective_to: plusDays(90),
    program_code: 'new_merchant_intro',
    completed_order_cap: '100',
    fallback_commission_percent: '15',
    program_label: 'Program merchant baru — 5% untuk 90 hari atau 100 pesanan selesai',
    totp: '',
  })

  const contracts = useQuery({
    queryKey: ['merchant-commission-contracts'],
    queryFn: async () => {
      const response = await api.get<{ data: MerchantCommissionContract[] }>('/admin/finance/merchant-commission-contracts')
      return response.data.data || []
    },
  })

  const create = useMutation({
    mutationFn: async () => {
      const response = await api.post('/admin/finance/merchant-commission-contracts', {
        merchant_id: form.merchant_id.trim(),
        market_code: 'ID-JK',
        service_code: 'food_delivery',
        contract_version: form.contract_version.trim(),
        commission_basis: 'item_subtotal',
        commission_percent: Number(form.commission_percent),
        fixed_fee_idr: 0,
        effective_from: `${form.effective_from}T00:00:00.000Z`,
        effective_to: form.effective_to ? `${form.effective_to}T00:00:00.000Z` : null,
        metadata: form.program_code === 'new_merchant_intro' ? {
          program_code: form.program_code,
          completed_order_cap: Number(form.completed_order_cap),
          fallback_commission_percent: Number(form.fallback_commission_percent),
          program_label: form.program_label.trim(),
        } : { program_code: 'standard', program_label: 'Tarif standar merchant food' },
      }, {
        headers: { 'x-totp-code': form.totp.trim(), 'X-Idempotency-Key': createClientId('merchant-commission-create') },
      })
      return response.data
    },
    onSuccess: () => {
      toast.success('Draft tarif merchant dibuat. Minta Admin lain melakukan approval.')
      setForm((current) => ({ ...current, totp: '', contract_version: `food-intro-${new Date().toISOString().slice(0, 10)}` }))
      void queryClient.invalidateQueries({ queryKey: ['merchant-commission-contracts'] })
    },
    onError: (error: any) => toast.error(error.response?.data?.error || 'Draft tarif belum dapat dibuat'),
  })

  const approve = useMutation({
    mutationFn: async ({ id, totp, reference }: { id: string; totp: string; reference: string }) => api.post(`/admin/finance/merchant-commission-contracts/${id}/approve`, { approval_reference: reference }, { headers: { 'x-totp-code': totp, 'X-Idempotency-Key': createClientId(`merchant-commission-approve-${id}`) } }),
    onSuccess: () => { toast.success('Tarif disetujui dan mulai berlaku sesuai tanggal efektif'); void queryClient.invalidateQueries({ queryKey: ['merchant-commission-contracts'] }) },
    onError: (error: any) => toast.error(error.response?.data?.error || 'Approval tarif gagal'),
  })

  const retire = useMutation({
    mutationFn: async ({ id, totp, reference }: { id: string; totp: string; reference: string }) => api.post(`/admin/finance/merchant-commission-contracts/${id}/retire`, { change_reference: reference }, { headers: { 'x-totp-code': totp, 'X-Idempotency-Key': createClientId(`merchant-commission-retire-${id}`) } }),
    onSuccess: () => { toast.success('Tarif dihentikan'); void queryClient.invalidateQueries({ queryKey: ['merchant-commission-contracts'] }) },
    onError: (error: any) => toast.error(error.response?.data?.error || 'Tarif belum dapat dihentikan'),
  })

  const sortedContracts = useMemo(() => [...(contracts.data || [])].sort((a, b) => b.created_at.localeCompare(a.created_at)), [contracts.data])
  const update = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }))
  const askApproval = (item: MerchantCommissionContract) => {
    const totp = window.prompt('Masukkan kode TOTP Admin untuk approval:')?.trim() || ''
    const reference = window.prompt('Masukkan referensi approval (tiket/keputusan):')?.trim() || ''
    if (totp && reference) approve.mutate({ id: item.id, totp, reference })
  }
  const askRetire = (item: MerchantCommissionContract) => {
    const totp = window.prompt('Masukkan kode TOTP Admin untuk menghentikan tarif:')?.trim() || ''
    const reference = window.prompt('Masukkan alasan/referensi penghentian:')?.trim() || ''
    if (totp && reference) retire.mutate({ id: item.id, totp, reference })
  }

  if (contracts.isLoading) return <AdminPageSkeleton />

  return <div className="space-y-6">
    <div>
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-foreground-muted">Keuangan · kebijakan merchant</p>
      <h1 className="mt-1 flex items-center gap-3 text-2xl font-black text-foreground"><Percent className="text-primary" aria-hidden="true" /> Tarif komisi merchant food</h1>
      <p className="mt-2 max-w-4xl text-sm leading-relaxed text-foreground-muted">Atur tarif per merchant dengan tanggal berlaku dan riwayat yang tidak berubah. Tarif intro yang direkomendasikan adalah 5% selama 90 hari atau 100 pesanan makanan selesai, mana yang lebih dulu; setelah itu server memakai tarif standar 15%.</p>
    </div>

    <section className="rounded-3xl border border-border bg-surface/[0.03] p-6 shadow-sm">
      <div className="flex items-start gap-3"><div className="rounded-2xl bg-primary/10 p-3 text-primary"><Plus className="h-5 w-5" aria-hidden="true" /></div><div><h2 className="font-black text-foreground">Buat draft tarif</h2><p className="mt-1 text-sm text-foreground-muted">Draft belum memengaruhi order. Approval maker-checker dan TOTP diperlukan sebelum tarif dipakai.</p></div></div>
      <div className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <label className="text-sm font-bold text-foreground">Merchant ID<input className={inputClass} value={form.merchant_id} onChange={(e) => update('merchant_id', e.target.value)} placeholder="UUID merchant" /></label>
        <label className="text-sm font-bold text-foreground">Versi kontrak<input className={inputClass} value={form.contract_version} onChange={(e) => update('contract_version', e.target.value)} /></label>
        <label className="text-sm font-bold text-foreground">Program<select className={inputClass} value={form.program_code} onChange={(e) => update('program_code', e.target.value)}><option value="new_merchant_intro">Merchant baru</option><option value="standard">Tarif standar</option></select></label>
        <label className="text-sm font-bold text-foreground">Komisi saat ini (%)<input type="number" min="0" max="100" step="0.01" className={inputClass} value={form.commission_percent} onChange={(e) => update('commission_percent', e.target.value)} /></label>
        <label className="text-sm font-bold text-foreground">Mulai berlaku<input type="date" className={inputClass} value={form.effective_from} onChange={(e) => update('effective_from', e.target.value)} /></label>
        <label className="text-sm font-bold text-foreground">Berakhir pada<input type="date" className={inputClass} value={form.effective_to} onChange={(e) => update('effective_to', e.target.value)} /></label>
        {form.program_code === 'new_merchant_intro' && <>
          <label className="text-sm font-bold text-foreground">Batas pesanan selesai<input type="number" min="1" max="1000000" className={inputClass} value={form.completed_order_cap} onChange={(e) => update('completed_order_cap', e.target.value)} /></label>
          <label className="text-sm font-bold text-foreground">Tarif setelah program (%)<input type="number" min="0" max="100" step="0.01" className={inputClass} value={form.fallback_commission_percent} onChange={(e) => update('fallback_commission_percent', e.target.value)} /></label>
          <label className="text-sm font-bold text-foreground lg:col-span-1">Nama program<input className={inputClass} value={form.program_label} onChange={(e) => update('program_label', e.target.value)} /></label>
        </>}
        <label className="text-sm font-bold text-foreground md:col-span-2 lg:col-span-3">Kode TOTP pembuat draft<input type="password" inputMode="numeric" className={inputClass} value={form.totp} onChange={(e) => update('totp', e.target.value)} placeholder="Diperlukan oleh keamanan Admin" /></label>
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-3"><button type="button" disabled={create.isPending || !form.merchant_id.trim() || !form.totp.trim()} onClick={() => create.mutate()} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-on-primary disabled:opacity-60"><ShieldCheck className="h-4 w-4" aria-hidden="true" />{create.isPending ? 'Menyimpan…' : 'Simpan draft tarif'}</button><p className="text-xs text-foreground-muted">Nominal dan status order tetap ditentukan server; halaman ini hanya mengajukan kontrak.</p></div>
    </section>

    {contracts.isError ? <div className="rounded-3xl border border-error/30 bg-error-surface p-6 text-sm text-error">Daftar tarif belum dapat dimuat. Periksa sesi Admin dan permission finance.</div> : sortedContracts.length === 0 ? <div className="rounded-3xl border border-dashed border-border p-10 text-center text-sm text-foreground-muted">Belum ada kontrak tarif merchant.</div> : <div className="grid gap-4">{sortedContracts.map((item) => {
      const intro = item.metadata?.program_code === 'new_merchant_intro'
      const metadataCap = item.metadata?.completed_order_cap
      return <article key={item.id} className="rounded-3xl border border-border bg-surface/[0.03] p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><h2 className="font-black text-foreground">{item.merchant_id}</h2><span className={cn('inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold', item.status === 'approved' ? 'bg-success-surface text-success' : item.status === 'draft' ? 'bg-warning-surface text-warning' : 'bg-surface-subtle text-foreground-muted')}>{item.status === 'approved' ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> : item.status === 'draft' ? <Clock3 className="h-3.5 w-3.5" aria-hidden="true" /> : <XCircle className="h-3.5 w-3.5" aria-hidden="true" />}{item.status}</span></div><p className="mt-1 text-sm text-foreground-muted">{item.contract_version} · {intro ? 'Program merchant baru' : 'Tarif standar'} · {item.market_code}</p></div><p className="text-2xl font-black text-primary">{item.commission_percent}%</p></div>
        <div className="mt-4 grid gap-3 text-sm sm:grid-cols-4"><div><p className="text-xs text-foreground-muted">Berlaku mulai</p><p className="mt-1 font-bold text-foreground">{new Date(item.effective_from).toLocaleDateString('id-ID')}</p></div><div><p className="text-xs text-foreground-muted">Berakhir</p><p className="mt-1 font-bold text-foreground">{item.effective_to ? new Date(item.effective_to).toLocaleDateString('id-ID') : 'Tidak dibatasi'}</p></div><div><p className="text-xs text-foreground-muted">Batas order</p><p className="mt-1 font-bold text-foreground">{intro && metadataCap != null ? `${metadataCap} selesai` : '—'}</p></div><div><p className="text-xs text-foreground-muted">Dibuat</p><p className="mt-1 font-bold text-foreground">{new Date(item.created_at).toLocaleDateString('id-ID')}</p></div></div>
        {item.status === 'draft' && <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4"><button type="button" onClick={() => askApproval(item)} disabled={approve.isPending} className="rounded-xl bg-success px-4 py-2.5 text-sm font-bold text-on-success disabled:opacity-60">Approve dengan TOTP</button><p className="self-center text-xs text-foreground-muted">Approval harus dilakukan actor yang berwenang.</p></div>}
        {item.status === 'approved' && <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border pt-4"><p className="text-xs text-foreground-muted">Kontrak approved menjadi sumber snapshot order baru.</p><button type="button" onClick={() => askRetire(item)} disabled={retire.isPending} className="rounded-xl border border-error/40 px-4 py-2.5 text-sm font-bold text-error disabled:opacity-60">Hentikan tarif</button></div>}
      </article>
    })}</div>}
  </div>
}
