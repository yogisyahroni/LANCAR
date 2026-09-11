import { useMemo, useState } from 'react'
import { CheckCircle2, ExternalLink, RefreshCw, Save, ShieldCheck, Smartphone } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '../lib/api'
import { useAuthStore } from '../store/useAuthStore'
import { EXPERIENCE_CAPABILITIES, hasExperiencePermission } from '../lib/experiencePermissions'
import { StatusBadge } from '../components/StatusBadge'

type ClientType = 'customer' | 'courier' | 'merchant' | 'web'
type Platform = 'android' | 'web'
type UpdateMode = 'none' | 'soft' | 'hard'
type HardBlockReason = 'none' | 'unsafe' | 'incompatible'

type ReleasePolicy = {
  id: string
  market_code: string
  client_type: ClientType
  platform: Platform
  latest_version_code: number
  latest_version_name: string
  min_supported_version_code: number
  min_supported_version_name: string
  recommended_version_code: number | null
  recommended_version_name: string | null
  update_mode: UpdateMode
  hard_block_reason: HardBlockReason
  localized_messages: Record<string, string | { title: string; body: string }>
  store_destinations: Record<string, string>
  allow_active_order_access: boolean
  allow_support_access: boolean
  allow_new_transactions: boolean
  remote_config_scope: 'release_metadata'
  revision: number
  effective_from: string
  effective_to: string | null
  updated_at: string
}

type PolicyImpact = {
  coverage: 'observed' | 'no_observed_events'
  window_days: number
  observed_events: number
  affected_events: number
  affected_share_pct: number | null
  unknown_events: number
  versions: Array<{ app_version: string; observed_events: number; share_pct: number; affected: boolean | null }>
}

type FormState = {
  market_code: string
  client_type: ClientType
  platform: Platform
  latest_version_code: string
  latest_version_name: string
  min_supported_version_code: string
  min_supported_version_name: string
  recommended_version_code: string
  recommended_version_name: string
  update_mode: UpdateMode
  hard_block_reason: HardBlockReason
  title_id: string
  title_en: string
  message_id: string
  message_en: string
  store_url: string
  effective_from: string
  effective_to: string
  reason: string
}

