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
  ['overview', 'Overview'], ['campaigns', 'Campaigns'], ['moderation', 'Creatives & Moderation'],
  ['inventory', 'Inventory & Placements'], ['bid', 'Bid/Pacing Policy'], ['invalid', 'Invalid Traffic'],
  ['billing', 'Billing & Credits'], ['analytics', 'Analytics'], ['audit', 'Audit'],
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
    <main className="min-h-screen bg-background p-6 md:p-10" aria-labelledby="commerce-ads-title">
      <div className="mx-auto max-w-7xl space-y-8">
        <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div><p className="text-xs font-black uppercase tracking-[0.22em] text-primary">Commerce Ads</p><h1 id="commerce-ads-title" className="mt-2 text-3xl font-black text-foreground">Paid visibility dengan guardrail marketplace</h1><p className="mt-2 max-w-3xl text-sm text-foreground-muted">Promo finansial tetap berada di Promo/Pricing. Ads hanya memilih sponsored content untuk slot yang disediakan Experience; rating, ETA, harga, dan serviceability tetap organik/server-authoritative.</p></div>
          <div className="rounded-2xl border border-warning/40 bg-warning-surface px-4 py-3 text-sm text-warning" role="status">High-blast-radius policy: maker-checker + audit wajib.</div>
        </header>
        <nav className="flex gap-2 overflow-x-auto border-b border-border pb-2" aria-label="Commerce Ads navigation">{tabs.map(([key, label]) => <button key={key} type="button" onClick={() => setTab(key)} aria-current={tab === key ? 'page' : undefined} className={`whitespace-nowrap rounded-xl px-3 py-2 text-sm font-bold ${tab === key ? 'bg-primary text-on-primary' : 'text-foreground-muted hover:bg-surface-subtle'}`}>{label}</button>)}</nav>
        {(campaignsQuery.isLoading || inventoryQuery.isLoading) && <div className="rounded-2xl border border-border bg-surface p-6" role="status">Memuat control plane Ads…</div>}
        {(campaignsQuery.isError || inventoryQuery.isError) && <div className="rounded-2xl border border-error bg-error-surface p-6 text-error" role="alert"><AlertTriangle className="mb-2 h-5 w-5" aria-hidden="true" />Ads control plane tidak tersedia. Core discovery tetap harus fallback ke organik.</div>}
        {tab === 'overview' && <section className="grid gap-4 md:grid-cols-4" aria-label="Ads overview metrics"><Metric icon={Layers3} label="Campaigns" value={campaigns.length} /><Metric icon={CheckCircle2} label="Active" value={active} /><Metric icon={WalletCards} label="Charged spend" value={money(spend)} /><Metric icon={ShieldCheck} label="Protected zones" value={inventoryQuery.data?.protected_global_bounds?.ad_free_zones?.length || 0} /></section>}
        {(tab === 'campaigns' || tab === 'moderation' || tab === 'billing' || tab === 'analytics') && <section className="overflow-hidden rounded-2xl border border-border bg-surface" aria-label="Ads campaigns table"><div className="border-b border-border p-5"><h2 className="text-xl font-black text-foreground">{tab === 'moderation' ? 'Creative moderation queue' : tab === 'billing' ? 'Billing and balance evidence' : tab === 'analytics' ? 'Paid vs organic reporting' : 'Campaign owner control'}</h2><p className="mt-1 text-sm text-foreground-muted">Owner access is scoped by the Ads service; changes produce append-only audit events.</p></div><div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="bg-surface-subtle text-xs uppercase tracking-wide text-foreground-muted"><tr><th className="px-5 py-3">Campaign</th><th className="px-5 py-3">State</th><th className="px-5 py-3">Policy</th><th className="px-5 py-3">Budget / spend</th><th className="px-5 py-3">Actions</th></tr></thead><tbody className="divide-y divide-border">{campaigns.map((campaign) => <tr key={campaign.id}><td className="px-5 py-4"><div className="font-bold text-foreground">{campaign.name}</div><div className="text-xs text-foreground-muted">{campaign.id} · {campaign.market_code}</div>{campaign.rejection_reason && <div className="mt-1 text-xs text-error">Ditolak: {campaign.rejection_reason}</div>}{campaign.suspension_reason && <div className="mt-1 text-xs text-error">Ditangguhkan: {campaign.suspension_reason}</div>}</td><td className="px-5 py-4"><span className="rounded-full bg-surface-subtle px-3 py-1 text-xs font-bold">{campaign.status}</span></td><td className="px-5 py-4">{campaign.policy_status || 'pending'}<div className="text-xs text-foreground-muted">{campaign.creative?.alt_text || 'creative alt text enforced'}</div></td><td className="px-5 py-4">{money(campaign.budget?.spent_minor, campaign.budget?.currency)}<div className="text-xs text-foreground-muted">cap {money(campaign.budget?.total_minor, campaign.budget?.currency)}</div></td><td className="px-5 py-4"><div className="flex flex-wrap gap-2"><button type="button" className="rounded-lg bg-success px-3 py-2 text-xs font-bold text-on-success" onClick={() => action.mutate({ id: campaign.id, action: 'moderation', payload: { status: 'approved', reason: 'admin moderation approved' } })}>Approve</button><button type="button" className="rounded-lg bg-error px-3 py-2 text-xs font-bold text-on-error" onClick={() => action.mutate({ id: campaign.id, action: 'suspend', payload: { scope: 'campaign', reason: 'manual admin suspension' } })}><Ban className="mr-1 inline h-3 w-3" aria-hidden="true" />Suspend</button></div></td></tr>)}</tbody></table>{campaigns.length === 0 && <p className="p-6 text-sm text-foreground-muted">Belum ada campaign Ads.</p>}</div></section>}
        {tab === 'inventory' && <PolicyPanel title="Inventory & placements" icon={Gauge} data={inventoryQuery.data} />}
        {tab === 'bid' && <PolicyPanel title="Bid, pacing & protected bounds" icon={BarChart3} data={{ rules: ['highest payer is not automatic winner', 'quality × relevance × eligibility ranking', 'daily/total hard cap with atomic reservation', 'currency comes from market financial context, never locale'], maker_checker: true }} />}
        {tab === 'invalid' && <PolicyPanel title="Invalid traffic & privacy-safe debug" icon={ShieldCheck} data={{ rules: ['server-side cadence/self-click review', 'credit/reversal is append-only', 'merchant sees no user identity/list', 'raw fingerprinting is not collected'], reviewable: true }} />}
        {tab === 'audit' && <PolicyPanel title="Append-only audit" icon={FileCheck2} data={auditQuery.data || { items: [], privacy: 'campaign-level audit only' }} />}
        <footer className="rounded-2xl border border-border bg-surface p-5 text-sm text-foreground-muted"><strong className="text-foreground">Ad-free contract:</strong> checkout, payment, tracking, support/claim, Tambal/Towing booking-matching-active, and aggregator carrier comparison do not receive Ads. Ads failure returns organic fallback and cannot break order/payment.</footer>
      </div>
    </main>
  )
}

function Metric({ icon: Icon, label, value }: { icon: any; label: string; value: string | number }) { return <div className="rounded-2xl border border-border bg-surface p-5"><Icon className="h-5 w-5 text-primary" aria-hidden="true" /><p className="mt-4 text-xs font-bold uppercase tracking-wide text-foreground-muted">{label}</p><p className="mt-1 text-2xl font-black text-foreground">{value}</p></div> }

function PolicyPanel({ title, icon: Icon, data }: { title: string; icon: any; data: unknown }) { return <section className="rounded-2xl border border-border bg-surface p-6"><div className="flex items-center gap-3"><Icon className="h-6 w-6 text-primary" aria-hidden="true" /><h2 className="text-xl font-black text-foreground">{title}</h2></div><pre className="mt-5 overflow-x-auto rounded-xl bg-surface-subtle p-4 text-xs text-foreground-muted">{JSON.stringify(data, null, 2)}</pre></section> }
