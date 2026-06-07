import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  AlertTriangle,
  BadgePercent,
  BellRing,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Clock,
  Coins,
  Loader2,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Target,
  WalletCards,
} from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '../lib/api'
import { cn } from '../lib/utils'

type PromoStatus = 'draft' | 'pending_approval' | 'scheduled' | 'active' | 'paused' | 'expired' | 'archived'
type DiscountType = 'fixed' | 'percentage' | 'shipping_discount' | 'free_insurance'
type ComponentScope = 'shipping' | 'insurance' | 'service_fee' | 'referral'
type PromoNotificationChannel = 'none' | 'in_app' | 'push_in_app' | 'scheduled_push'

type PromoCampaign = {
  id: string
  code: string
  name: string
  description?: string | null
  status: PromoStatus
  discount_type: DiscountType
  discount_value_idr: number
  discount_percent: number
  max_discount_idr: number
  min_order_idr: number
  service_codes: Record<string, unknown> | string[] | null
  component_scope: ComponentScope
  total_budget_idr: number
  daily_budget_idr: number
  reserved_budget_idr: number
  redeemed_budget_idr: number
  max_redemptions: number
  per_user_limit: number
  starts_at: string
  ends_at: string
  risk_campaign: boolean
  risk_reason?: string | null
  approved_at?: string | null
  published_at?: string | null
  created_at: string
}

type PromoMarginPolicy = {
  id: string
  service_code: string
  vehicle_type?: string | null
  zone_code?: string | null
  min_margin_amount_idr: number
  min_margin_percent: number
  active: boolean
}

type PromoFormState = {
  code: string
  name: string
  description: string
  discount_type: DiscountType
  discount_value_idr: string
  discount_percent: string
  max_discount_idr: string
  min_order_idr: string
  service_codes: string
  component_scope: ComponentScope
  total_budget_idr: string
  daily_budget_idr: string
  max_redemptions: string
  per_user_limit: string
  starts_at: string
  ends_at: string
  risk_campaign: boolean
  risk_reason: string
}

type SimulationState = {
  code: string
  service_code: string
  vehicle_type: string
  zone_code: string
  gross_amount_idr: string
  insurance_amount_idr: string
  tax_amount_idr: string
}

type PromoNotificationDraft = {
  channel: PromoNotificationChannel
  max_per_day: string
  max_per_week: string
  quiet_hours_start: string
  quiet_hours_end: string
  scheduled_at: string
}

type PromoAuditEvent = {
  id: string
  action: string
  reason?: string | null
  actor_role?: string | null
  created_at: string
}

type PromoAnalytics = {
  campaign_id: string
  status: PromoStatus
  budget: {
    total_budget_idr: number
    reserved_budget_idr: number
    redeemed_budget_idr: number
    remaining_budget_idr: number
    burn_rate_percent: number
  }
  redemption: {
    total: number
    reserved: number
    redeemed: number
    released: number
    discount_reserved_idr: number
    discount_redeemed_idr: number
    contribution_margin_idr: number
    average_margin_percent: number
  }
  delivery: {
    total: number
    queued: number
    sent: number
    failed: number
    opened: number
    open_rate_percent: number
  }
  audit_events: PromoAuditEvent[]
}

const nowDateTimeLocal = () => new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 16)
const weekDateTimeLocal = () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16)

const initialForm: PromoFormState = {
  code: '',
  name: '',
  description: '',
  discount_type: 'shipping_discount',
  discount_value_idr: '10000',
  discount_percent: '0',
  max_discount_idr: '10000',
  min_order_idr: '50000',
  service_codes: 'instant_motor',
  component_scope: 'shipping',
  total_budget_idr: '5000000',
  daily_budget_idr: '500000',
  max_redemptions: '500',
  per_user_limit: '1',
  starts_at: nowDateTimeLocal(),
  ends_at: weekDateTimeLocal(),
  risk_campaign: false,
  risk_reason: '',
}

const initialSimulation: SimulationState = {
  code: '',
  service_code: 'instant_motor',
  vehicle_type: 'motor',
  zone_code: '',
  gross_amount_idr: '75000',
  insurance_amount_idr: '0',
  tax_amount_idr: '0',
}

const initialNotificationDraft: PromoNotificationDraft = {
  channel: 'push_in_app',
  max_per_day: '1',
  max_per_week: '3',
  quiet_hours_start: '21:00',
  quiet_hours_end: '08:00',
  scheduled_at: nowDateTimeLocal(),
}

const queryErrorMessage = (error: any, fallback: string) =>
  error?.response?.data?.message || error?.response?.data?.error || error?.message || fallback

const toInt = (value: string) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0
}

const formatIdr = (value: unknown) => {
  const amount = Number(value || 0)
  return `Rp ${amount.toLocaleString('id-ID')}`
}

const parseServiceCodes = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.map(String)
  if (value && typeof value === 'object') return Object.keys(value as Record<string, unknown>).filter((key) => Boolean((value as Record<string, unknown>)[key]))
  return []
}