const inputClass = 'mt-1 w-full rounded-xl border border-border bg-surface-subtle px-3 py-2.5 text-sm text-foreground-muted outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/20'
const clientLabels: Record<ClientType, string> = { customer: 'Customer', courier: 'Courier', merchant: 'Merchant', web: 'Web' }
const localDateTime = (value: Date) => new Date(value.getTime() - value.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
const localizedCopy = (value: string | { title: string; body: string } | undefined, fallbackTitle: string) => typeof value === 'string'
  ? { title: fallbackTitle, body: value }
  : value ?? { title: fallbackTitle, body: '' }

const newForm = (): FormState => ({
  market_code: 'id-jk',
  client_type: 'customer',
  platform: 'android',
  latest_version_code: '1',
  latest_version_name: '1.0.0',
  min_supported_version_code: '1',
  min_supported_version_name: '1.0.0',
  recommended_version_code: '',
  recommended_version_name: '',
  update_mode: 'none',
  hard_block_reason: 'none',
  title_id: 'Pembaruan aplikasi',
  title_en: 'App update available',
  message_id: 'Versi baru tersedia. Perbarui aplikasi saat siap.',
  message_en: 'A new version is available. Update when ready.',
  store_url: '',
  effective_from: localDateTime(new Date()),
  effective_to: '',
  reason: 'Release policy updated from admin dashboard',
})

const requestKey = () => `admin.mobile_release_policy.${typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`}`
const errorMessage = (error: unknown) => {
  const response = error as { response?: { data?: { message?: unknown } } }
  return typeof response.response?.data?.message === 'string' ? response.response.data.message : 'Release policy operation failed'
}

const toForm = (policy: ReleasePolicy): FormState => ({
  market_code: policy.market_code,
  client_type: policy.client_type,
  platform: policy.platform,
  latest_version_code: String(policy.latest_version_code),
  latest_version_name: policy.latest_version_name,
  min_supported_version_code: String(policy.min_supported_version_code),
  min_supported_version_name: policy.min_supported_version_name,
  recommended_version_code: policy.recommended_version_code === null ? '' : String(policy.recommended_version_code),
  recommended_version_name: policy.recommended_version_name ?? '',
  update_mode: policy.update_mode,
  hard_block_reason: policy.hard_block_reason,
  title_id: localizedCopy(policy.localized_messages['id-ID'], 'Pembaruan aplikasi').title,
  title_en: localizedCopy(policy.localized_messages['en-US'], 'App update available').title,
  message_id: localizedCopy(policy.localized_messages['id-ID'], 'Pembaruan aplikasi').body,
  message_en: localizedCopy(policy.localized_messages['en-US'], 'App update available').body,
  store_url: policy.store_destinations.primary ?? policy.store_destinations.default ?? '',
  effective_from: localDateTime(new Date(policy.effective_from)),
  effective_to: policy.effective_to ? localDateTime(new Date(policy.effective_to)) : '',
  reason: `Revision ${policy.revision} updated from admin dashboard`,
})

export default function MobileReleasePolicies() {
  const { user } = useAuthStore()
  const canMutate = hasExperiencePermission(user, EXPERIENCE_CAPABILITIES.versionPolicyWrite)
  const queryClient = useQueryClient()
  const [form, setForm] = useState<FormState>(newForm)
  const [showForm, setShowForm] = useState(false)
  const query = useQuery({
    queryKey: ['mobile-release-policies'],
    queryFn: async (): Promise<ReleasePolicy[]> => (await api.get('/admin/mobile-release-policies', { params: { market_code: form.market_code } })).data?.data ?? [],
  })
  const isHard = form.update_mode === 'hard'
  const impactQuery = useQuery({
    queryKey: ['mobile-release-policy-impact', form.market_code, form.client_type, form.platform, form.min_supported_version_name],
    enabled: showForm && isHard && Boolean(form.market_code.trim() && form.min_supported_version_name.trim()),
    queryFn: async (): Promise<PolicyImpact> => (await api.get('/admin/mobile-release-policies/impact', { params: {
      market_code: form.market_code.trim().toLowerCase(),
      client_type: form.client_type,
      platform: form.platform,
      min_supported_version_name: form.min_supported_version_name.trim(),
      window_days: 30,
    } })).data?.data,
  })

  const saveMutation = useMutation({
    mutationFn: async () => {
      const isHard = form.update_mode === 'hard'
      const payload = {
        latest_version_code: Number(form.latest_version_code),
        latest_version_name: form.latest_version_name.trim(),
        min_supported_version_code: Number(form.min_supported_version_code),
        min_supported_version_name: form.min_supported_version_name.trim(),
        recommended_version_code: form.recommended_version_code ? Number(form.recommended_version_code) : null,
        recommended_version_name: form.recommended_version_name.trim() || null,
        update_mode: form.update_mode,
        hard_block_reason: isHard ? form.hard_block_reason : 'none',
        localized_messages: {
          ...(form.message_id.trim() ? { 'id-ID': { title: form.title_id.trim(), body: form.message_id.trim() } } : {}),
          ...(form.message_en.trim() ? { 'en-US': { title: form.title_en.trim(), body: form.message_en.trim() } } : {}),
        },
        store_destinations: form.store_url.trim() ? { primary: form.store_url.trim() } : {},
        effective_from: new Date(form.effective_from).toISOString(),
        effective_to: form.effective_to.trim() ? new Date(form.effective_to).toISOString() : null,
        confirm_hard_update: isHard,
        reason: form.reason.trim(),
      }
      return api.put(`/admin/mobile-release-policies/${encodeURIComponent(form.market_code.trim().toLowerCase())}/${form.client_type}/${form.platform}`, payload, { headers: { 'X-Idempotency-Key': requestKey() } })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mobile-release-policies'] })
      setShowForm(false)
      toast.success('Mobile release policy saved')
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  const sorted = useMemo(() => [...(query.data ?? [])].sort((a, b) => `${a.market_code}:${a.client_type}:${a.platform}`.localeCompare(`${b.market_code}:${b.client_type}:${b.platform}`)), [query.data])
  const validWindow = Boolean(form.effective_from && (!form.effective_to || new Date(form.effective_to).getTime() > new Date(form.effective_from).getTime()))
  const hardImpactReady = !isHard || impactQuery.data?.coverage === 'observed'
  const canSave = Boolean(form.market_code.trim() && form.latest_version_name.trim() && form.min_supported_version_name.trim() && form.reason.trim() && validWindow && hardImpactReady && (!isHard || form.hard_block_reason !== 'none'))

  const save = () => {
    if (isHard) {
      const impact = impactQuery.data
      if (!impact || impact.coverage !== 'observed') {
        toast.error('Hard update memerlukan estimasi versi teramati sebelum publish')
        return
      }
      const affected = impact.affected_share_pct == null ? 'unknown' : `${impact.affected_share_pct}%`
      if (!window.confirm(`Konfirmasi hard update untuk ${form.market_code}/${form.client_type}/${form.platform}. Estimasi client terdampak di sample 30 hari: ${affected}. Akses order aktif/support tetap tersedia; transaksi baru ditahan. Lanjutkan?`)) return
    }
    saveMutation.mutate()
  }

  const edit = (policy: ReleasePolicy) => {
    setForm(toForm(policy))
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className="space-y-6 p-6 lg:p-8">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-3"><Smartphone className="text-primary-light" size={26} aria-hidden="true" /><h1 className="text-3xl font-black tracking-tight text-foreground-muted">Mobile Release Policies</h1></div>
          <p className="mt-2 max-w-4xl text-sm leading-relaxed text-foreground-muted">Kelola minimum version, soft update, dan hard update per market/client/platform. Hard update selalu mempertahankan akses pesanan aktif dan support; transaksi baru ditahan sampai binary diperbarui.</p>
        </div>
        <div className="flex gap-2"><button type="button" onClick={() => query.refetch()} className="inline-flex items-center justify-center gap-2 rounded-xl border border-border px-4 py-3 text-xs font-black uppercase tracking-wide text-foreground-muted"><RefreshCw size={14} aria-hidden="true" /> Refresh</button>{canMutate ? <button type="button" onClick={() => { setForm(newForm()); setShowForm(true) }} className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-xs font-black uppercase tracking-wide text-on-primary"><Save size={14} aria-hidden="true" /> New policy</button> : null}</div>
      </header>

      <section className="rounded-3xl border border-warning bg-warning-surface p-5" aria-label="release policy safety boundary">
        <div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 shrink-0 text-warning" size={20} aria-hidden="true" /><div><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-black text-warning">Release metadata only</p><span className="rounded-full border border-error bg-error-surface px-2 py-1 text-xs font-black uppercase tracking-wide text-error">Requires App Release</span></div><p className="mt-1 text-xs leading-relaxed text-warning">Remote policy tidak mengirim kode native, JavaScript executable, atau menggantikan store review. Capability native baru diberi label <strong>Requires App Release</strong> dan tetap memerlukan build serta review platform.</p></div></div>
      </section>

      {showForm ? <section className="rounded-3xl border border-border bg-surface/[0.03] p-5 shadow-xl shadow-scrim" aria-labelledby="release-policy-editor-title">
        <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-wide text-primary-light">Scoped policy editor</p><h2 id="release-policy-editor-title" className="mt-1 text-xl font-black text-foreground-muted">Set release gate</h2></div><CheckCircle2 className="text-success" size={20}  aria-hidden="true"/></div>
        <div className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <label className="text-xs font-bold text-foreground-muted">Market code<input className={inputClass} value={form.market_code} onChange={(event) => setForm({ ...form, market_code: event.target.value })} /></label>
          <label className="text-xs font-bold text-foreground-muted">Client<select className={inputClass} value={form.client_type} onChange={(event) => { const clientType = event.target.value as ClientType; setForm({ ...form, client_type: clientType, platform: clientType === 'web' ? 'web' : 'android' }) }}>{Object.entries(clientLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="text-xs font-bold text-foreground-muted">Platform<select className={inputClass} value={form.platform} disabled={form.client_type === 'web'} onChange={(event) => setForm({ ...form, platform: event.target.value as Platform })}><option value="android">Android</option><option value="web">Web</option></select></label>
          <label className="text-xs font-bold text-foreground-muted">Update mode<select className={inputClass} value={form.update_mode} onChange={(event) => { const updateMode = event.target.value as UpdateMode; setForm({ ...form, update_mode: updateMode, hard_block_reason: updateMode === 'hard' ? (form.hard_block_reason === 'none' ? 'unsafe' : form.hard_block_reason) : 'none' }) }}><option value="none">None</option><option value="soft">Soft — dismissible</option><option value="hard">Hard — required</option></select></label>
          <label className="text-xs font-bold text-foreground-muted">Latest version code<input type="number" min="1" className={inputClass} value={form.latest_version_code} onChange={(event) => setForm({ ...form, latest_version_code: event.target.value })} /></label>
          <label className="text-xs font-bold text-foreground-muted">Latest version name<input className={inputClass} placeholder="1.2.3" value={form.latest_version_name} onChange={(event) => setForm({ ...form, latest_version_name: event.target.value })} /></label>
          <label className="text-xs font-bold text-foreground-muted">Minimum version code<input type="number" min="1" className={inputClass} value={form.min_supported_version_code} onChange={(event) => setForm({ ...form, min_supported_version_code: event.target.value })} /></label>
          <label className="text-xs font-bold text-foreground-muted">Minimum version name<input className={inputClass} placeholder="1.0.0" value={form.min_supported_version_name} onChange={(event) => setForm({ ...form, min_supported_version_name: event.target.value })} /></label>
          <label className="text-xs font-bold text-foreground-muted">Recommended code<input type="number" min="1" className={inputClass} value={form.recommended_version_code} onChange={(event) => setForm({ ...form, recommended_version_code: event.target.value })} placeholder="Optional" /></label>
          <label className="text-xs font-bold text-foreground-muted">Recommended name<input className={inputClass} value={form.recommended_version_name} onChange={(event) => setForm({ ...form, recommended_version_name: event.target.value })} placeholder="Optional" /></label>
          <label className="text-xs font-bold text-foreground-muted">Hard-block reason<select className={inputClass} value={form.hard_block_reason} disabled={!isHard} onChange={(event) => setForm({ ...form, hard_block_reason: event.target.value as HardBlockReason })}><option value="none">None</option><option value="unsafe">Unsafe binary</option><option value="incompatible">Incompatible binary</option></select></label>
          <label className="text-xs font-bold text-foreground-muted">Store destination URL<input type="url" className={inputClass} value={form.store_url} onChange={(event) => setForm({ ...form, store_url: event.target.value })} placeholder="https://..." /></label>
          <label className="text-xs font-bold text-foreground-muted">Effective start<input type="datetime-local" className={inputClass} value={form.effective_from} onChange={(event) => setForm({ ...form, effective_from: event.target.value })} /></label>
          <label className="text-xs font-bold text-foreground-muted">Effective end<input type="datetime-local" className={inputClass} value={form.effective_to} onChange={(event) => setForm({ ...form, effective_to: event.target.value })} placeholder="Optional" /></label>
          <label className="text-xs font-bold text-foreground-muted">Bahasa Indonesia title<input className={inputClass} maxLength={120} value={form.title_id} onChange={(event) => setForm({ ...form, title_id: event.target.value })} /></label>
          <label className="text-xs font-bold text-foreground-muted">English title<input className={inputClass} maxLength={120} value={form.title_en} onChange={(event) => setForm({ ...form, title_en: event.target.value })} /></label>
          <label className="text-xs font-bold text-foreground-muted md:col-span-2">Bahasa Indonesia body<textarea className={`${inputClass} min-h-20 resize-y`} maxLength={240} value={form.message_id} onChange={(event) => setForm({ ...form, message_id: event.target.value })} /></label>
          <label className="text-xs font-bold text-foreground-muted md:col-span-2">English body<textarea className={`${inputClass} min-h-20 resize-y`} maxLength={240} value={form.message_en} onChange={(event) => setForm({ ...form, message_en: event.target.value })} /></label>
          <label className="text-xs font-bold text-foreground-muted md:col-span-4">Audit reason<input className={inputClass} value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} /></label>
        </div>
        {isHard ? <p className="mt-4 rounded-xl border border-error bg-error-surface p-3 text-xs leading-relaxed text-error">Hard update hanya valid untuk binary unsafe/incompatible. Akses pesanan aktif dan support dipertahankan; transaksi baru otomatis ditahan oleh server.</p> : null}
        {isHard ? <section className="mt-5 rounded-2xl border border-info bg-info-surface p-4" aria-label="hard update impact estimate"><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-wide text-info">Affected version estimate</p><p className="mt-1 text-xs text-info">Observed experience telemetry, last {impactQuery.data?.window_days ?? 30} days. This is a release-safety sample, not a fabricated total-user count.</p></div><span className="rounded-full bg-surface-subtle px-2 py-1 text-xs font-black uppercase tracking-wide text-info">{impactQuery.isLoading ? 'Loading' : impactQuery.data?.coverage === 'observed' ? `${impactQuery.data.observed_events} events` : 'No sample'}</span></div>{impactQuery.isError ? <p className="mt-3 text-xs text-error">Impact estimate unavailable; hard update remains blocked.</p> : null}{impactQuery.data?.coverage === 'no_observed_events' ? <p className="mt-3 text-xs text-warning">Belum ada telemetry versi untuk scope ini. Hard update tidak dapat dipublish sampai sample teramati tersedia.</p> : null}{impactQuery.data?.coverage === 'observed' ? <div className="mt-3 grid gap-2 sm:grid-cols-3"><div className="rounded-xl bg-surface-subtle p-3"><p className="text-xs uppercase tracking-wide text-foreground-muted">Affected</p><p className="mt-1 text-lg font-black text-error">{impactQuery.data.affected_share_pct == null ? '—' : `${impactQuery.data.affected_share_pct}%`}</p></div><div className="rounded-xl bg-surface-subtle p-3"><p className="text-xs uppercase tracking-wide text-foreground-muted">Unknown</p><p className="mt-1 text-lg font-black text-warning">{impactQuery.data.unknown_events}</p></div><div className="rounded-xl bg-surface-subtle p-3"><p className="text-xs font-black text-success">Order + support open</p></div></div> : null}{impactQuery.data?.versions.length ? <div className="mt-3 space-y-1">{impactQuery.data.versions.map((version) => <div key={version.app_version} className="flex items-center justify-between rounded-lg bg-surface-subtle px-3 py-2 text-xs"><span className="font-mono text-foreground-muted">{version.app_version}</span><span className="text-foreground-muted">{version.share_pct}% · {version.affected === null ? 'unknown' : version.affected ? 'affected' : 'supported'}</span></div>)}</div> : null}</section> : null}
        <div className="mt-5 flex flex-wrap items-center gap-3"><button type="button" disabled={!canSave || !canMutate || saveMutation.isPending} onClick={save} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-3 text-xs font-black uppercase tracking-wide text-on-primary disabled:opacity-60"><Save size={14} aria-hidden="true" /> {saveMutation.isPending ? 'Saving...' : isHard ? 'Confirm and publish policy' : 'Save policy'}</button><button type="button" onClick={() => setShowForm(false)} className="rounded-xl border border-border px-4 py-3 text-xs font-black uppercase tracking-wide text-foreground-muted">Cancel</button><p className="text-xs text-foreground-muted">Perubahan hard dilindungi permission policy, TOTP, konfirmasi eksplisit, reason audit dan idempotency key.</p></div>
      </section> : null}

      <section className="rounded-3xl border border-border bg-surface/[0.03] p-5" aria-labelledby="release-policy-list-title">
        <div className="flex items-center justify-between gap-3"><div><h2 id="release-policy-list-title" className="text-lg font-black text-foreground-muted">Active policy matrix</h2><p className="mt-1 text-xs text-foreground-muted">One policy per market, client, and platform. Revision history is retained server-side.</p></div><span className="rounded-full bg-surface-subtle px-3 py-1 text-xs font-black uppercase tracking-wide text-foreground-muted">{sorted.length} policies</span></div>
        {query.isLoading ? <p className="mt-5 text-sm text-foreground-muted">Loading release policies...</p> : null}
        {query.isError ? <p className="mt-5 text-sm text-error">Release policy list failed to load.</p> : null}
        <div className="mt-5 grid gap-3 xl:grid-cols-2">{sorted.map((policy) => <article key={policy.id} className="rounded-2xl border border-border bg-surface-subtle p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><span className="font-mono text-xs text-primary-light">{policy.market_code}</span><span className="rounded-full bg-surface-subtle px-2 py-1 text-xs font-black uppercase tracking-wide text-foreground-muted">{clientLabels[policy.client_type]}</span><span className="rounded-full bg-surface-subtle px-2 py-1 text-xs font-black uppercase tracking-wide text-foreground-muted">{policy.platform}</span><StatusBadge status={policy.update_mode === 'hard' ? 'blocked' : policy.update_mode === 'soft' ? 'pending_review' : 'healthy'} label={policy.update_mode === 'hard' ? 'Wajib diperbarui' : policy.update_mode === 'soft' ? 'Dapat ditunda' : 'Tidak ada kewajiban'} labelPrefix="Update mode status" /></div><p className="mt-3 text-sm font-bold text-foreground-muted">Latest {policy.latest_version_name} · minimum {policy.min_supported_version_name}</p><p className="mt-1 text-xs text-foreground-muted">Recommended: {policy.recommended_version_name ?? 'none'} · reason: {policy.hard_block_reason} · revision {policy.revision}</p><p className="mt-2 text-xs text-foreground-muted">Recovery: active order {policy.allow_active_order_access ? 'available' : 'blocked'}, support {policy.allow_support_access ? 'available' : 'blocked'}, new transactions {policy.allow_new_transactions ? 'available' : 'held'}</p>{policy.store_destinations.primary ? <a className="mt-2 inline-flex items-center gap-1 text-xs text-primary-light hover:underline" href={policy.store_destinations.primary} target="_blank" rel="noreferrer">Store destination <ExternalLink size={12} aria-hidden="true" /></a> : null}</div><button type="button" onClick={() => edit(policy)} className="shrink-0 rounded-xl border border-border px-3 py-2 text-xs font-black uppercase tracking-wide text-foreground-muted">Edit</button></div></article>)}</div>
        {!query.isLoading && sorted.length === 0 ? <div className="mt-5 rounded-2xl border border-dashed border-border p-6 text-center text-sm text-foreground-muted">No scoped release policies yet.</div> : null}
      </section>
    </div>
  )
}
