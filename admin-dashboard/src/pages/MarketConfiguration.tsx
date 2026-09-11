import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, FileCheck2, Globe2, Plus, Save, ShieldAlert } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '../lib/api'
import { AdminPageSkeleton } from '../components/ui/Skeleton'
import { StatusBadge } from '../components/StatusBadge'
import { useAuthStore } from '../store/useAuthStore'

type MarketConfig = {
  market_code: string
  country_code: string
  region_code: string
  currency_code: string
  currency_minor_unit: number
  default_locale: string
  timezone: string
  measurement_system: 'metric' | 'imperial'
  phone_rules: Record<string, unknown>
  address_rules: Record<string, unknown>
  payment_methods: unknown[]
  logistics_providers: unknown[]
  map_providers: unknown[]
  tax_policy_refs: unknown[]
  insurance_policy_refs: unknown[]
  service_hours: Record<string, unknown>
  launch_state: string
  config_version: number
  effective_from: string
  rollback_version: number | null
  approval_status: string
  approval_reason: string | null
  updated_at: string
}

type MarketDetail = {
  config: MarketConfig
  service_availability: Array<{
    city_code: string
    service_code: string
    is_enabled: boolean
    service_hours: Record<string, unknown>
    policy_refs: Record<string, unknown>
  }>
  legal_documents: Array<{
    document_type: string
    locale: string
    version: string
    document_uri: string
    status: string
    effective_from: string
  }>
  readiness?: { is_ready: boolean; reason_codes: string[] }
}

type Draft = {
  market_code: string
  country_code: string
  region_code: string
  currency_code: string
  currency_minor_unit: number
  default_locale: string
  timezone: string
  measurement_system: 'metric' | 'imperial'
  phone_rules: string
  address_rules: string
  payment_methods: string
  logistics_providers: string
  map_providers: string
  tax_policy_refs: string
  insurance_policy_refs: string
  service_hours: string
  effective_from: string
  launch_state: 'draft' | 'scheduled' | 'paused' | 'retired'
}

const prettyJson = (value: unknown) => JSON.stringify(value ?? {}, null, 2)

const toDraft = (config: MarketConfig): Draft => ({
  market_code: config.market_code,
  country_code: config.country_code,
  region_code: config.region_code,
  currency_code: config.currency_code,
  currency_minor_unit: config.currency_minor_unit,
  default_locale: config.default_locale,
  timezone: config.timezone,
  measurement_system: config.measurement_system,
  phone_rules: prettyJson(config.phone_rules),
  address_rules: prettyJson(config.address_rules),
  payment_methods: prettyJson(config.payment_methods),
  logistics_providers: prettyJson(config.logistics_providers),
  map_providers: prettyJson(config.map_providers),
  tax_policy_refs: prettyJson(config.tax_policy_refs),
  insurance_policy_refs: prettyJson(config.insurance_policy_refs),
  service_hours: prettyJson(config.service_hours),
  effective_from: new Date(config.effective_from).toISOString().slice(0, 16),
  launch_state: config.launch_state === 'active' ? 'paused' : config.launch_state as Draft['launch_state'],
})

const parseJson = (value: string, field: string) => {
  try {
    return JSON.parse(value)
  } catch {
    throw new Error(`${field} harus berupa JSON yang valid`)
  }
}

const inputClass = 'w-full rounded-xl border border-border bg-scrim/30 px-3 py-2 text-sm text-foreground-muted outline-none focus:border-primary'
const labelClass = 'space-y-1'