const buildCreatePayload = (form: PromoFormState) => ({
  code: form.code.trim().toUpperCase(),
  name: form.name.trim(),
  description: form.description.trim(),
  discount_type: form.discount_type,
  discount_value_idr: toInt(form.discount_value_idr),
  discount_percent: Number(form.discount_percent || 0),
  max_discount_idr: toInt(form.max_discount_idr),
  min_order_idr: toInt(form.min_order_idr),
  service_codes: form.service_codes
    .split(',')
    .map((code) => code.trim())
    .filter(Boolean),
  component_scope: form.component_scope,
  stacking_key: `${form.component_scope}:${form.service_codes.split(',')[0]?.trim() || 'service'}`,
  allow_stack_different_service: true,
  total_budget_idr: toInt(form.total_budget_idr),
  daily_budget_idr: toInt(form.daily_budget_idr),
  max_redemptions: toInt(form.max_redemptions),
  per_user_limit: toInt(form.per_user_limit),
  starts_at: new Date(form.starts_at).toISOString(),
  ends_at: new Date(form.ends_at).toISOString(),
  risk_campaign: form.risk_campaign,
  risk_reason: form.risk_reason.trim(),
  audience_rules: {
    marketing_push_cap: {
      max_per_day: 1,
      max_per_week: 3,
      quiet_hours: { start: '21:00', end: '08:00' },
    },
  },
  eligibility_rules: {
    require_margin_policy: true,
    apply_after_tax_and_insurance: true,
  },
  notification_copy: {
    title: form.name.trim(),
    body: form.description.trim(),
  },
})

function DataState({ title, message, onRetry }: { title: string; message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-[32px] border border-red-500/20 bg-red-500/5 p-8 text-center">
      <AlertTriangle className="mx-auto h-10 w-10 text-red-300" />
      <p className="mt-4 text-sm font-black uppercase tracking-widest text-red-100">{title}</p>
      <p className="mt-2 text-sm text-red-200/70">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-5 inline-flex items-center gap-2 rounded-2xl border border-red-500/20 bg-red-500/10 px-5 py-3 text-xs font-black uppercase tracking-widest text-red-100 transition-all hover:bg-red-500/20"
        >
          <RefreshCw className="h-4 w-4" />
          Muat ulang
        </button>
      )}
    </div>
  )
}

function MetricCard({ icon: Icon, label, value, tone = 'emerald' }: { icon: any; label: string; value: string; tone?: 'emerald' | 'amber' | 'blue' | 'red' }) {
  const toneClass = {
    emerald: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/10',
    amber: 'text-amber-300 bg-amber-500/10 border-amber-500/10',
    blue: 'text-sky-300 bg-sky-500/10 border-sky-500/10',
    red: 'text-red-300 bg-red-500/10 border-red-500/10',
  }[tone]

  return (
    <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-6 shadow-sm">
      <div className="flex items-center gap-4">
        <div className={cn('rounded-2xl border p-3', toneClass)}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.25em] text-zinc-500">{label}</p>
          <p className="mt-1 text-2xl font-black tracking-tight text-zinc-100">{value}</p>
        </div>
      </div>
    </div>
  )
}

function PromoStatusPill({ status }: { status: PromoStatus }) {
  const statusClass = {
    draft: 'bg-zinc-700/30 text-zinc-300 border-zinc-600/30',
    pending_approval: 'bg-amber-500/10 text-amber-300 border-amber-500/20',
    scheduled: 'bg-sky-500/10 text-sky-300 border-sky-500/20',
    active: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
    paused: 'bg-orange-500/10 text-orange-300 border-orange-500/20',
    expired: 'bg-red-500/10 text-red-300 border-red-500/20',
    archived: 'bg-zinc-800 text-zinc-500 border-zinc-700',
  }[status]

  return (
    <span className={cn('rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-widest', statusClass)}>
      {status.replace('_', ' ')}
    </span>
  )
}

