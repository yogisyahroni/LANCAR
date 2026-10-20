import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Ban, BarChart3, CheckCircle2, FileCheck2, Gauge, Layers3, ShieldCheck, WalletCards } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '../../lib/api'

type Campaign = {
  id: string
  name: string
  merchant_id?: string
  status: string
  policy_status: string
  objective: string
  market_code: string
  budget?: { total_minor: number; daily_minor: number; spent_minor: number; currency: string; billing_model: string }
  creative?: { headline: string; alt_text: string }
  rejection_reason?: string
  suspension_reason?: string
}

const tabs = [
  ['overview', 'Ringkasan'], ['campaigns', 'Campaign'], ['moderation', 'Moderasi materi'],
  ['inventory', 'Slot & penempatan'], ['bid', 'Aturan bid & pacing'], ['invalid', 'Traffic tidak valid'],
  ['billing', 'Penagihan & kredit'], ['analytics', 'Analitik'], ['audit', 'Audit'],
] as const

const money = (value: unknown, currency = 'IDR') => `${currency} ${Number(value || 0).toLocaleString('id-ID')}`

export default function CommerceAds() {
  const [tab, setTab] = useState<(typeof tabs)[number][0]>('overview')
  const queryClient = useQueryClient()
  const campaignsQuery = useQuery({ queryKey: ['ads-admin-campaigns'], queryFn: async () => (await api.get('/admin/ads/campaigns?page=1&page_size=100')).data })
  const inventoryQuery = useQuery({ queryKey: ['ads-admin-inventory'], queryFn: async () => (await api.get('/admin/ads/inventory')).data })
  const auditQuery = useQuery({ queryKey: ['ads-admin-audit'], queryFn: async () => (await api.get('/admin/ads/audit')).data })
  const campaigns: Campaign[] = campaignsQuery.data?.items || []
  const active = useMemo(() => campaigns.filter((campaign) => campaign.status === 'active').length, [campaigns])
  const spend = useMemo(() => campaigns.reduce((sum, campaign) => sum + Number(campaign.budget?.spent_minor || 0), 0), [campaigns])

  const action = useMutation({
    mutationFn: async ({ id, action: actionName, payload }: { id: string; action: 'moderation' | 'suspend'; payload: Record<string, unknown> }) => api.post(`/admin/ads/campaigns/${id}/${actionName}`, payload),
    onSuccess: () => { toast.success('Perubahan Ads tersimpan dan diaudit'); queryClient.invalidateQueries({ queryKey: ['ads-admin-campaigns'] }); queryClient.invalidateQueries({ queryKey: ['ads-admin-audit'] }) },
    onError: (error: any) => toast.error(error?.response?.data?.error || 'Perubahan Ads gagal'),
  })

  return (
    <div className="w-full" aria-labelledby="commerce-ads-title">
      <div className="mx-auto max-w-7xl space-y-8">
        <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div><p className="text-xs font-black uppercase tracking-[0.22em] text-primary">Pengawasan iklan berbayar</p><h1 id="commerce-ads-title" className="mt-2 text-3xl font-black text-foreground">Commerce Ads</h1><p className="mt-2 max-w-3xl text-sm text-foreground-muted">Promo finansial tetap dibuat di Promo &amp; Kode Redeem. Halaman ini digunakan admin untuk meninjau materi, penempatan, anggaran, dan keamanan campaign iklan.</p></div>
          <div className="rounded-2xl border border-warning/40 bg-warning-surface px-4 py-3 text-sm text-warning" role="status">Perubahan berdampak luas. Setiap persetujuan dan penangguhan dicatat dalam audit.</div>
        </header>
        <nav className="flex gap-2 overflow-x-auto border-b border-border pb-2" aria-label="Commerce Ads navigation">{tabs.map(([key, label]) => <button key={key} type="button" onClick={() => setTab(key)} aria-current={tab === key ? 'page' : undefined} className={`whitespace-nowrap rounded-xl px-3 py-2 text-sm font-bold ${tab === key ? 'bg-primary text-on-primary' : 'text-foreground-muted hover:bg-surface-subtle'}`}>{label}</button>)}</nav>
        {(campaignsQuery.isLoading || inventoryQuery.isLoading) && <div className="rounded-2xl border border-border bg-surface p-6" role="status">Memuat data pengawasan iklan…</div>}
        {(campaignsQuery.isError || inventoryQuery.isError) && <div className="rounded-2xl border border-error bg-error-surface p-6 text-error" role="alert"><AlertTriangle className="mb-2 h-5 w-5" aria-hidden="true" />Data iklan tidak tersedia. Tampilan discovery harus tetap kembali ke hasil organik.</div>}
        {tab === 'overview' && <section className="grid gap-4 md:grid-cols-4" aria-label="Ringkasan metrik iklan"><Metric icon={Layers3} label="Total campaign" value={campaigns.length} /><Metric icon={CheckCircle2} label="Aktif" value={active} /><Metric icon={WalletCards} label="Pengeluaran" value={money(spend)} /><Metric icon={ShieldCheck} label="Zona terlindungi" value={inventoryQuery.data?.protected_global_bounds?.ad_free_zones?.length || 0} /></section>}
        {(tab === 'campaigns' || tab === 'moderation' || tab === 'billing' || tab === 'analytics') && <section className="overflow-hidden rounded-2xl border border-border bg-surface" aria-label="Daftar campaign iklan"><div className="border-b border-border p-5"><h2 className="text-xl font-black text-foreground">{tab === 'moderation' ? 'Antrean moderasi materi iklan' : tab === 'billing' ? 'Bukti penagihan dan saldo' : tab === 'analytics' ? 'Laporan iklan dan organik' : 'Kendali campaign'}</h2><p className="mt-1 text-sm text-foreground-muted">Akses admin dibatasi oleh layanan Ads dan setiap perubahan menghasilkan catatan audit.</p></div><div role="region" aria-label="Area tabel campaign iklan" tabIndex={0} className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="bg-surface-subtle text-xs uppercase tracking-wide text-foreground-muted"><tr><th scope="col" className="px-5 py-3">Campaign</th><th scope="col" className="px-5 py-3">Status</th><th scope="col" className="px-5 py-3">Kebijakan</th><th scope="col" className="px-5 py-3">Anggaran / terpakai</th><th scope="col" className="px-5 py-3">Tindakan</th></tr></thead><tbody className="divide-y divide-border">{campaigns.map((campaign) => <tr key={campaign.id}><td className="px-5 py-4"><div className="font-bold text-foreground">{campaign.name}</div><div className="text-xs text-foreground-muted">{campaign.id} · pasar {campaign.market_code}</div>{campaign.rejection_reason && <div className="mt-1 text-xs text-error">Ditolak: {campaign.rejection_reason}</div>}{campaign.suspension_reason && <div className="mt-1 text-xs text-error">Ditangguhkan: {campaign.suspension_reason}</div>}</td><td className="px-5 py-4"><span className="rounded-full bg-surface-subtle px-3 py-1 text-xs font-bold">{campaign.status}</span></td><td className="px-5 py-4">{campaign.policy_status || 'Menunggu'}<div className="text-xs text-foreground-muted">{campaign.creative?.alt_text ? 'Alt text tersedia' : 'Alt text belum tersedia'}</div></td><td className="px-5 py-4">{money(campaign.budget?.spent_minor, campaign.budget?.currency)}<div className="text-xs text-foreground-muted">batas {money(campaign.budget?.total_minor, campaign.budget?.currency)}</div></td><td className="px-5 py-4"><div className="flex flex-wrap gap-2"><button type="button" className="rounded-lg bg-success px-3 py-2 text-xs font-bold text-on-success" onClick={() => { if (window.confirm(`Setujui campaign ${campaign.name}?`)) action.mutate({ id: campaign.id, action: 'moderation', payload: { status: 'approved', reason: 'admin moderation approved' } }) }}>Setujui</button><button type="button" className="rounded-lg bg-error px-3 py-2 text-xs font-bold text-on-error" onClick={() => { if (window.confirm(`Tangguhkan campaign ${campaign.name}? Campaign tidak akan tampil sampai diaktifkan kembali.`)) action.mutate({ id: campaign.id, action: 'suspend', payload: { scope: 'campaign', reason: 'manual admin suspension' } }) }}><Ban className="mr-1 inline h-3 w-3" aria-hidden="true" />Tangguhkan</button></div></td></tr>)}</tbody></table>{campaigns.length === 0 && <p className="p-6 text-sm text-foreground-muted">Belum ada campaign iklan.</p>}</div></section>}
        {tab === 'inventory' && <PolicyPanel title="Slot dan penempatan iklan" icon={Gauge} data={inventoryQuery.data} />}
        {tab === 'bid' && <PolicyPanel title="Aturan bid, pacing, dan batas perlindungan" icon={BarChart3} data={{ rules: ['Pembayar tertinggi tidak otomatis menjadi pemenang', 'Peringkat menggunakan kualitas, relevansi, dan kelayakan', 'Batas harian dan total memakai reservasi atomik', 'Mata uang mengikuti konteks pasar, bukan locale perangkat'], maker_checker: true }} />}
        {tab === 'invalid' && <PolicyPanel title="Traffic tidak valid dan pemeriksaan privasi" icon={ShieldCheck} data={{ rules: ['Pemeriksaan cadence dan self-click dilakukan di server', 'Kredit dan pembalikan dicatat secara append-only', 'Merchant tidak melihat identitas atau daftar customer', 'Fingerprint mentah tidak dikumpulkan'], reviewable: true }} />}
        {tab === 'audit' && <PolicyPanel title="Riwayat audit" icon={FileCheck2} data={auditQuery.data || { items: [], privacy: 'Audit hanya pada level campaign' }} />}
        <footer className="rounded-2xl border border-border bg-surface p-5 text-sm text-foreground-muted"><strong className="text-foreground">Area tanpa iklan:</strong> checkout, pembayaran, tracking, support/claim, booking dan matching Tambal/Towing, serta perbandingan carrier aggregator. Jika Ads gagal, sistem kembali ke hasil organik dan order tetap berjalan.</footer>
      </div>
    </div>
  )
}

