import { useEffect, useMemo, useState } from 'react'
import { Check, Eye, FilePlus2, Layers3, RefreshCw, Send, ShieldCheck, Sparkles } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '../lib/api'
import { useAuthStore } from '../store/useAuthStore'
import AppExperienceEditor from './AppExperienceEditor'
import ExperiencePreview from '../components/experience/ExperiencePreview'
import RevisionHistory from '../components/experience/RevisionHistory'
import { defaultExperienceForm, formFromManifest, formToPayload, hasAudienceConstraints, type ExperienceForm, type ExperienceHistory, type ExperienceManifest } from '../components/experience/types'

const requestKey = (action: string) => `admin.experience_manifest.${action}.${typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`}`
const errorMessage = (error: unknown) => {
  if (!error || typeof error !== 'object') return 'Experience operation failed'
  const response = (error as { response?: { data?: { message?: unknown; error?: unknown } }; message?: unknown })
  if (typeof response.response?.data?.message === 'string') return response.response.data.message
  if (typeof response.response?.data?.error === 'string') return response.response.data.error
  return typeof response.message === 'string' ? response.message : 'Experience operation failed'
}
const statusClass = (state: string) => state === 'published' ? 'bg-emerald-500/10 text-emerald-300' : state === 'draft' ? 'bg-amber-500/10 text-amber-300' : 'bg-zinc-800 text-zinc-400'

export default function AppExperience() {
  const { user } = useAuthStore()
  const queryClient = useQueryClient()
  const canEdit = user?.role === 'super_admin' || user?.role === 'ops_admin'
  const canApprove = user?.role === 'super_admin' || user?.role === 'ops_security'
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [form, setForm] = useState<ExperienceForm>(() => defaultExperienceForm())
  const [mode, setMode] = useState<'new' | 'draft' | 'revision'>('new')
  const [previewSurface, setPreviewSurface] = useState<'customer_android' | 'customer_web'>('customer_android')
  const [previewAudience, setPreviewAudience] = useState({ market_code: 'id-jk', locale: 'id-ID', app_version: '1.0.0', cohort: '' })
  const [simulation, setSimulation] = useState<{ matched?: boolean; reason?: string; selected_manifest?: { revision?: number } | null }>()

  const manifestsQuery = useQuery({
    queryKey: ['experience-manifests'],
    queryFn: async (): Promise<ExperienceManifest[]> => (await api.get('/admin/experience/manifests')).data?.data ?? [],
  })
  const selected = useMemo(() => manifestsQuery.data?.find((manifest) => manifest.manifest_id === selectedId) ?? null, [manifestsQuery.data, selectedId])
  const historyQuery = useQuery({
    queryKey: ['experience-manifest-history', selectedId],
    enabled: Boolean(selectedId),
    queryFn: async (): Promise<ExperienceHistory> => (await api.get(`/admin/experience/manifests/${selectedId}`)).data?.data ?? { revisions: [], audit: [] },
  })
  const draft = historyQuery.data?.revisions.find((revision) => revision.state === 'draft') ?? (selected?.state === 'draft' ? selected : null)
  const actionManifest = draft ?? selected

  useEffect(() => {
    if (!selected) return
    setForm(formFromManifest(selected))
    setMode(selected.state === 'draft' ? 'draft' : 'revision')
    setPreviewAudience({ market_code: selected.market_code, locale: selected.locale, app_version: selected.min_app_version, cohort: '' })
    setSimulation(undefined)
  }, [selected])

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = formToPayload(form)
      if (mode === 'draft' && form.manifest_id) return api.patch(`/admin/experience/manifests/${form.manifest_id}/draft`, payload, { headers: { 'X-Idempotency-Key': requestKey('update') } })
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
      const response = await api.post(`/admin/experience/manifests/${actionManifest.manifest_id}/preview`, { audience: { ...previewAudience, cohort: previewAudience.cohort || null } })
      return response.data
    },
    onSuccess: (response) => { setSimulation(response.simulation); toast.success('Audience preview refreshed') },
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

  const startNew = () => { setSelectedId(null); setForm(defaultExperienceForm()); setMode('new'); setSimulation(undefined) }
  const selectManifest = (manifest: ExperienceManifest) => setSelectedId(manifest.manifest_id)
  const save = () => saveMutation.mutate()
  const actionBusy = previewMutation.isPending || approveMutation.isPending || publishMutation.isPending || rollbackMutation.isPending

  return (
    <div className="space-y-8 animate-in">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between"><div><div className="flex items-center gap-3"><Sparkles className="text-primary-light" size={26} /><h1 className="text-3xl font-black tracking-tight text-zinc-100">App Experience CMS</h1></div><p className="mt-2 max-w-3xl text-sm leading-relaxed text-zinc-500">Create approved banners and home layouts, preview an audience, pass maker-checker approval for broad campaigns, then publish or roll back safely.</p></div><div className="flex flex-wrap gap-2"><button type="button" onClick={() => manifestsQuery.refetch()} className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-3 text-xs font-black uppercase tracking-widest text-zinc-300"><RefreshCw size={14} /> Refresh</button>{canEdit ? <button type="button" onClick={startNew} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-3 text-xs font-black uppercase tracking-widest text-white"><FilePlus2 size={14} /> New campaign</button> : null}</div></div>
      <div className="grid gap-6 xl:grid-cols-[300px_minmax(0,1fr)]"><aside className="space-y-4 rounded-3xl border border-white/10 bg-white/[0.03] p-4" aria-labelledby="experience-list-title"><div className="flex items-center justify-between"><h2 id="experience-list-title" className="text-sm font-black uppercase tracking-wider text-zinc-300">Manifest revisions</h2><Layers3 size={17} className="text-zinc-600" /></div>{manifestsQuery.isLoading ? <p className="p-4 text-sm text-zinc-600">Loading campaigns...</p> : null}{manifestsQuery.isError ? <p className="p-4 text-sm text-red-300">Campaign list failed to load.</p> : null}<div className="space-y-2">{(manifestsQuery.data ?? []).map((manifest) => <button type="button" key={manifest.id} onClick={() => selectManifest(manifest)} className={`w-full rounded-2xl border p-3 text-left transition ${manifest.manifest_id === selectedId ? 'border-primary/50 bg-primary/10' : 'border-white/10 bg-black/10 hover:border-white/20'}`}><div className="flex items-center justify-between gap-2"><span className="truncate font-mono text-[10px] text-zinc-500">{manifest.manifest_id.slice(0, 8)}…</span><span className={`rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-widest ${statusClass(manifest.state)}`}>{manifest.state}</span></div><p className="mt-2 text-sm font-black text-zinc-200">{manifest.sections[0]?.properties?.title as string || manifest.sections[0]?.component || 'Untitled campaign'}</p><p className="mt-1 text-[10px] text-zinc-500">r{manifest.revision} · {manifest.market_code} · {manifest.surface}</p></button>)}</div>{!manifestsQuery.isLoading && !manifestsQuery.isError && (manifestsQuery.data ?? []).length === 0 ? <div className="rounded-2xl border border-dashed border-white/10 p-5 text-center text-xs text-zinc-600">No manifest yet. Create the first campaign.</div> : null}</aside><main className="min-w-0 space-y-6">{mode === 'new' || form.manifest_id ? <AppExperienceEditor value={form} onChange={setForm} onSave={save} onCancel={() => { if (selected) { setForm(formFromManifest(selected)); setMode(selected.state === 'draft' ? 'draft' : 'revision') } else startNew() }} saving={saveMutation.isPending} disabled={!canEdit} isRevision={mode === 'revision'} /> : null}
        <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-5" aria-labelledby="preview-controls-title"><div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between"><div><h2 id="preview-controls-title" className="text-base font-black text-zinc-100">Preview and release controls</h2><p className="mt-1 text-xs text-zinc-500">Simulate market, locale, version and cohort against the saved draft before publish.</p></div><div className="flex flex-wrap gap-2"><button type="button" disabled={actionBusy || !actionManifest || actionManifest.state !== 'draft'} onClick={() => previewMutation.mutate()} className="inline-flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-primary-light disabled:opacity-50"><Eye size={14} /> {previewMutation.isPending ? 'Previewing...' : 'Preview audience'}</button>{actionManifest?.requires_approval ? <button type="button" disabled={actionBusy || !canApprove || actionManifest.approval_status === 'approved'} onClick={() => approveMutation.mutate()} className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-emerald-300 disabled:opacity-50"><ShieldCheck size={14} /> Approve</button> : null}<button type="button" disabled={actionBusy || !canEdit || !actionManifest || actionManifest.state !== 'draft'} onClick={() => publishMutation.mutate()} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white disabled:opacity-50"><Send size={14} /> Publish</button></div></div><div className="mt-5 grid gap-3 md:grid-cols-4"><label className="text-xs font-bold text-zinc-400">Preview market<input className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-zinc-100" value={previewAudience.market_code} onChange={(event) => setPreviewAudience({ ...previewAudience, market_code: event.target.value })} /></label><label className="text-xs font-bold text-zinc-400">Locale<input className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-zinc-100" value={previewAudience.locale} onChange={(event) => setPreviewAudience({ ...previewAudience, locale: event.target.value })} /></label><label className="text-xs font-bold text-zinc-400">App version<input className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-zinc-100" value={previewAudience.app_version} onChange={(event) => setPreviewAudience({ ...previewAudience, app_version: event.target.value })} /></label><label className="text-xs font-bold text-zinc-400">Test cohort<input className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-zinc-100" value={previewAudience.cohort} onChange={(event) => setPreviewAudience({ ...previewAudience, cohort: event.target.value })} placeholder="internal-test" /></label></div><div className="mt-4 inline-flex rounded-xl border border-white/10 bg-black/10 p-1"><button type="button" onClick={() => setPreviewSurface('customer_android')} className={`rounded-lg px-3 py-2 text-xs font-bold ${previewSurface === 'customer_android' ? 'bg-primary text-white' : 'text-zinc-500'}`}>Customer Android</button><button type="button" onClick={() => setPreviewSurface('customer_web')} className={`rounded-lg px-3 py-2 text-xs font-bold ${previewSurface === 'customer_web' ? 'bg-primary text-white' : 'text-zinc-500'}`}>Customer Web</button></div></section>
        <ExperiencePreview surface={previewSurface} sections={form.sections} simulation={simulation} />
        {selectedId && historyQuery.isLoading ? <div className="rounded-3xl border border-white/10 p-6 text-sm text-zinc-600">Loading revision history...</div> : null}{selectedId && historyQuery.data ? <RevisionHistory revisions={historyQuery.data.revisions} audit={historyQuery.data.audit} canRollback={user?.role === 'super_admin' && historyQuery.data.revisions.some((revision) => revision.state === 'published')} loading={rollbackMutation.isPending} onRollback={(revision) => { if (window.confirm(`Restore revision ${revision}?`)) rollbackMutation.mutate(revision) }} /> : null}
        {actionManifest ? <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-black/10 p-4 text-xs text-zinc-500"><Check size={15} className="text-emerald-400" />State: <strong className="text-zinc-300">{actionManifest.state}</strong><span>·</span>Approval: <strong className="text-zinc-300">{actionManifest.requires_approval ? actionManifest.approval_status : 'not required'}</strong><span>·</span>Rollout: <strong className="text-zinc-300">{actionManifest.rollout_stage}{actionManifest.canary_cohort ? ` / ${actionManifest.canary_cohort}` : ''}</strong>{hasAudienceConstraints(form.targeting) ? <span className="text-primary-light">· targeted</span> : <span className="text-amber-300">· broad audience</span>}</div> : null}
      </main></div>
    </div>
  )
}