export default function Promos() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [form, setForm] = useState<PromoFormState>(initialForm)
  const [simulation, setSimulation] = useState<SimulationState>(initialSimulation)
  const [simulationResult, setSimulationResult] = useState<any>(null)
  const [notificationDrafts, setNotificationDrafts] = useState<Record<string, PromoNotificationDraft>>({})
  const [analyticsByCampaign, setAnalyticsByCampaign] = useState<Record<string, PromoAnalytics>>({})

  const campaignsQuery = useQuery({
    queryKey: ['promo-campaigns'],
    queryFn: async () => {
      const res = await api.get('/admin/promos', { params: { limit: 100 } })
      return (res.data?.data || []) as PromoCampaign[]
    },
  })

  const policiesQuery = useQuery({
    queryKey: ['promo-margin-policies'],
    queryFn: async () => {
      const res = await api.get('/admin/promos/margin-policies')
      return (res.data?.data || []) as PromoMarginPolicy[]
    },
  })

  const createMutation = useMutation({
    mutationFn: async () => api.post('/admin/promos', buildCreatePayload(form)),
    onSuccess: () => {
      toast.success('Campaign promo dibuat sebagai draft')
      setForm(initialForm)
      queryClient.invalidateQueries({ queryKey: ['promo-campaigns'] })
    },
    onError: (error: any) => toast.error(queryErrorMessage(error, 'Campaign promo gagal dibuat')),
  })

  const actionMutation = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: 'submit' | 'approve' | 'publish' | 'pause' }) => {
      const body = action === 'pause' ? { reason: 'Paused from Promo Engine dashboard' } : {}
      return api.post(`/admin/promos/${id}/${action}`, body)
    },
    onSuccess: (_res, variables) => {
      toast.success(`Promo berhasil diproses: ${variables.action}`)
      queryClient.invalidateQueries({ queryKey: ['promo-campaigns'] })
    },
    onError: (error: any) => toast.error(queryErrorMessage(error, 'Aksi promo ditolak oleh backend')),
  })

  const audienceMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.post(`/admin/promos/${id}/audience-preview`, {
        max_per_day: 1,
        max_per_week: 3,
      })
      return res.data?.data
    },
    onSuccess: (data) => {
      toast.success(`Audience opt-in: ${(data?.eligible_user_count || 0).toLocaleString('id-ID')} customer`)
    },
    onError: (error: any) => toast.error(queryErrorMessage(error, 'Audience promo gagal dihitung')),
  })

  const notifyMutation = useMutation({
    mutationFn: async ({ id, draft }: { id: string; draft: PromoNotificationDraft }) => {
      const payload = {
        channel: draft.channel,
        max_per_day: toInt(draft.max_per_day) || 1,
        max_per_week: toInt(draft.max_per_week) || 3,
        quiet_hours_start: draft.quiet_hours_start || '21:00',
        quiet_hours_end: draft.quiet_hours_end || '08:00',
        scheduled_at: draft.channel === 'scheduled_push' && draft.scheduled_at
          ? new Date(draft.scheduled_at).toISOString()
          : undefined,
      }
      const res = await api.post(`/admin/promos/${id}/notify`, {
        ...payload,
      })
      return res.data?.data
    },
    onSuccess: (data) => {
      toast.success(data?.skipped ? 'Campaign disimpan tanpa notifikasi' : `Promo dikirim: ${data?.sent || 0} terkirim, ${data?.queued || 0} antre`)
      queryClient.invalidateQueries({ queryKey: ['promo-campaigns'] })
    },
    onError: (error: any) => toast.error(queryErrorMessage(error, 'Promo notification ditolak backend')),
  })

  const analyticsMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.get(`/admin/promos/${id}/analytics`)
      return res.data?.data as PromoAnalytics
    },
    onSuccess: (data) => {
      setAnalyticsByCampaign((current) => ({ ...current, [data.campaign_id]: data }))
      toast.success('Audit promo dimuat')
    },
    onError: (error: any) => toast.error(queryErrorMessage(error, 'Audit promo gagal dimuat')),
  })

  const simulateMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        code: simulation.code.trim().toUpperCase(),
        service_code: simulation.service_code.trim(),
        vehicle_type: simulation.vehicle_type.trim(),
        zone_code: simulation.zone_code.trim() || undefined,
        gross_amount_idr: toInt(simulation.gross_amount_idr),
        insurance_amount_idr: toInt(simulation.insurance_amount_idr),
        tax_amount_idr: toInt(simulation.tax_amount_idr),
      }
      const res = await api.post('/admin/promos/preview/simulate', payload)
      return res.data?.data
    },
    onSuccess: (data) => setSimulationResult(data),
    onError: (error: any) => {
      setSimulationResult(null)
      toast.error(queryErrorMessage(error, 'Simulasi promo gagal'))
    },
  })

  const campaigns = campaignsQuery.data || []
  const policies = policiesQuery.data || []
  const activeCampaigns = campaigns.filter((campaign) => campaign.status === 'active').length
  const riskCampaigns = campaigns.filter((campaign) => campaign.risk_campaign).length
  const totalBudget = campaigns.reduce((sum, campaign) => sum + Number(campaign.total_budget_idr || 0), 0)
  const redeemedBudget = campaigns.reduce((sum, campaign) => sum + Number(campaign.redeemed_budget_idr || 0), 0)

  const filteredCampaigns = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return campaigns
    return campaigns.filter((campaign) => {
      const services = parseServiceCodes(campaign.service_codes).join(' ')
      return `${campaign.code} ${campaign.name} ${campaign.status} ${services}`.toLowerCase().includes(term)
    })
  }, [campaigns, search])

  const availableServices = useMemo(() => {
    const fromPolicies = policies.map((policy) => policy.service_code)
    const fromCampaigns = campaigns.flatMap((campaign) => parseServiceCodes(campaign.service_codes))
    return Array.from(new Set([...fromPolicies, ...fromCampaigns])).filter(Boolean).sort()
  }, [campaigns, policies])

  const updateForm = <K extends keyof PromoFormState>(key: K, value: PromoFormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }))
  }

  const updateSimulation = <K extends keyof SimulationState>(key: K, value: SimulationState[K]) => {
    setSimulation((current) => ({ ...current, [key]: value }))
  }

  const notificationDraftFor = (campaignId: string) => notificationDrafts[campaignId] || initialNotificationDraft

  const updateNotificationDraft = <K extends keyof PromoNotificationDraft>(
    campaignId: string,
    key: K,
    value: PromoNotificationDraft[K]
  ) => {
    setNotificationDrafts((current) => ({
      ...current,
      [campaignId]: {
        ...(current[campaignId] || initialNotificationDraft),
        [key]: value,
      },
    }))
  }

  return (
    <div className="space-y-8 pb-20">
      <div className="flex flex-col gap-6 rounded-[40px] border border-white/10 bg-gradient-to-br from-zinc-900 via-zinc-950 to-emerald-950/30 p-8 shadow-2xl shadow-black/20 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-4 py-2 text-[10px] font-black uppercase tracking-[0.3em] text-emerald-300">
            <ShieldCheck className="h-4 w-4" />
            Margin Safe Promotion Control
          </div>
          <h1 className="mt-6 text-4xl font-black tracking-tight text-white">Promo Engine</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-400">
            Kelola campaign promo dengan guard margin dinamis, budget ledger, approval superadmin, dan audit trail. Diskon final selalu dihitung backend setelah pajak/asuransi.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            campaignsQuery.refetch()
            policiesQuery.refetch()
          }}
          className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-xs font-black uppercase tracking-widest text-zinc-200 transition-all hover:bg-white/10 active:scale-[0.98]"
        >
          <RefreshCw className={cn('h-4 w-4', (campaignsQuery.isFetching || policiesQuery.isFetching) && 'animate-spin')} />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={BadgePercent} label="Campaign aktif" value={activeCampaigns.toLocaleString('id-ID')} />
        <MetricCard icon={WalletCards} label="Total budget" value={formatIdr(totalBudget)} tone="blue" />
        <MetricCard icon={Coins} label="Budget terpakai" value={formatIdr(redeemedBudget)} tone="amber" />
        <MetricCard icon={AlertTriangle} label="Risk campaign" value={riskCampaigns.toLocaleString('id-ID')} tone={riskCampaigns > 0 ? 'red' : 'emerald'} />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-[36px] border border-white/10 bg-white/[0.03] p-6 shadow-xl shadow-black/10">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-black tracking-tight text-zinc-100">Campaign baru</h2>
              <p className="mt-1 text-sm text-zinc-500">Mutasi membutuhkan role finance/superadmin dan sesi TOTP aktif.</p>
            </div>
            <Sparkles className="h-7 w-7 text-emerald-300" />
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
            <TextField label="Kode promo" value={form.code} onChange={(value) => updateForm('code', value.toUpperCase())} placeholder="TEMBUSHEMAT" />
            <TextField label="Nama campaign" value={form.name} onChange={(value) => updateForm('name', value)} placeholder="Hemat pengiriman motor" />
            <SelectField
              label="Tipe diskon"
              value={form.discount_type}
              onChange={(value) => updateForm('discount_type', value as DiscountType)}
              options={['shipping_discount', 'fixed', 'percentage', 'free_insurance']}
            />
            <SelectField
              label="Komponen"
              value={form.component_scope}
              onChange={(value) => updateForm('component_scope', value as ComponentScope)}
              options={['shipping', 'insurance', 'service_fee', 'referral']}
            />
            <TextField label="Diskon IDR" value={form.discount_value_idr} onChange={(value) => updateForm('discount_value_idr', value)} type="number" />
            <TextField label="Diskon persen" value={form.discount_percent} onChange={(value) => updateForm('discount_percent', value)} type="number" />
            <TextField label="Max diskon" value={form.max_discount_idr} onChange={(value) => updateForm('max_discount_idr', value)} type="number" />
            <TextField label="Min order" value={form.min_order_idr} onChange={(value) => updateForm('min_order_idr', value)} type="number" />
            <TextField label="Service codes" value={form.service_codes} onChange={(value) => updateForm('service_codes', value)} placeholder="instant_motor, same_day_motor" />
            <TextField label="Total budget" value={form.total_budget_idr} onChange={(value) => updateForm('total_budget_idr', value)} type="number" />
            <TextField label="Daily budget" value={form.daily_budget_idr} onChange={(value) => updateForm('daily_budget_idr', value)} type="number" />
            <TextField label="Max redemption" value={form.max_redemptions} onChange={(value) => updateForm('max_redemptions', value)} type="number" />
            <TextField label="Limit per user" value={form.per_user_limit} onChange={(value) => updateForm('per_user_limit', value)} type="number" />
            <TextField label="Mulai" value={form.starts_at} onChange={(value) => updateForm('starts_at', value)} type="datetime-local" />
            <TextField label="Berakhir" value={form.ends_at} onChange={(value) => updateForm('ends_at', value)} type="datetime-local" />
            <label className="flex min-h-[58px] items-center gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/5 px-4 py-3">
              <input
                type="checkbox"
                checked={form.risk_campaign}
                onChange={(event) => updateForm('risk_campaign', event.target.checked)}
                className="h-4 w-4 accent-amber-400"
              />
              <span className="text-sm font-bold text-amber-100">Risk campaign - wajib approval superadmin</span>
            </label>
            <div className="md:col-span-2">
              <TextField label="Alasan risk atau catatan campaign" value={form.risk_reason} onChange={(value) => updateForm('risk_reason', value)} placeholder="Contoh: kampanye akuisisi terbatas area Jakarta" />
            </div>
            <div className="md:col-span-2">
              <label className="text-xs font-black uppercase tracking-widest text-zinc-500">Deskripsi</label>
              <textarea
                value={form.description}
                onChange={(event) => updateForm('description', event.target.value)}
                className="mt-2 min-h-24 w-full rounded-2xl border border-white/10 bg-zinc-950 px-4 py-3 text-sm text-zinc-100 outline-none transition-all placeholder:text-zinc-700 focus:border-emerald-400/50 focus:ring-2 focus:ring-emerald-400/10"
                placeholder="Copy promo yang aman untuk user dan tidak menjanjikan diskon di luar policy."
              />
            </div>
          </div>

          <button
            type="button"
            disabled={createMutation.isPending}
            onClick={() => createMutation.mutate()}
            className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-5 py-4 text-sm font-black uppercase tracking-widest text-white shadow-lg shadow-emerald-950/40 transition-all hover:bg-emerald-500 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {createMutation.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
            Buat Draft Promo
          </button>
        </section>

        <section className="space-y-6">
          <div className="rounded-[36px] border border-white/10 bg-white/[0.03] p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-black tracking-tight text-zinc-100">Simulasi margin</h2>
                <p className="mt-1 text-sm text-zinc-500">Backend menolak promo jika margin policy tidak terpenuhi.</p>
              </div>
              <Target className="h-6 w-6 text-emerald-300" />
            </div>
            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <TextField label="Kode promo" value={simulation.code} onChange={(value) => updateSimulation('code', value.toUpperCase())} />
              <TextField label="Service code" value={simulation.service_code} onChange={(value) => updateSimulation('service_code', value)} />
              <TextField label="Kendaraan" value={simulation.vehicle_type} onChange={(value) => updateSimulation('vehicle_type', value)} />
              <TextField label="Zone" value={simulation.zone_code} onChange={(value) => updateSimulation('zone_code', value)} />
              <TextField label="Gross amount" value={simulation.gross_amount_idr} onChange={(value) => updateSimulation('gross_amount_idr', value)} type="number" />
              <TextField label="Insurance" value={simulation.insurance_amount_idr} onChange={(value) => updateSimulation('insurance_amount_idr', value)} type="number" />
              <TextField label="Tax" value={simulation.tax_amount_idr} onChange={(value) => updateSimulation('tax_amount_idr', value)} type="number" />
            </div>
            <button
              type="button"
              disabled={simulateMutation.isPending || !simulation.code.trim()}
              onClick={() => simulateMutation.mutate()}
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-5 py-3 text-xs font-black uppercase tracking-widest text-emerald-100 transition-all hover:bg-emerald-500/20 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {simulateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              Jalankan simulasi
            </button>
            {simulationResult && (
              <div className="mt-5 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-300" />
                  <div>
                    <p className="text-sm font-black text-emerald-100">Promo aman digunakan</p>
                    <p className="mt-1 text-xs leading-5 text-emerald-100/70">
                      Diskon {formatIdr(simulationResult.discount_amount_idr)} - payable {formatIdr(simulationResult.payable_amount_idr)} - margin {formatIdr(simulationResult.margin?.projected_margin_idr)}.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="rounded-[36px] border border-white/10 bg-white/[0.03] p-6">
            <h2 className="text-xl font-black tracking-tight text-zinc-100">Margin policy aktif</h2>
            <p className="mt-1 text-sm text-zinc-500">Policy ini dinamis dari database dan menjadi guard utama agar promo tidak rugi.</p>
            <div className="mt-5 max-h-[360px] space-y-3 overflow-y-auto pr-1">
              {policiesQuery.isError ? (
                <DataState title="Policy gagal dimuat" message={queryErrorMessage(policiesQuery.error, 'Margin policy tidak tersedia.')} onRetry={() => policiesQuery.refetch()} />
              ) : policies.length === 0 ? (
                <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-100">
                  Belum ada margin policy. Promo tidak boleh dipublish sampai policy service dikonfigurasi.
                </div>
              ) : policies.map((policy) => (
                <div key={policy.id} className="rounded-2xl border border-white/10 bg-zinc-950/80 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-black text-zinc-100">{policy.service_code}</p>
                      <p className="mt-1 text-xs text-zinc-500">{policy.vehicle_type || 'semua kendaraan'} - {policy.zone_code || 'semua zona'}</p>
                    </div>
                    <span className={cn('rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest', policy.active ? 'bg-emerald-500/10 text-emerald-300' : 'bg-zinc-800 text-zinc-500')}>
                      {policy.active ? 'active' : 'off'}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                    <div className="rounded-xl bg-white/[0.03] p-3">
                      <p className="text-zinc-500">Min amount</p>
                      <p className="mt-1 font-black text-zinc-100">{formatIdr(policy.min_margin_amount_idr)}</p>
                    </div>
                    <div className="rounded-xl bg-white/[0.03] p-3">
                      <p className="text-zinc-500">Min percent</p>
                      <p className="mt-1 font-black text-zinc-100">{Number(policy.min_margin_percent).toFixed(2)}%</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      <section className="rounded-[36px] border border-white/10 bg-white/[0.03] p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-2xl font-black tracking-tight text-zinc-100">Campaign promo</h2>
            <p className="mt-1 text-sm text-zinc-500">Lifecycle: draft - approval - publish - pause. Semua aksi dicatat di audit trail.</p>
          </div>
          <div className="relative w-full md:w-96">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Cari kode, status, atau service"
              className="w-full rounded-2xl border border-white/10 bg-zinc-950 py-3 pl-11 pr-4 text-sm text-zinc-100 outline-none transition-all placeholder:text-zinc-700 focus:border-emerald-400/50 focus:ring-2 focus:ring-emerald-400/10"
            />
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-5 xl:grid-cols-2">
          {campaignsQuery.isLoading ? (
            Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-64 animate-pulse rounded-[32px] bg-white/[0.04]" />
            ))
          ) : campaignsQuery.isError ? (
            <div className="xl:col-span-2">
              <DataState title="Campaign gagal dimuat" message={queryErrorMessage(campaignsQuery.error, 'Promo campaign tidak tersedia.')} onRetry={() => campaignsQuery.refetch()} />
            </div>
          ) : filteredCampaigns.length === 0 ? (
            <div className="xl:col-span-2 rounded-[32px] border border-dashed border-white/10 p-12 text-center">
              <BadgePercent className="mx-auto h-10 w-10 text-zinc-700" />
              <p className="mt-4 text-sm font-black uppercase tracking-widest text-zinc-500">Belum ada campaign promo</p>
            </div>
          ) : filteredCampaigns.map((campaign, index) => (
            <PromoCampaignCard
              key={campaign.id}
              campaign={campaign}
              index={index}
              actionPending={actionMutation.isPending}
              onAction={(action) => actionMutation.mutate({ id: campaign.id, action })}
              notificationPending={audienceMutation.isPending || notifyMutation.isPending}
              onPreviewAudience={() => audienceMutation.mutate(campaign.id)}
              notificationDraft={notificationDraftFor(campaign.id)}
              onNotificationDraftChange={(key, value) => updateNotificationDraft(campaign.id, key, value)}
              onNotify={() => notifyMutation.mutate({ id: campaign.id, draft: notificationDraftFor(campaign.id) })}
              analytics={analyticsByCampaign[campaign.id]}
              analyticsPending={analyticsMutation.isPending}
              onLoadAnalytics={() => analyticsMutation.mutate(campaign.id)}
            />
          ))}
        </div>
      </section>
    </div>
  )
}

function PromoCampaignCard({
  campaign,
  index,
  actionPending,
  onAction,
  notificationPending,
  onPreviewAudience,
  notificationDraft,
  onNotificationDraftChange,
  onNotify,
  analytics,
  analyticsPending,
  onLoadAnalytics,
}: {
  campaign: PromoCampaign
  index: number
  actionPending: boolean
  onAction: (action: 'submit' | 'approve' | 'publish' | 'pause') => void
  notificationPending: boolean
  onPreviewAudience: () => void
  notificationDraft: PromoNotificationDraft
  onNotificationDraftChange: <K extends keyof PromoNotificationDraft>(key: K, value: PromoNotificationDraft[K]) => void
  onNotify: () => void
  analytics?: PromoAnalytics
  analyticsPending: boolean
  onLoadAnalytics: () => void
}) {
  const services = parseServiceCodes(campaign.service_codes)
  const budgetUsage = campaign.total_budget_idr > 0
    ? Math.min(100, ((Number(campaign.redeemed_budget_idr || 0) + Number(campaign.reserved_budget_idr || 0)) / Number(campaign.total_budget_idr)) * 100)
    : 0
  const canSubmit = campaign.status === 'draft'
  const canApprove = campaign.status === 'pending_approval'
  const canPublish = campaign.status === 'scheduled' || campaign.status === 'pending_approval'
  const canPause = campaign.status === 'active' || campaign.status === 'scheduled'
  const canNotify = campaign.status === 'active' || campaign.status === 'scheduled'

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      className="rounded-[32px] border border-white/10 bg-zinc-950/80 p-6 shadow-xl shadow-black/10"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-2 text-lg font-black tracking-widest text-emerald-200">
              {campaign.code}
            </span>
            <PromoStatusPill status={campaign.status} />
            {campaign.risk_campaign && (
              <span className="rounded-full border border-red-500/20 bg-red-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-red-300">
                risk
              </span>
            )}
          </div>
          <h3 className="mt-4 text-xl font-black tracking-tight text-zinc-100">{campaign.name}</h3>
          <p className="mt-2 line-clamp-2 text-sm leading-6 text-zinc-500">{campaign.description || 'Tidak ada deskripsi campaign.'}</p>
        </div>
        <BadgePercent className="h-8 w-8 text-emerald-300/70" />
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {services.map((service) => (
          <span key={service} className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[10px] font-black uppercase tracking-widest text-zinc-400">
            {service}
          </span>
        ))}
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <MiniMetric icon={Coins} label="Diskon" value={campaign.discount_type === 'percentage' ? `${campaign.discount_percent}%` : formatIdr(campaign.discount_value_idr)} />
        <MiniMetric icon={WalletCards} label="Budget" value={formatIdr(campaign.total_budget_idr)} />
        <MiniMetric icon={Target} label="Min order" value={formatIdr(campaign.min_order_idr)} />
        <MiniMetric icon={Clock} label="Per user" value={`${campaign.per_user_limit}x`} />
      </div>

      <div className="mt-5">
        <div className="flex items-center justify-between text-xs">
          <span className="font-bold text-zinc-500">Budget reserved + redeemed</span>
          <span className="font-black text-zinc-200">{budgetUsage.toFixed(1)}%</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/[0.06]">
          <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${budgetUsage}%` }} />
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-3 text-xs text-zinc-500 md:grid-cols-2">
        <div className="flex items-center gap-2 rounded-2xl bg-white/[0.03] p-3">
          <CalendarClock className="h-4 w-4 text-zinc-400" />
          <span>{new Date(campaign.starts_at).toLocaleString('id-ID')}</span>
        </div>
        <div className="flex items-center gap-2 rounded-2xl bg-white/[0.03] p-3">
          <CalendarClock className="h-4 w-4 text-zinc-400" />
          <span>{new Date(campaign.ends_at).toLocaleString('id-ID')}</span>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        {canSubmit && <ActionButton label="Submit" icon={Send} disabled={actionPending} onClick={() => onAction('submit')} />}
        {canApprove && <ActionButton label="Approve" icon={ShieldCheck} disabled={actionPending} onClick={() => onAction('approve')} />}
        {canPublish && <ActionButton label="Publish" icon={PlayCircle} disabled={actionPending} onClick={() => onAction('publish')} />}
        {canPause && <ActionButton label="Pause" icon={PauseCircle} disabled={actionPending} tone="danger" onClick={() => onAction('pause')} />}
        <ActionButton label={analytics ? 'Refresh audit' : 'Lihat audit'} icon={ClipboardList} disabled={analyticsPending} onClick={onLoadAnalytics} />
      </div>

      {canNotify && (
        <div className="mt-5 rounded-[26px] border border-emerald-500/10 bg-emerald-500/[0.04] p-4">
          <div className="flex items-center gap-2">
            <BellRing className="h-4 w-4 text-emerald-300" />
            <p className="text-xs font-black uppercase tracking-widest text-emerald-100">Campaign notification</p>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            <SelectField
              label="Channel"
              value={notificationDraft.channel}
              onChange={(value) => onNotificationDraftChange('channel', value as PromoNotificationChannel)}
              options={['none', 'in_app', 'push_in_app', 'scheduled_push']}
            />
            {notificationDraft.channel === 'scheduled_push' ? (
              <TextField
                label="Jadwal kirim"
                value={notificationDraft.scheduled_at}
                onChange={(value) => onNotificationDraftChange('scheduled_at', value)}
                type="datetime-local"
              />
            ) : (
              <div className="rounded-2xl border border-white/10 bg-zinc-950 px-4 py-3 text-xs leading-5 text-zinc-500">
                Push langsung tetap menghormati quiet hours. Mode none hanya mencatat audit tanpa mengirim pesan.
              </div>
            )}
            <TextField label="Max per hari" value={notificationDraft.max_per_day} onChange={(value) => onNotificationDraftChange('max_per_day', value)} type="number" />
            <TextField label="Max per minggu" value={notificationDraft.max_per_week} onChange={(value) => onNotificationDraftChange('max_per_week', value)} type="number" />
            <TextField label="Quiet start" value={notificationDraft.quiet_hours_start} onChange={(value) => onNotificationDraftChange('quiet_hours_start', value)} type="time" />
            <TextField label="Quiet end" value={notificationDraft.quiet_hours_end} onChange={(value) => onNotificationDraftChange('quiet_hours_end', value)} type="time" />
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <ActionButton label="Preview audience" icon={Target} disabled={notificationPending} onClick={onPreviewAudience} />
            <ActionButton
              label={notificationDraft.channel === 'none' ? 'Simpan tanpa kirim' : 'Kirim promo'}
              icon={Send}
              disabled={notificationPending}
              onClick={onNotify}
            />
          </div>
        </div>
      )}

      {analytics && <PromoAnalyticsPanel analytics={analytics} />}
    </motion.div>
  )
}

function PromoAnalyticsPanel({ analytics }: { analytics: PromoAnalytics }) {
  return (
    <div className="mt-5 rounded-[26px] border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-zinc-500">Audit & analytics</p>
          <p className="mt-1 text-sm text-zinc-300">Budget, delivery, redemption, dan event terakhir dari backend.</p>
        </div>
        <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-emerald-300">
          {analytics.status}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <MiniMetric icon={WalletCards} label="Sisa budget" value={formatIdr(analytics.budget.remaining_budget_idr)} />
        <MiniMetric icon={Coins} label="Burn" value={`${analytics.budget.burn_rate_percent}%`} />
        <MiniMetric icon={Send} label="Terkirim" value={`${analytics.delivery.sent}/${analytics.delivery.total}`} />
        <MiniMetric icon={Target} label="Open rate" value={`${analytics.delivery.open_rate_percent}%`} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-zinc-950/70 p-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Redemption</p>
          <p className="mt-2 text-sm text-zinc-300">
            Redeemed {analytics.redemption.redeemed} dari {analytics.redemption.total}, diskon terpakai {formatIdr(analytics.redemption.discount_redeemed_idr)}, margin rata-rata {analytics.redemption.average_margin_percent}%.
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-zinc-950/70 p-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Delivery</p>
          <p className="mt-2 text-sm text-zinc-300">
            Queued {analytics.delivery.queued}, failed {analytics.delivery.failed}, opened {analytics.delivery.opened}.
          </p>
        </div>
      </div>

      <div className="mt-4 max-h-56 space-y-2 overflow-y-auto pr-1">
        {analytics.audit_events.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 p-4 text-sm text-zinc-500">Belum ada audit event.</div>
        ) : analytics.audit_events.map((event) => (
          <div key={event.id} className="rounded-2xl border border-white/10 bg-zinc-950/70 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-black text-zinc-100">{event.action.split('_').join(' ')}</p>
              <p className="text-[10px] font-bold text-zinc-500">{new Date(event.created_at).toLocaleString('id-ID')}</p>
            </div>
            <p className="mt-1 text-xs text-zinc-500">{event.reason || 'Tidak ada catatan.'}</p>
            <p className="mt-2 text-[10px] font-black uppercase tracking-widest text-zinc-600">{event.actor_role || 'system'}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function MiniMetric({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
      <div className="flex items-center gap-2 text-zinc-500">
        <Icon className="h-3.5 w-3.5" />
        <span className="text-[10px] font-black uppercase tracking-widest">{label}</span>
      </div>
      <p className="mt-2 truncate text-sm font-black text-zinc-100">{value}</p>
    </div>
  )
}

function ActionButton({ label, icon: Icon, disabled, onClick, tone = 'safe' }: { label: string; icon: any; disabled: boolean; onClick: () => void; tone?: 'safe' | 'danger' }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-2 rounded-2xl border px-4 py-3 text-[11px] font-black uppercase tracking-widest transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50',
        tone === 'danger'
          ? 'border-red-500/20 bg-red-500/10 text-red-100 hover:bg-red-500/20'
          : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-100 hover:bg-emerald-500/20'
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  )
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  type?: string
}) {
  return (
    <label className="block">
      <span className="text-xs font-black uppercase tracking-widest text-zinc-500">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="mt-2 w-full rounded-2xl border border-white/10 bg-zinc-950 px-4 py-3 text-sm text-zinc-100 outline-none transition-all placeholder:text-zinc-700 focus:border-emerald-400/50 focus:ring-2 focus:ring-emerald-400/10"
      />
    </label>
  )
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: string[]
}) {
  return (
    <label className="block">
      <span className="text-xs font-black uppercase tracking-widest text-zinc-500">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full rounded-2xl border border-white/10 bg-zinc-950 px-4 py-3 text-sm text-zinc-100 outline-none transition-all focus:border-emerald-400/50 focus:ring-2 focus:ring-emerald-400/10"
      >
        {options.map((option) => (
          <option key={option} value={option}>{option.replace('_', ' ')}</option>
        ))}
      </select>
    </label>
  )
}
