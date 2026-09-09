import { FilePlus2, RefreshCw, Send, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import RevisionHistory from '../components/experience/RevisionHistory'
import type { ExperienceForm, ExperienceHistory, ExperienceManifest } from '../components/experience/types'
import ContrastPreview, { type PreviewMode } from '../components/experience/ContrastPreview'
import DesignTokenEditor, { DEFAULT_DESIGN_TOKENS, normalizeDesignTokens, validateDesignTokens, type DesignTokenKey } from '../components/experience/DesignTokenEditor'

type Props = {
  form: ExperienceForm
  manifests: ExperienceManifest[]
  selectedId: string | null
  selected: ExperienceManifest | null
  actionManifest: ExperienceManifest | null
  publishedManifest: ExperienceManifest | null
  history: ExperienceHistory | undefined
  historyLoading: boolean
  selectedRevision: number | null
  mode: 'new' | 'draft' | 'revision'
  canEdit: boolean
  canApprove: boolean
  canPublish: boolean
  canRollback: boolean
  saving: boolean
  actionBusy: boolean
  onFormChange: (form: ExperienceForm) => void
  onSave: (form?: ExperienceForm) => void
  onNew: () => void
  onRefresh: () => void
  onSelect: (manifest: ExperienceManifest) => void
  onApprove: () => void
  onPublish: () => void
  onRollback: (revision: number) => void
}

const ensureTokenSection = (form: ExperienceForm): ExperienceForm => {
  if (form.sections.some((section) => section.component === 'design_tokens')) return form
  return {
    ...form,
    sections: [...form.sections, { id: 'campaign-theme', component: 'design_tokens', enabled: true, properties: { ...DEFAULT_DESIGN_TOKENS } }],
  }
}

const statusClass = (status: string) => ({
  draft: 'bg-amber-500/10 text-amber-300',
  published: 'bg-emerald-500/10 text-emerald-300',
  superseded: 'bg-zinc-800 text-zinc-400',
  rolled_back: 'bg-red-500/10 text-red-300',
}[status] ?? 'bg-zinc-800 text-zinc-400')

export default function DesignTokens({ form, manifests, selectedId, selected, actionManifest, publishedManifest, history, historyLoading, selectedRevision, mode, canEdit, canApprove, canPublish, canRollback, saving, actionBusy, onFormChange, onSave, onNew, onRefresh, onSelect, onApprove, onPublish, onRollback }: Props) {
  const [previewMode, setPreviewMode] = useState<PreviewMode>('system')
  const tokenSection = form.sections.find((section) => section.component === 'design_tokens')
  const tokens = normalizeDesignTokens(tokenSection?.properties)
  const validation = validateDesignTokens(tokens)
  const saveForm = ensureTokenSection(form)
  const updateTokens = (key: DesignTokenKey, value: string) => {
    const nextForm = ensureTokenSection(form)
    const nextSections = nextForm.sections.map((section) => section.component === 'design_tokens'
      ? { ...section, properties: { ...normalizeDesignTokens(section.properties), [key]: value } }
      : section)
    onFormChange({ ...nextForm, sections: nextSections })
  }
  const publishDisabled = actionBusy || !canPublish || !actionManifest || actionManifest.state !== 'draft' || !validation.pass
  const approvalDisabled = actionBusy || !canApprove || !actionManifest || actionManifest.state !== 'draft' || !actionManifest.requires_approval

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div><p className="text-[10px] font-black uppercase tracking-[0.25em] text-primary-light">Safe runtime configuration</p><h1 className="mt-2 text-3xl font-black tracking-tight text-zinc-100">Design Tokens · App Experience</h1><p className="mt-2 max-w-3xl text-sm leading-relaxed text-zinc-500">Edit only campaign presentation presets. The existing manifest draft, maker-checker approval, publish, audit and rollback lifecycle remains the source of truth.</p></div>
        <div className="flex flex-wrap gap-2"><button type="button" onClick={onRefresh} className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-zinc-300"><RefreshCw size={14} /> Refresh</button><button type="button" disabled={!canEdit} onClick={onNew} className="inline-flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white disabled:opacity-50"><FilePlus2 size={14} /> New token draft</button></div>
      </div>
      <div className="grid gap-6 xl:grid-cols-[18rem_minmax(0,1fr)]">
        <aside className="space-y-4 rounded-3xl border border-white/10 bg-white/[0.03] p-4" aria-labelledby="design-token-manifest-list">
          <div className="flex items-center justify-between"><h2 id="design-token-manifest-list" className="text-sm font-black uppercase tracking-wider text-zinc-300">Scoped revisions</h2><ShieldCheck size={17} className="text-zinc-600" /></div>
          <div className="space-y-2">{manifests.map((manifest) => <button type="button" key={manifest.manifest_id} onClick={() => onSelect(manifest)} className={`w-full rounded-2xl border p-3 text-left ${manifest.manifest_id === selectedId ? 'border-primary/50 bg-primary/10' : 'border-white/10 bg-black/10 hover:border-white/20'}`}><div className="flex items-center justify-between gap-2"><span className="truncate font-mono text-[10px] text-zinc-500">{manifest.manifest_id.slice(0, 8)}…</span><span className={`rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-widest ${statusClass(manifest.state)}`}>{manifest.state}</span></div><p className="mt-2 text-sm font-black text-zinc-200">r{manifest.revision} · {manifest.surface}</p><p className="mt-1 text-[10px] text-zinc-500">{manifest.market_code} · {manifest.locale}</p></button>)}</div>
          {!manifests.length ? <p className="rounded-2xl border border-dashed border-white/10 p-4 text-center text-xs text-zinc-600">No manifest in this scope. Start a token draft.</p> : null}
        </aside>
        <main className="min-w-0 space-y-6">
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-black/10 p-4 text-xs text-zinc-500"><span className="font-black uppercase tracking-widest text-zinc-300">{selected ? `Manifest ${selected.manifest_id.slice(0, 8)}…` : 'New manifest'}</span><span>·</span><span>mode {mode}</span><span>·</span><span>state {actionManifest?.state ?? 'not saved'}</span>{actionManifest?.requires_approval ? <span className="text-amber-300">· approval {actionManifest.approval_status}</span> : null}</div>
          <DesignTokenEditor value={tokens} disabled={!canEdit || saving} onChange={updateTokens} />
          <ContrastPreview tokens={tokens} mode={previewMode} onModeChange={setPreviewMode} />
          <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-5" aria-labelledby="design-token-lifecycle-title"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><h2 id="design-token-lifecycle-title" className="text-base font-black text-zinc-100">Draft and release lifecycle</h2><p className="mt-1 text-xs leading-relaxed text-zinc-500">Saving creates or updates a manifest draft. Publish is disabled until the accessibility gate passes and the normal permission/approval checks are satisfied.</p></div><div className="flex flex-wrap gap-2"><button type="button" disabled={!canEdit || saving} onClick={() => onSave(saveForm)} className="rounded-xl bg-primary px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white disabled:opacity-50">{saving ? 'Saving…' : 'Save draft'}</button><button type="button" disabled={approvalDisabled} onClick={onApprove} className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-emerald-300 disabled:opacity-50"><ShieldCheck size={14} /> Approve</button><button type="button" disabled={publishDisabled} onClick={onPublish} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white disabled:opacity-50"><Send size={14} /> Publish</button></div></div>{!validation.pass ? <p role="alert" className="mt-4 rounded-xl border border-red-500/20 bg-red-500/[0.06] p-3 text-xs text-red-200">Contrast validation failed. Correct the bounded presets before publishing.</p> : <p className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] p-3 text-xs text-emerald-200">All light/dark palette checks pass WCAG AA.</p>}</section>
          {historyLoading ? <p className="rounded-2xl border border-white/10 p-5 text-sm text-zinc-600">Loading revision history…</p> : null}{history ? <RevisionHistory revisions={history.revisions} audit={history.audit} canRollback={canRollback && Boolean(history.revisions.some((revision) => revision.state === 'published'))} loading={actionBusy} selectedRevision={selectedRevision} onRollback={onRollback} /> : null}
          {publishedManifest ? <p className="text-[11px] text-zinc-600">Published revision r{publishedManifest.revision} remains the live source until an approved candidate is published or rolled back.</p> : null}
        </main>
      </div>
    </div>
  )
}