export default function MarketConfiguration() {
  const { user } = useAuthStore()
  const queryClient = useQueryClient()
  const [selectedCode, setSelectedCode] = useState('')
  const [draft, setDraft] = useState<Draft | null>(null)
  const [approvalReason, setApprovalReason] = useState('')
  const [serviceDraft, setServiceDraft] = useState({ city_code: '', service_code: '', is_enabled: true, service_hours: '{\n  "inherits": "market_default"\n}', policy_refs: '{}' })
  const [legalDraft, setLegalDraft] = useState({ document_type: 'terms', locale: 'id-ID', version: '', document_uri: '', status: 'draft', effective_from: new Date().toISOString().slice(0, 16) })
  const canWrite = ['super_admin', 'ops_admin'].includes(user?.role || '')

  const configsQuery = useQuery<{ data: MarketConfig[] }>({
    queryKey: ['market-configs'],
    queryFn: async () => (await api.get('/admin/market-configs')).data,
  })
  const configs = configsQuery.data?.data || []

  useEffect(() => {
    if (!selectedCode && configs[0]?.market_code) setSelectedCode(configs[0].market_code)
  }, [configs, selectedCode])

  const detailQuery = useQuery<{ data: MarketDetail }>({
    queryKey: ['market-config', selectedCode],
    queryFn: async () => (await api.get(`/admin/market-configs/${selectedCode}`)).data,
    enabled: Boolean(selectedCode),
  })
  const detail = detailQuery.data?.data

  useEffect(() => {
    if (detail?.config) setDraft(toDraft(detail.config))
  }, [detail?.config])

  const updateDraft = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((current) => current ? { ...current, [key]: value } : current)
  }

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!draft) throw new Error('Pilih market terlebih dahulu')
      return api.patch(`/admin/market-configs/${draft.market_code}`, {
        country_code: draft.country_code,
        region_code: draft.region_code,
        currency_code: draft.currency_code,
        currency_minor_unit: draft.currency_minor_unit,
        default_locale: draft.default_locale,
        timezone: draft.timezone,
        measurement_system: draft.measurement_system,
        phone_rules: parseJson(draft.phone_rules, 'phone_rules'),
        address_rules: parseJson(draft.address_rules, 'address_rules'),
        payment_methods: parseJson(draft.payment_methods, 'payment_methods'),
        logistics_providers: parseJson(draft.logistics_providers, 'logistics_providers'),
        map_providers: parseJson(draft.map_providers, 'map_providers'),
        tax_policy_refs: parseJson(draft.tax_policy_refs, 'tax_policy_refs'),
        insurance_policy_refs: parseJson(draft.insurance_policy_refs, 'insurance_policy_refs'),
        service_hours: parseJson(draft.service_hours, 'service_hours'),
        effective_from: new Date(draft.effective_from).toISOString(),
        launch_state: draft.launch_state,
      }, { headers: { 'X-Idempotency-Key': `market-config-${draft.market_code}-${Date.now()}` } })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['market-configs'] })
      queryClient.invalidateQueries({ queryKey: ['market-config', selectedCode] })
      toast.success('Market config disimpan dan menunggu approval ulang.')
    },
    onError: (error: any) => toast.error(error.response?.data?.message || error.message || 'Market config gagal disimpan'),
  })

  const availabilityMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCode) throw new Error('Pilih market terlebih dahulu')
      return api.put(`/admin/market-configs/${selectedCode}/services`, {
        city_code: serviceDraft.city_code,
        service_code: serviceDraft.service_code,
        is_enabled: serviceDraft.is_enabled,
        service_hours: parseJson(serviceDraft.service_hours, 'service_hours'),
        policy_refs: parseJson(serviceDraft.policy_refs, 'policy_refs'),
      }, { headers: { 'X-Idempotency-Key': `market-service-${selectedCode}-${serviceDraft.city_code}-${serviceDraft.service_code}-${Date.now()}` } })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['market-config', selectedCode] })
      toast.success('Availability market/city disimpan.')
    },
    onError: (error: any) => toast.error(error.response?.data?.message || error.message || 'Availability gagal disimpan'),
  })

  const legalMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCode) throw new Error('Pilih market terlebih dahulu')
      return api.put(`/admin/market-configs/${selectedCode}/legal-documents`, {
        ...legalDraft,
        effective_from: new Date(legalDraft.effective_from).toISOString(),
      }, { headers: { 'X-Idempotency-Key': `market-legal-${selectedCode}-${legalDraft.document_type}-${legalDraft.version}-${Date.now()}` } })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['market-config', selectedCode] })
      toast.success('Dokumen legal disimpan.')
    },
    onError: (error: any) => toast.error(error.response?.data?.message || error.message || 'Dokumen legal gagal disimpan'),
  })

  const approveMutation = useMutation({
    mutationFn: async () => api.post(`/admin/market-configs/${selectedCode}/approve`, { reason: approvalReason }, { headers: { 'X-Idempotency-Key': `market-approve-${selectedCode}-${Date.now()}` } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['market-configs'] })
      queryClient.invalidateQueries({ queryKey: ['market-config', selectedCode] })
      setApprovalReason('')
      toast.success('Market aktif setelah readiness check server lulus.')
    },
    onError: (error: any) => toast.error(error.response?.data?.message || error.message || 'Market belum siap di-approve'),
  })

  const readinessText = !detail?.readiness
    ? 'Memuat readiness…'
    : detail.readiness.is_ready
      ? 'Ready untuk transaksi'
      : `Belum ready: ${detail.readiness.reason_codes.join(', ')}`

  if (configsQuery.isLoading) return <AdminPageSkeleton />

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-primary-light">Global Platform Control Plane</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-foreground-muted">Market Configuration</h1>
          <p className="mt-2 max-w-3xl text-sm text-foreground-muted">Kelola market, city/service availability, payment/logistics/maps capability, policy reference, legal version, dan approval tanpa menaruh credential provider di client.</p>
        </div>
        <div className="flex items-center gap-2 rounded-2xl border border-warning bg-warning-surface px-4 py-3 text-xs text-warning"><ShieldAlert className="h-4 w-4" aria-hidden="true" /> Market yang belum lengkap fail-closed untuk transaksi.</div>
      </header>

      <section className="rounded-3xl border border-border bg-surface-subtle p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-3 text-sm font-bold text-foreground-muted">Market
            <select className={inputClass + ' min-w-48'} value={selectedCode} onChange={(event) => setSelectedCode(event.target.value)}>
              {configs.length === 0 && <option value="">Tidak ada market</option>}
              {configs.map((config) => <option key={config.market_code} value={config.market_code}>{config.market_code} · {config.country_code}</option>)}
            </select>
          </label>
          {detail?.config && <StatusBadge status={detail.readiness?.is_ready ? 'ready' : 'pending_review'} label={readinessText} labelPrefix="Market readiness status" />}
        </div>
      </section>

      {detailQuery.isLoading || !draft || !detail ? <AdminPageSkeleton /> : <>
        <section className="rounded-3xl border border-border bg-surface-subtle p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><h2 className="text-xl font-black text-foreground">{draft.market_code} · canonical market facts</h2><p className="mt-1 text-xs text-foreground-muted">Version {detail.config.config_version}; perubahan material otomatis kembali ke pending approval dan menyimpan rollback version.</p></div>
            {canWrite && <button disabled={updateMutation.isPending} onClick={() => updateMutation.mutate()} className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-black text-on-primary disabled:opacity-60"><Save className="h-4 w-4" aria-hidden="true" /> Simpan config</button>}
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            {(['country_code', 'region_code', 'currency_code', 'default_locale', 'timezone'] as const).map((key) => <label className={labelClass} key={key}><span className="text-xs font-bold uppercase tracking-wide text-foreground-muted">{key}</span><input className={inputClass} value={draft[key]} onChange={(event) => updateDraft(key, event.target.value as Draft[typeof key])} /></label>)}
            <label className={labelClass}><span className="text-xs font-bold uppercase tracking-wide text-foreground-muted">currency minor unit</span><input className={inputClass} type="number" min="0" max="3" value={draft.currency_minor_unit} onChange={(event) => updateDraft('currency_minor_unit', Number(event.target.value))} /></label>
            <label className={labelClass}><span className="text-xs font-bold uppercase tracking-wide text-foreground-muted">measurement system</span><select className={inputClass} value={draft.measurement_system} onChange={(event) => updateDraft('measurement_system', event.target.value as Draft['measurement_system'])}><option value="metric">metric</option><option value="imperial">imperial</option></select></label>
            <label className={labelClass}><span className="text-xs font-bold uppercase tracking-wide text-foreground-muted">effective from</span><input className={inputClass} type="datetime-local" value={draft.effective_from} onChange={(event) => updateDraft('effective_from', event.target.value)} /></label>
            <label className={labelClass}><span className="text-xs font-bold uppercase tracking-wide text-foreground-muted">launch state</span><select className={inputClass} value={draft.launch_state} onChange={(event) => updateDraft('launch_state', event.target.value as Draft['launch_state'])}>{['draft', 'scheduled', 'paused', 'retired'].map((state) => <option key={state} value={state}>{state}</option>)}</select></label>
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {(['phone_rules', 'address_rules', 'payment_methods', 'logistics_providers', 'map_providers', 'tax_policy_refs', 'insurance_policy_refs', 'service_hours'] as const).map((key) => <label className={labelClass} key={key}><span className="text-xs font-bold uppercase tracking-wide text-foreground-muted">{key}</span><textarea className={inputClass + ' min-h-28 font-mono text-xs'} value={draft[key]} onChange={(event) => updateDraft(key, event.target.value)} /></label>)}
          </div>
          {canWrite && <div className="mt-5 flex flex-wrap items-end gap-3 border-t border-border pt-5"><label className="flex-1 space-y-1"><span className="text-xs font-bold tracking-wide text-foreground-muted">Approval reason</span><input className={inputClass} value={approvalReason} onChange={(event) => setApprovalReason(event.target.value)} placeholder="Alasan review readiness market" /></label><button disabled={approveMutation.isPending || !approvalReason.trim()} onClick={() => approveMutation.mutate()} className="flex items-center gap-2 rounded-xl bg-success px-4 py-2 text-sm font-black text-on-success disabled:opacity-60"><CheckCircle2 className="h-4 w-4"  aria-hidden="true"/> Approve & aktifkan</button></div>}
        </section>

        <div className="grid gap-6 xl:grid-cols-2">
          <section className="rounded-3xl border border-border bg-surface-subtle p-5">
            <div className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-black text-foreground">City / service availability</h2><p className="mt-1 text-xs text-foreground-muted">Availability disimpan sebagai data market, bukan fork kode negara.</p></div><Plus className="h-5 w-5 text-primary-light" aria-hidden="true" /></div>
          {canWrite && <div className="mt-4 grid gap-3 sm:grid-cols-2"><input aria-label="Availability city code" className={inputClass} placeholder="city_code, contoh jakarta" value={serviceDraft.city_code} onChange={(event) => setServiceDraft({ ...serviceDraft, city_code: event.target.value })} /><input aria-label="Availability service code" className={inputClass} placeholder="service_code" value={serviceDraft.service_code} onChange={(event) => setServiceDraft({ ...serviceDraft, service_code: event.target.value })} /><label className="flex items-center gap-2 text-sm text-foreground-muted"><input type="checkbox" checked={serviceDraft.is_enabled} onChange={(event) => setServiceDraft({ ...serviceDraft, is_enabled: event.target.checked })} /> enabled</label><button disabled={availabilityMutation.isPending} onClick={() => availabilityMutation.mutate()} className="rounded-xl bg-primary px-3 py-2 text-sm font-bold text-on-primary disabled:opacity-60">Simpan availability</button></div>}
            <div className="mt-4 space-y-2">{detail.service_availability.map((item) => <div key={`${item.city_code}-${item.service_code}`} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface-subtle px-3 py-2 text-sm"><span className="text-foreground-muted">{item.city_code} · {item.service_code}</span><StatusBadge status={item.is_enabled ? 'enabled' : 'disabled'} label={item.is_enabled ? 'Aktif' : 'Dinonaktifkan'} labelPrefix="Service availability status" /></div>)}</div>
          </section>

          <section className="rounded-3xl border border-border bg-surface-subtle p-5">
            <div className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-black text-foreground">Legal / privacy / terms</h2><p className="mt-1 text-xs text-foreground-muted">Version dan effective date menjadi bagian dari readiness approval.</p></div><FileCheck2 className="h-5 w-5 text-primary-light" aria-hidden="true" /></div>
          {canWrite && <div className="mt-4 grid gap-3 sm:grid-cols-2"><input aria-label="Legal document type" className={inputClass} placeholder="document type" value={legalDraft.document_type} onChange={(event) => setLegalDraft({ ...legalDraft, document_type: event.target.value })} /><input aria-label="Legal document locale" className={inputClass} placeholder="locale" value={legalDraft.locale} onChange={(event) => setLegalDraft({ ...legalDraft, locale: event.target.value })} /><input aria-label="Legal document version" className={inputClass} placeholder="version" value={legalDraft.version} onChange={(event) => setLegalDraft({ ...legalDraft, version: event.target.value })} /><input aria-label="Legal document public URI" className={inputClass} placeholder="public document URI" value={legalDraft.document_uri} onChange={(event) => setLegalDraft({ ...legalDraft, document_uri: event.target.value })} /><input aria-label="Legal document effective date" className={inputClass} type="datetime-local" value={legalDraft.effective_from} onChange={(event) => setLegalDraft({ ...legalDraft, effective_from: event.target.value })} /><button disabled={legalMutation.isPending} onClick={() => legalMutation.mutate()} className="rounded-xl bg-primary px-3 py-2 text-sm font-bold text-on-primary disabled:opacity-60">Simpan dokumen</button></div>}
            <div className="mt-4 space-y-2">{detail.legal_documents.map((doc) => <div key={`${doc.document_type}-${doc.locale}-${doc.version}`} className="rounded-xl border border-border bg-surface-subtle px-3 py-2 text-sm"><div className="flex items-center justify-between gap-2"><span className="font-bold text-foreground-muted">{doc.document_type} · {doc.locale}</span><StatusBadge status={doc.status} labelPrefix="Legal document status" /></div><p className="mt-1 text-xs text-foreground-muted">{doc.version} · {doc.document_uri}</p></div>)}</div>
          </section>
        </div>
      </>}
    </div>
  )
}