function Metric({ icon: Icon, label, value }: { icon: any; label: string; value: string | number }) { return <div className="rounded-2xl border border-border bg-surface p-5"><Icon className="h-5 w-5 text-primary" aria-hidden="true" /><p className="mt-4 text-xs font-bold uppercase tracking-wide text-foreground-muted">{label}</p><p className="mt-1 text-2xl font-black text-foreground">{value}</p></div> }

function PolicyPanel({ title, icon: Icon, data }: { title: string; icon: any; data: unknown }) {
  const entries = data && typeof data === 'object' && !Array.isArray(data)
    ? Object.entries(data as Record<string, unknown>)
    : [['detail', data] as [string, unknown]]

  return (
    <section className="rounded-2xl border border-border bg-surface p-6">
      <div className="flex items-center gap-3">
        <Icon className="h-6 w-6 text-primary" aria-hidden="true" />
        <h2 className="text-xl font-black text-foreground">{title}</h2>
      </div>
      <dl className="mt-5 grid gap-3 md:grid-cols-2">
        {entries.map(([key, value]) => (
          <div key={key} className="rounded-xl border border-border bg-surface-subtle p-4">
            <dt className="text-xs font-black uppercase tracking-wide text-foreground-muted">{policyKeyLabel(key)}</dt>
            <dd className="mt-2 text-sm text-foreground-muted"><PolicyValue value={value} /></dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

function PolicyValue({ value, depth = 0 }: { value: unknown; depth?: number }) {
  if (Array.isArray(value)) {
    return value.length === 0 ? <span>Belum ada data</span> : (
      <ul className="space-y-2">
        {value.map((item, index) => <li key={index} className="rounded-lg border border-border/60 bg-background/40 px-3 py-2"><PolicyValue value={item} depth={depth + 1} /></li>)}
      </ul>
    )
  }

  if (value && typeof value === 'object' && depth < 2) {
    return (
      <dl className="space-y-2">
        {Object.entries(value as Record<string, unknown>).map(([key, nestedValue]) => (
          <div key={key}>
            <dt className="text-xs font-bold text-foreground-muted">{policyKeyLabel(key)}</dt>
            <dd className="mt-1"><PolicyValue value={nestedValue} depth={depth + 1} /></dd>
          </div>
        ))}
      </dl>
    )
  }

  return <span>{value === null || value === undefined || value === '' ? 'Belum tersedia' : String(value)}</span>
}

function policyKeyLabel(key: string) {
  const labels: Record<string, string> = {
    protected_global_bounds: 'Batas perlindungan global',
    ad_free_zones: 'Zona tanpa iklan',
    maker_checker: 'Persetujuan berlapis',
    reviewable: 'Dapat ditinjau',
    privacy: 'Privasi',
    items: 'Daftar data',
    policies: 'Aturan yang berlaku',
    rules: 'Aturan',
    value: 'Nilai',
    detail: 'Detail',
  }
  return labels[key] || key.replaceAll('_', ' ')
}
