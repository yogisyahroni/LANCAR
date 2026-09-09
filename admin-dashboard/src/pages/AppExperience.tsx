import { useEffect, useMemo, useState } from 'react'
import { useLocation, useSearchParams } from 'react-router'
import { Archive, Ban, Check, Copy, Eye, FilePlus2, Layers3, RefreshCw, Send, ShieldCheck, Sparkles } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '../lib/api'
import { useAuthStore } from '../store/useAuthStore'
import AppExperienceEditor from './AppExperienceEditor'
import AppExperienceOverview from './AppExperienceOverview'
import ExperienceAssets from './ExperienceAssets'
import DeepLinks from './DeepLinks'
import ExperiencePreview from '../components/experience/ExperiencePreview'
import RevisionHistory from '../components/experience/RevisionHistory'
import ExperienceScopeBar, { type ExperienceScope } from '../components/experience/ExperienceScopeBar'
import TargetingSummary from '../components/experience/TargetingSummary'
import { appExperienceNavigationItem } from '../config/appExperienceNavigation'
import { EXPERIENCE_CAPABILITIES, hasExperiencePermission } from '../lib/experiencePermissions'
import KillSwitches from './KillSwitches'
import { campaignNameForManifest, defaultExperienceForm, defaultServiceVisibilityForm, detectExperienceConflicts, experienceCampaignStatus, formFromManifest, formToPayload, hasAudienceConstraints, type ExperienceForm, type ExperienceHistory, type ExperienceManifest, type ExperienceSurface } from '../components/experience/types'

