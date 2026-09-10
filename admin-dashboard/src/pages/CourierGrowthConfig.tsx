import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Award, CheckCircle2, Gift, Save, Target, TrendingUp } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '../lib/api'
import { cn } from '../lib/utils'
import { AdminPageSkeleton } from '../components/ui/Skeleton'

type TierConfig = {
  id: string
  tier_code: string
  tier_name: string
  min_rating: number
  min_completion_rate: number
  min_deliveries_30d: number
  benefit_summary: string
  is_active: boolean
}

type IncentiveCampaign = {
  id: string
  code: string
  title: string
  description?: string
  target_deliveries: number
  reward_idr: number
  starts_at?: string
  ends_at?: string
  is_active: boolean
  market_code?: string
  zone_id?: string
  service_code?: string
  cohort_code?: string
  budget_idr: number
  budget_reserved_idr?: number
  budget_reconciled_idr?: number
  policy_version?: string
  max_customer_pair_deliveries?: number
}

const rupiah = (value: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value || 0)

const dateValue = (value?: string) => (value ? new Date(value).toISOString().slice(0, 10) : '')

export default function CourierGrowthConfig() {
  const queryClient = useQueryClient()
  const [tierDrafts, setTierDrafts] = useState<Record<string, Partial<TierConfig>>>({})
  const [incentiveDrafts, setIncentiveDrafts] = useState<Record<string, Partial<IncentiveCampaign>>>({})

  const { data, isLoading } = useQuery({
    queryKey: ['courier-growth-configs'],
    queryFn: async () => {
      const res = await api.get('/admin/courier-growth-configs')
      return res.data.data as { tiers: TierConfig[]; incentives: IncentiveCampaign[] }
    },
  })

  const updateTier = useMutation({
    mutationFn: async (tier: TierConfig) => api.patch(`/admin/courier-tier-configs/${tier.id}`, tier),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['courier-growth-configs'] })
      toast.success('Tier kurir diperbarui')
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Gagal menyimpan tier'),
  })

  const updateIncentive = useMutation({
    mutationFn: async (campaign: IncentiveCampaign) => api.patch(`/admin/courier-incentive-campaigns/${campaign.id}`, campaign),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['courier-growth-configs'] })
      toast.success('Campaign insentif diperbarui')
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Gagal menyimpan campaign'),
  })

  const tiers = data?.tiers || []
  const incentives = data?.incentives || []
  const activeIncentives = incentives.filter((item) => item.is_active).length

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.32em] text-primary-light">Courier Growth Ops</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-foreground-muted">Courier Growth</h1>
          <p className="mt-2 max-w-2xl text-sm text-foreground-muted">
            Kelola tier performa, target insentif, dan reward on-demand agar dispatch tetap sehat dan payout transparan.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-border bg-surface/[0.04] px-5 py-4">
            <p className="text-xs font-bold uppercase tracking-widest text-foreground-muted">Tier Aktif</p>
            <p className="mt-1 text-2xl font-black text-foreground">{tiers.filter((tier) => tier.is_active).length}</p>
          </div>
          <div className="rounded-2xl border border-success bg-success-surface px-5 py-4">
            <p className="text-xs font-bold uppercase tracking-widest text-success">Campaign</p>
            <p className="mt-1 text-2xl font-black text-success">{activeIncentives}</p>
          </div>
        </div>
      </div>

      {isLoading ? (
        <AdminPageSkeleton />
      ) : (
        <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
          <section className="rounded-3xl border border-border bg-surface-subtle p-5">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/15 text-primary-light">
                <Award className="h-5 w-5"  aria-hidden="true"/>
              </div>
              <div>
                <h2 className="text-xl font-black text-foreground">Tier Performa</h2>
                <p className="text-sm text-foreground-muted">Dasar scoring untuk prioritas offer on-demand.</p>
              </div>
            </div>
            <div className="space-y-4">
              {tiers.map((tier) => {
                const draft = { ...tier, ...tierDrafts[tier.id] }
                return (
                  <div key={tier.id} className="rounded-2xl border border-border bg-surface-subtle p-4">
                    <div className="mb-4 flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-black text-foreground">{tier.tier_name}</h3>
                          <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-widest', tier.is_active ? 'bg-success-surface text-success' : 'bg-surface-subtle text-foreground-muted')}>
                            {tier.is_active ? 'active' : 'off'}
                          </span>
                        </div>
                        <p className="mt-1 text-xs font-bold uppercase tracking-widest text-foreground-muted">{tier.tier_code}</p>
                      </div>
                      <button
                        onClick={() => updateTier.mutate(draft as TierConfig)}
                        className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-black text-on-primary transition hover:bg-primary-dark"
                      >
                        <Save className="h-4 w-4" aria-hidden="true" />
                        Simpan
                      </button>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <label className="space-y-1">
                        <span className="text-xs font-bold uppercase tracking-widest text-foreground-muted">Rating Min</span>
                        <input className="w-full rounded-xl border border-border bg-scrim/30 px-3 py-2 text-sm outline-none focus:border-primary" type="number" step="0.1" value={draft.min_rating} onChange={(e) => setTierDrafts((prev) => ({ ...prev, [tier.id]: { ...prev[tier.id], min_rating: Number(e.target.value) } }))} />
                      </label>
                      <label className="space-y-1">
                        <span className="text-xs font-bold uppercase tracking-widest text-foreground-muted">Completion</span>
                        <input className="w-full rounded-xl border border-border bg-scrim/30 px-3 py-2 text-sm outline-none focus:border-primary" type="number" value={draft.min_completion_rate} onChange={(e) => setTierDrafts((prev) => ({ ...prev, [tier.id]: { ...prev[tier.id], min_completion_rate: Number(e.target.value) } }))} />
                      </label>
                      <label className="space-y-1">
                        <span className="text-xs font-bold uppercase tracking-widest text-foreground-muted">30 Hari</span>
                        <input className="w-full rounded-xl border border-border bg-scrim/30 px-3 py-2 text-sm outline-none focus:border-primary" type="number" value={draft.min_deliveries_30d} onChange={(e) => setTierDrafts((prev) => ({ ...prev, [tier.id]: { ...prev[tier.id], min_deliveries_30d: Number(e.target.value) } }))} />
                      </label>
                    </div>
                    <label className="mt-3 block space-y-1">
                      <span className="text-xs font-bold uppercase tracking-widest text-foreground-muted">Benefit</span>
                      <input className="w-full rounded-xl border border-border bg-scrim/30 px-3 py-2 text-sm outline-none focus:border-primary" value={draft.benefit_summary || ''} onChange={(e) => setTierDrafts((prev) => ({ ...prev, [tier.id]: { ...prev[tier.id], benefit_summary: e.target.value } }))} />
                    </label>
                  </div>
                )
              })}
            </div>
          </section>

          <section className="rounded-3xl border border-border bg-surface-subtle p-5">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-success-surface text-success">
                <Gift className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <h2 className="text-xl font-black text-foreground">Insentif Kurir</h2>
                <p className="text-sm text-foreground-muted">Reward yang tampil di profil aplikasi kurir.</p>
              </div>
            </div>
            <div className="space-y-4">
              {incentives.map((campaign) => {
                const draft = { ...campaign, ...incentiveDrafts[campaign.id] }
                return (
                  <div key={campaign.id} className="rounded-2xl border border-border bg-surface-subtle p-4">
                    <div className="mb-4 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          {campaign.is_active ? <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" /> : <Target className="h-4 w-4 text-foreground-muted" aria-hidden="true" />}
                          <h3 className="truncate font-black text-foreground" title={campaign.title}>{campaign.title}</h3>
                        </div>
                        <p className="mt-1 text-xs font-bold uppercase tracking-widest text-foreground-muted">{campaign.code}</p>
                      </div>
                      <button
                        onClick={() => updateIncentive.mutate(draft as IncentiveCampaign)}
                        className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-black text-on-primary transition hover:bg-primary-dark"
                      >
                        <Save className="h-4 w-4" aria-hidden="true" />
                        Simpan
                      </button>
                    </div>
                    <label className="block space-y-1">
                      <span className="text-xs font-bold uppercase tracking-widest text-foreground-muted">Judul</span>
                      <input className="w-full rounded-xl border border-border bg-scrim/30 px-3 py-2 text-sm outline-none focus:border-primary" value={draft.title || ''} onChange={(e) => setIncentiveDrafts((prev) => ({ ...prev, [campaign.id]: { ...prev[campaign.id], title: e.target.value } }))} />
                    </label>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <label className="space-y-1">
                        <span className="text-xs font-bold uppercase tracking-widest text-foreground-muted">Target</span>
                        <input className="w-full rounded-xl border border-border bg-scrim/30 px-3 py-2 text-sm outline-none focus:border-primary" type="number" value={draft.target_deliveries} onChange={(e) => setIncentiveDrafts((prev) => ({ ...prev, [campaign.id]: { ...prev[campaign.id], target_deliveries: Number(e.target.value) } }))} />
                      </label>
                      <label className="space-y-1">
                        <span className="text-xs font-bold uppercase tracking-widest text-foreground-muted">Reward</span>
                        <input className="w-full rounded-xl border border-border bg-scrim/30 px-3 py-2 text-sm outline-none focus:border-primary" type="number" value={draft.reward_idr} onChange={(e) => setIncentiveDrafts((prev) => ({ ...prev, [campaign.id]: { ...prev[campaign.id], reward_idr: Number(e.target.value) } }))} />
                      </label>
                    </div>
                    <div className="mt-3 flex items-center justify-between rounded-xl border border-border bg-surface/[0.03] px-3 py-2 text-sm text-foreground-muted">
                      <span>{rupiah(Number(draft.reward_idr || 0))} untuk {draft.target_deliveries} delivery</span>
                      <TrendingUp className="h-4 w-4 text-primary-light" aria-hidden="true" />
                    </div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <label className="space-y-1">
                        <span className="text-xs font-bold uppercase tracking-widest text-foreground-muted">Market</span>
                        <input className="w-full rounded-xl border border-border bg-scrim/30 px-3 py-2 text-sm outline-none focus:border-primary" value={draft.market_code || ''} placeholder="ID-JK" onChange={(e) => setIncentiveDrafts((prev) => ({ ...prev, [campaign.id]: { ...prev[campaign.id], market_code: e.target.value } }))} />
                      </label>
                      <label className="space-y-1">
                        <span className="text-xs font-bold uppercase tracking-widest text-foreground-muted">Service</span>
                        <input className="w-full rounded-xl border border-border bg-scrim/30 px-3 py-2 text-sm outline-none focus:border-primary" value={draft.service_code || ''} placeholder="food_delivery" onChange={(e) => setIncentiveDrafts((prev) => ({ ...prev, [campaign.id]: { ...prev[campaign.id], service_code: e.target.value } }))} />
                      </label>
                      <label className="space-y-1">
                        <span className="text-xs font-bold uppercase tracking-widest text-foreground-muted">Cohort / Tier</span>
                        <input className="w-full rounded-xl border border-border bg-scrim/30 px-3 py-2 text-sm outline-none focus:border-primary" value={draft.cohort_code || 'all'} placeholder="all / regular / elite" onChange={(e) => setIncentiveDrafts((prev) => ({ ...prev, [campaign.id]: { ...prev[campaign.id], cohort_code: e.target.value } }))} />
                      </label>
                      <label className="space-y-1">
                        <span className="text-xs font-bold uppercase tracking-widest text-foreground-muted">Budget</span>
                        <input className="w-full rounded-xl border border-border bg-scrim/30 px-3 py-2 text-sm outline-none focus:border-primary" type="number" min="0" value={draft.budget_idr ?? 0} onChange={(e) => setIncentiveDrafts((prev) => ({ ...prev, [campaign.id]: { ...prev[campaign.id], budget_idr: Number(e.target.value) } }))} />
                      </label>
                    </div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <label className="space-y-1">
                        <span className="text-xs font-bold uppercase tracking-widest text-foreground-muted">Zone ID (optional)</span>
                        <input className="w-full rounded-xl border border-border bg-scrim/30 px-3 py-2 text-sm outline-none focus:border-primary" value={draft.zone_id || ''} placeholder="UUID zone" onChange={(e) => setIncentiveDrafts((prev) => ({ ...prev, [campaign.id]: { ...prev[campaign.id], zone_id: e.target.value } }))} />
                      </label>
                      <label className="space-y-1">
                        <span className="text-xs font-bold uppercase tracking-widest text-foreground-muted">Pair limit</span>
                        <input className="w-full rounded-xl border border-border bg-scrim/30 px-3 py-2 text-sm outline-none focus:border-primary" type="number" min="1" value={draft.max_customer_pair_deliveries ?? 10} onChange={(e) => setIncentiveDrafts((prev) => ({ ...prev, [campaign.id]: { ...prev[campaign.id], max_customer_pair_deliveries: Number(e.target.value) } }))} />
                      </label>
                    </div>
                    <label className="mt-3 block space-y-1">
                      <span className="text-xs font-bold uppercase tracking-widest text-foreground-muted">Policy version</span>
                      <input className="w-full rounded-xl border border-border bg-scrim/30 px-3 py-2 text-sm outline-none focus:border-primary" value={draft.policy_version || 'courier-incentive-2026-v1'} onChange={(e) => setIncentiveDrafts((prev) => ({ ...prev, [campaign.id]: { ...prev[campaign.id], policy_version: e.target.value } }))} />
                    </label>
                    <p className="mt-3 text-xs text-foreground-muted">
                      Reserved {rupiah(Number(draft.budget_reserved_idr || 0))} · Reconciled {rupiah(Number(draft.budget_reconciled_idr || 0))} · Policy {draft.policy_version || 'courier-incentive-2026-v1'}
                    </p>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <input className="rounded-xl border border-border bg-scrim/30 px-3 py-2 text-sm outline-none focus:border-primary" type="date" value={dateValue(draft.starts_at)} onChange={(e) => setIncentiveDrafts((prev) => ({ ...prev, [campaign.id]: { ...prev[campaign.id], starts_at: e.target.value } }))} />
                      <input className="rounded-xl border border-border bg-scrim/30 px-3 py-2 text-sm outline-none focus:border-primary" type="date" value={dateValue(draft.ends_at)} onChange={(e) => setIncentiveDrafts((prev) => ({ ...prev, [campaign.id]: { ...prev[campaign.id], ends_at: e.target.value } }))} />
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