const requestKey = (action: string) => `admin.experience_manifest.${action}.${typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`}`
const errorMessage = (error: unknown) => {
  if (!error || typeof error !== 'object') return 'Experience operation failed'
  const response = (error as { response?: { data?: { message?: unknown; error?: unknown } }; message?: unknown })
  if (typeof response.response?.data?.message === 'string') return response.response.data.message
  if (typeof response.response?.data?.error === 'string') return response.response.data.error
  return typeof response.message === 'string' ? response.message : 'Experience operation failed'
}
const statusClass = (status: string) => ({
  draft: 'bg-amber-500/10 text-amber-300',
  scheduled: 'bg-sky-500/10 text-sky-300',
  live: 'bg-emerald-500/10 text-emerald-300',
  paused: 'bg-red-500/10 text-red-300',
  expired: 'bg-zinc-800 text-zinc-400',
}[status] ?? 'bg-zinc-800 text-zinc-400')

export default function AppExperience() {
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const { user } = useAuthStore()
  const queryClient = useQueryClient()
  const canEdit = hasExperiencePermission(user, EXPERIENCE_CAPABILITIES.draftWrite)
  const canApprove = hasExperiencePermission(user, EXPERIENCE_CAPABILITIES.approve)
  const canPublish = hasExperiencePermission(user, EXPERIENCE_CAPABILITIES.publish)
  const canKill = hasExperiencePermission(user, EXPERIENCE_CAPABILITIES.killSwitchExecute)
  const canRollback = hasExperiencePermission(user, EXPERIENCE_CAPABILITIES.rollback)
  const [selectedId, setSelectedId] = useState<string | null>(() => searchParams.get('manifest_id'))
  const revisionQuery = Number(searchParams.get('revision'))
  const selectedRevision = Number.isInteger(revisionQuery) && revisionQuery > 0 ? revisionQuery : null
  const focusAssetId = searchParams.get('asset_id')
  const [form, setForm] = useState<ExperienceForm>(() => location.pathname.endsWith('/service-visibility') ? defaultServiceVisibilityForm() : defaultExperienceForm())
  const [mode, setMode] = useState<'new' | 'draft' | 'revision'>('new')
  const [previewSurface, setPreviewSurface] = useState<ExperienceSurface>('customer_android')
  const [previewAudience, setPreviewAudience] = useState({ market_code: 'id-jk', locale: 'id-ID', app_version: '1.0.0', user_id: '', cohort: '' })
  const [simulation, setSimulation] = useState<{ matched?: boolean; reason?: string; selected_manifest?: { revision?: number } | null }>()
  const [audiencePair, setAudiencePair] = useState<{ matching?: typeof simulation; nonMatching?: typeof simulation }>({})
  const activeSection = appExperienceNavigationItem(location.pathname)?.label ?? 'Overview'
  const audienceWorkspace = activeSection === 'Audience & Targeting' || activeSection === 'Scheduling'

  const manifestsQuery = useQuery({
    queryKey: ['experience-manifests', form.market_code, form.surface],
    enabled: activeSection !== 'Overview',
    queryFn: async (): Promise<ExperienceManifest[]> => (await api.get('/admin/experience/manifests', { params: { market_code: form.market_code, surface: form.surface } })).data?.data ?? [],
  })
  const selected = useMemo(() => manifestsQuery.data?.find((manifest) => manifest.manifest_id === selectedId) ?? null, [manifestsQuery.data, selectedId])
  const historyQuery = useQuery({
    queryKey: ['experience-manifest-history', selectedId],
    enabled: Boolean(selectedId) && activeSection !== 'Overview',
    queryFn: async (): Promise<ExperienceHistory> => (await api.get(`/admin/experience/manifests/${selectedId}`)).data?.data ?? { revisions: [], audit: [] },
  })
  const draft = historyQuery.data?.revisions.find((revision) => revision.state === 'draft') ?? (selected?.state === 'draft' ? selected : null)
  const actionManifest = draft ?? selected
  const publishedManifest = historyQuery.data?.revisions.find((revision) => revision.state === 'published') ?? (selected?.state === 'published' ? selected : null)
  const editorManifest = historyQuery.data?.revisions.find((revision) => revision.revision === selectedRevision) ?? selected

  useEffect(() => {
    if (!editorManifest) return
    setForm(formFromManifest(editorManifest))
    setMode(editorManifest.state === 'draft' ? 'draft' : 'revision')
    setPreviewSurface(editorManifest.surface)
    setPreviewAudience({ market_code: editorManifest.market_code, locale: editorManifest.locale, app_version: editorManifest.min_app_version, user_id: '', cohort: '' })
    setSimulation(undefined)
    setAudiencePair({})
  }, [editorManifest])

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = formToPayload(form)
      if (mode === 'draft' && form.manifest_id) {
        if (!actionManifest?.checksum || actionManifest.state !== 'draft') throw new Error('Refresh the draft before saving it')
        return api.patch(`/admin/experience/manifests/${form.manifest_id}/draft`, payload, {
          headers: {
            'X-Idempotency-Key': requestKey('update'),
            'If-Match': `"${actionManifest.checksum}"`,
            'X-Experience-Revision': String(actionManifest.revision),
          },
        })
      }
      return api.post('/admin/experience/manifests', payload, { headers: { 'X-Idempotency-Key': requestKey('create') } })
    },
    onSuccess: (response) => {
      const manifest = response.data?.data as ExperienceManifest
      setSelectedId(manifest.manifest_id)
      setForm(formFromManifest(manifest))
      setMode('draft')
      queryClient.invalidateQueries({ queryKey: ['experience-manifests'] })
      queryClient.invalidateQueries({ queryKey: ['experience-manifest-history', manifest.manifest_id] })
      toast.success(mode === 'draft' ? 'Draft updated' : 'Draft created')
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  const previewMutation = useMutation({
    mutationFn: async () => {
      if (!actionManifest || actionManifest.state !== 'draft') throw new Error('Save a draft before previewing it')
      const response = await api.post(`/admin/experience/manifests/${actionManifest.manifest_id}/preview`, { audience: { ...previewAudience, user_id: previewAudience.user_id.trim() || null, cohort: previewAudience.cohort || null } })
      return response.data
    },
    onSuccess: (response) => { setSimulation(response.simulation); toast.success('Audience preview refreshed') },
    onError: (error) => toast.error(errorMessage(error)),
  })

  const previewAudienceFor = (nonMatching: boolean) => {
    const targeting = form.targeting
    return {
      ...previewAudience,
      market_code: nonMatching ? 'zz-zz' : targeting.market_codes[0] || form.market_code,
      locale: targeting.locales[0] || form.locale,
      app_version: form.min_app_version,
      city_code: nonMatching ? (targeting.city_codes[0] ? `${targeting.city_codes[0]}-other` : 'non-target-city') : targeting.city_codes[0] || null,
      zone_code: nonMatching ? (targeting.zone_codes[0] ? `${targeting.zone_codes[0]}-other` : 'non-target-zone') : targeting.zone_codes[0] || null,
      cohort: nonMatching ? 'non-target-cohort' : targeting.cohorts[0] || null,
      experiment_ref: targeting.experiment_ref || null,
      experiment_assignment: targeting.experiment_assignments[0] || null,
      service_usage_cohort: targeting.service_usage_cohorts[0] || null,
      user_status: targeting.user_status || null,
      role: targeting.roles[0] || null,
      user_id: previewAudience.user_id.trim() || null,
    }
  }

  const audiencePairMutation = useMutation({
    mutationFn: async (nonMatching: boolean) => {
      if (!actionManifest || actionManifest.state !== 'draft') throw new Error('Save a draft before simulating an audience')
      const response = await api.post(`/admin/experience/manifests/${actionManifest.manifest_id}/preview`, { audience: previewAudienceFor(nonMatching) })
      return { nonMatching, simulation: response.data?.simulation as typeof simulation }
    },
    onSuccess: ({ nonMatching, simulation: nextSimulation }) => {
      setAudiencePair((previous) => ({ ...previous, ...(nonMatching ? { nonMatching: nextSimulation } : { matching: nextSimulation }) }))
      toast.success(nonMatching ? 'Non-matching audience simulated' : 'Matching audience simulated')
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  const approveMutation = useMutation({
    mutationFn: () => api.post(`/admin/experience/manifests/${actionManifest?.manifest_id}/approve`, {}, { headers: { 'X-Idempotency-Key': requestKey('approve') } }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['experience-manifests'] }); queryClient.invalidateQueries({ queryKey: ['experience-manifest-history', selectedId] }); toast.success('Campaign approved by checker') },
    onError: (error) => toast.error(errorMessage(error)),
  })

  const publishMutation = useMutation({
    mutationFn: () => api.post(`/admin/experience/manifests/${actionManifest?.manifest_id}/publish`, {}, { headers: { 'X-Idempotency-Key': requestKey('publish') } }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['experience-manifests'] }); queryClient.invalidateQueries({ queryKey: ['experience-manifest-history', selectedId] }); toast.success('Campaign published') },
    onError: (error) => toast.error(errorMessage(error)),
  })

  const rollbackMutation = useMutation({
    mutationFn: (revision: number) => api.post(`/admin/experience/manifests/${actionManifest?.manifest_id}/rollback`, { target_revision: revision, reason: 'Known-good revision restored from App Experience CMS' }, { headers: { 'X-Idempotency-Key': requestKey('rollback') } }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['experience-manifests'] }); queryClient.invalidateQueries({ queryKey: ['experience-manifest-history', selectedId] }); toast.success('Known-good revision restored') },
    onError: (error) => toast.error(errorMessage(error)),
  })

  const killMutation = useMutation({
    mutationFn: () => api.post(`/admin/experience/manifests/${actionManifest?.manifest_id}/kill`, { reason: 'Emergency disable from App Experience CMS' }, { headers: { 'X-Idempotency-Key': requestKey('kill') } }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['experience-manifests'] }); queryClient.invalidateQueries({ queryKey: ['experience-manifest-history', selectedId] }); toast.success('Campaign kill switch enabled') },
    onError: (error) => toast.error(errorMessage(error)),
  })

  const restoreMutation = useMutation({
    mutationFn: () => api.post(`/admin/experience/manifests/${actionManifest?.manifest_id}/restore`, { reason: 'Approved restoration from App Experience CMS' }, { headers: { 'X-Idempotency-Key': requestKey('restore') } }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['experience-manifests'] }); queryClient.invalidateQueries({ queryKey: ['experience-manifest-history', selectedId] }); toast.success('Campaign kill switch cleared') },
    onError: (error) => toast.error(errorMessage(error)),
  })

  const retireMutation = useMutation({
    mutationFn: () => api.post(`/admin/experience/manifests/${publishedManifest?.manifest_id}/retire`, { reason: 'Campaign retired from App Experience CMS' }, { headers: { 'X-Idempotency-Key': requestKey('retire') } }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['experience-manifests'] }); queryClient.invalidateQueries({ queryKey: ['experience-manifest-history', selectedId] }); toast.success('Campaign retired') },
    onError: (error) => toast.error(errorMessage(error)),
  })

  const startNew = () => {
    const next = activeSection === 'Service Visibility' ? defaultServiceVisibilityForm() : defaultExperienceForm()
    setSelectedId(null)
    setForm(next)
    setPreviewSurface(next.surface)
    setPreviewAudience({ market_code: next.market_code, locale: next.locale, app_version: next.min_app_version, user_id: '', cohort: '' })
    setMode('new')
    setSimulation(undefined)
    setAudiencePair({})
  }
  const selectManifest = (manifest: ExperienceManifest) => setSelectedId(manifest.manifest_id)
  const duplicate = () => {
    const source = editorManifest ?? selected
    if (!source) return
    const { manifest_id: _manifestId, ...duplicateForm } = formFromManifest(source)
    setSelectedId(null)
    setForm(duplicateForm)
    setPreviewSurface(duplicateForm.surface)
    setPreviewAudience({ market_code: duplicateForm.market_code, locale: duplicateForm.locale, app_version: duplicateForm.min_app_version, user_id: '', cohort: '' })
    setMode('new')
    setSimulation(undefined)
    toast.success('Campaign duplicated as a new draft')
  }
  const save = () => saveMutation.mutate()
  const actionBusy = previewMutation.isPending || audiencePairMutation.isPending || approveMutation.isPending || publishMutation.isPending || rollbackMutation.isPending || killMutation.isPending || restoreMutation.isPending || retireMutation.isPending
  const scope: ExperienceScope = {
    marketCode: form.market_code,
    surface: form.surface,
    locale: form.locale,
    appVersion: form.min_app_version,
  }
  const updateScope = (next: ExperienceScope) => {
    setForm((previous) => ({
      ...previous,
      market_code: next.marketCode,
      surface: next.surface,
      locale: next.locale,
      min_app_version: next.appVersion,
    }))
    setPreviewSurface(next.surface)
    setPreviewAudience((previous) => ({
      ...previous,
      market_code: next.marketCode,
      locale: next.locale,
      app_version: next.appVersion,
    }))
  }

  if (activeSection === 'Overview') return <AppExperienceOverview />
  if (activeSection === 'Kill Switches') return <KillSwitches />
  if (activeSection === 'Asset Library') return <div className="space-y-8 animate-in"><ExperienceScopeBar value={scope} onChange={updateScope} /><ExperienceAssets marketCode={form.market_code} surface={form.surface} /></div>
  if (activeSection === 'Deep Links') return <div className="space-y-8 animate-in"><ExperienceScopeBar value={scope} onChange={updateScope} /><DeepLinks marketCode={form.market_code} surface={form.surface} appVersion={form.min_app_version} schemaVersion={form.schema_version} /></div>

  return (
    <div className="space-y-8 animate-in">
      <ExperienceScopeBar value={scope} onChange={updateScope} />
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between"><div><div className="flex items-center gap-3"><Sparkles className="text-primary-light" size={26} /><h1 className="text-3xl font-black tracking-tight text-zinc-100">{activeSection} · App Experience</h1></div><p className="mt-2 max-w-3xl text-sm leading-relaxed text-zinc-500">Create approved banners and home layouts, preview an audience, pass maker-checker approval for broad campaigns, then publish, pause, retire or roll back safely.</p></div><div className="flex flex-wrap gap-2"><button type="button" onClick={() => manifestsQuery.refetch()} className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-3 text-xs font-black uppercase tracking-widest text-zinc-300"><RefreshCw size={14} /> Refresh</button>{selected && canEdit ? <button type="button" onClick={duplicate} className="inline-flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 text-xs font-black uppercase tracking-widest text-primary-light"><Copy size={14} /> Duplicate</button> : null}{canEdit ? <button type="button" onClick={startNew} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-3 text-xs font-black uppercase tracking-widest text-white"><FilePlus2 size={14} /> New campaign</button> : null}</div></div>
      <div className="grid gap-6 xl:grid-cols-[300px_minmax(0,1fr)]"><aside className="space-y-4 rounded-3xl border border-white/10 bg-white/[0.03] p-4" aria-labelledby="experience-list-title"><div className="flex items-center justify-between"><h2 id="experience-list-title" className="text-sm font-black uppercase tracking-wider text-zinc-300">Manifest revisions</h2><Layers3 size={17} className="text-zinc-600" /></div>{manifestsQuery.isLoading ? <p className="p-4 text-sm text-zinc-600">Loading campaigns...</p> : null}{manifestsQuery.isError ? <p className="p-4 text-sm text-red-300">Campaign list failed to load.</p> : null}<div className="space-y-2">{(manifestsQuery.data ?? []).map((manifest) => { const status = experienceCampaignStatus(manifest); return <button type="button" key={manifest.id} onClick={() => selectManifest(manifest)} className={`w-full rounded-2xl border p-3 text-left transition ${manifest.manifest_id === selectedId ? 'border-primary/50 bg-primary/10' : 'border-white/10 bg-black/10 hover:border-white/20'}`}><div className="flex items-center justify-between gap-2"><span className="truncate font-mono text-[10px] text-zinc-500">{manifest.manifest_id.slice(0, 8)}…</span><span className={`rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-widest ${statusClass(status)}`}>{status}</span></div><p className="mt-2 text-sm font-black text-zinc-200">{campaignNameForManifest(manifest)}</p><p className="mt-1 text-[10px] text-zinc-500">r{manifest.revision} · {manifest.market_code} · {manifest.surface}</p></button> })}</div>{!manifestsQuery.isLoading && !manifestsQuery.isError && (manifestsQuery.data ?? []).length === 0 ? <div className="rounded-2xl border border-dashed border-white/10 p-5 text-center text-xs text-zinc-600">No manifest yet. Create the first campaign.</div> : null}</aside><main className="min-w-0 space-y-6">{mode === 'new' || form.manifest_id ? <AppExperienceEditor value={form} onChange={(next) => { setForm(next); setPreviewSurface(next.surface) }} onSave={save} onCancel={() => { if (selected) { const restored = formFromManifest(selected); setForm(restored); setPreviewSurface(restored.surface); setMode(selected.state === 'draft' ? 'draft' : 'revision') } else startNew() }} saving={saveMutation.isPending} disabled={!canEdit} isRevision={mode === 'revision'} focusAssetId={focusAssetId} homeLayoutMode={activeSection === 'Home Layout'} serviceVisibilityMode={activeSection === 'Service Visibility'} /> : null}{audienceWorkspace ? <TargetingSummary form={form} conflicts={detectExperienceConflicts(form, manifestsQuery.data ?? [], selectedId)} scheduleOnly={activeSection === 'Scheduling'} /> : null}
      <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-5" aria-labelledby="preview-controls-title"><div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between"><div><h2 id="preview-controls-title" className="text-base font-black text-zinc-100">Preview and release controls</h2><p className="mt-1 max-w-2xl text-xs text-zinc-500">Simulate market, locale, version, rollout identity and cohort against the saved draft before publish.</p></div><div className="flex flex-wrap gap-2"><button type="button" disabled={actionBusy || !actionManifest || actionManifest.state !== 'draft'} onClick={() => previewMutation.mutate()} className="inline-flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-primary-light disabled:opacity-50"><Eye size={14} /> {previewMutation.isPending ? 'Previewing...' : 'Preview audience'}</button>{actionManifest?.requires_approval ? <button type="button" disabled={actionBusy || !canApprove || actionManifest.approval_status === 'approved'} onClick={() => approveMutation.mutate()} className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-emerald-300 disabled:opacity-50"><ShieldCheck size={14} /> Approve</button> : null}<button type="button" disabled={actionBusy || !canPublish || !actionManifest || actionManifest.state !== 'draft'} onClick={() => publishMutation.mutate()} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white disabled:opacity-50"><Send size={14} /> Publish</button>{actionManifest?.state === 'published' && canKill ? <button type="button" disabled={actionBusy} onClick={() => actionManifest.kill_switch_active ? restoreMutation.mutate() : killMutation.mutate()} className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-[10px] font-black uppercase tracking-widest disabled:opacity-50 ${actionManifest.kill_switch_active ? 'border-amber-500/30 bg-amber-500/10 text-amber-300' : 'border-red-500/30 bg-red-500/10 text-red-300'}`}><Ban size={14} /> {actionManifest.kill_switch_active ? 'Resume' : 'Pause'}</button> : null}{publishedManifest && canPublish ? <button type="button" disabled={actionBusy} onClick={() => { if (window.confirm('Retire this campaign? It will stop public exposure and remain in revision history.')) retireMutation.mutate() }} className="inline-flex items-center gap-2 rounded-xl border border-zinc-500/30 bg-zinc-500/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-zinc-300 disabled:opacity-50"><Archive size={14} /> Retire</button> : null}</div></div><div className="mt-5 grid gap-3 md:grid-cols-5"><label className="text-xs font-bold text-zinc-400">Preview market<input className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-zinc-100" value={previewAudience.market_code} onChange={(event) => setPreviewAudience({ ...previewAudience, market_code: event.target.value })} /></label><label className="text-xs font-bold text-zinc-400">Locale<input className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-zinc-100" value={previewAudience.locale} onChange={(event) => setPreviewAudience({ ...previewAudience, locale: event.target.value })} /></label><label className="text-xs font-bold text-zinc-400">App version<input className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-zinc-100" value={previewAudience.app_version} onChange={(event) => setPreviewAudience({ ...previewAudience, app_version: event.target.value })} /></label><label className="text-xs font-bold text-zinc-400">Preview user ID (rollout)<input className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-zinc-100" value={previewAudience.user_id} onChange={(event) => setPreviewAudience({ ...previewAudience, user_id: event.target.value })} placeholder="authenticated-user-id" /></label><label className="text-xs font-bold text-zinc-400">Test cohort<input className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-zinc-100" value={previewAudience.cohort} onChange={(event) => setPreviewAudience({ ...previewAudience, cohort: event.target.value })} placeholder="internal-test" /></label></div><div className="mt-4 flex flex-wrap gap-1 rounded-xl border border-white/10 bg-black/10 p-1">{(['customer_android', 'customer_web', 'merchant_android', 'courier_android'] as ExperienceSurface[]).map((surface) => <button type="button" key={surface} onClick={() => setPreviewSurface(surface)} className={`rounded-lg px-3 py-2 text-xs font-bold ${previewSurface === surface ? 'bg-primary text-white' : 'text-zinc-500'}`}>{surface.replace('_', ' ').replace('_', ' ')}</button>)}</div></section>
        {audienceWorkspace ? <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-5" aria-labelledby="audience-case-title"><div><h2 id="audience-case-title" className="text-base font-black text-zinc-100">Matching / non-matching audience cases</h2><p className="mt-1 text-xs leading-relaxed text-zinc-500">Run both cases against the same server preview resolver before publish. For partial rollout, provide a stable preview user ID above.</p></div><div className="mt-4 flex flex-wrap gap-2"><button type="button" disabled={actionBusy || !actionManifest || actionManifest.state !== 'draft'} onClick={() => audiencePairMutation.mutate(false)} className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-emerald-300 disabled:opacity-50">{audiencePairMutation.isPending ? 'Simulating...' : 'Simulate matching'}</button><button type="button" disabled={actionBusy || !actionManifest || actionManifest.state !== 'draft'} onClick={() => audiencePairMutation.mutate(true)} className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-amber-300 disabled:opacity-50">Simulate non-matching</button></div><div className="mt-4 grid gap-3 md:grid-cols-2">{([['matching', 'Matching case', audiencePair.matching], ['nonMatching', 'Non-matching case', audiencePair.nonMatching]] as const).map(([key, label, result]) => <div key={key} className="rounded-2xl border border-white/10 bg-black/10 p-3 text-xs"><p className="font-black uppercase tracking-widest text-zinc-500">{label}</p><p className={`mt-2 font-black ${result?.matched ? 'text-emerald-300' : result ? 'text-amber-300' : 'text-zinc-600'}`}>{result ? result.matched ? 'matched' : `not matched · ${result.reason || 'unknown'}` : 'Not run'}</p>{result?.selected_manifest ? <p className="mt-1 text-zinc-500">revision {result.selected_manifest.revision ?? '—'}</p> : null}</div>)}</div></section> : null}
        <ExperiencePreview surface={previewSurface} sections={form.sections} simulation={simulation} />
        {selectedId && historyQuery.isLoading ? <div className="rounded-3xl border border-white/10 p-6 text-sm text-zinc-600">Loading revision history...</div> : null}{selectedId && historyQuery.data ? <RevisionHistory revisions={historyQuery.data.revisions} audit={historyQuery.data.audit} canRollback={canRollback && historyQuery.data.revisions.some((revision) => revision.state === 'published')} loading={rollbackMutation.isPending} selectedRevision={selectedRevision} onRollback={(revision) => { if (window.confirm(`Restore revision ${revision}?`)) rollbackMutation.mutate(revision) }} /> : null}
        {actionManifest ? <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-black/10 p-4 text-xs text-zinc-500"><Check size={15} className="text-emerald-400" />State: <strong className="text-zinc-300">{actionManifest.state}</strong><span>·</span>Approval: <strong className="text-zinc-300">{actionManifest.requires_approval ? actionManifest.approval_status : 'not required'}</strong><span>·</span>Rollout: <strong className="text-zinc-300">{actionManifest.rollout_stage}{actionManifest.canary_cohort ? ` / ${actionManifest.canary_cohort}` : ''}</strong>{actionManifest.kill_switch_active ? <span className="text-red-300">· exposure disabled</span> : null}{hasAudienceConstraints(form.targeting) ? <span className="text-primary-light">· targeted</span> : <span className="text-amber-300">· broad audience</span>}</div> : null}
      </main></div>
    </div>
  )
}
