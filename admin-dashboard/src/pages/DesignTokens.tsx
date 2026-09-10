import { FilePlus2, RefreshCw, Send, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import RevisionHistory from '../components/experience/RevisionHistory'
import type { ExperienceForm, ExperienceHistory, ExperienceManifest } from '../components/experience/types'
import ContrastPreview, { type PreviewMode } from '../components/experience/ContrastPreview'
import DesignTokenEditor, { DEFAULT_DESIGN_TOKENS, normalizeDesignTokens, validateDesignTokens, type DesignTokenKey } from '../components/experience/DesignTokenEditor'
import { StatusBadge } from '../components/StatusBadge'

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
        <div><p className="text-[10px] font-black uppercase tracking-[0.25em] text-primary-light">Safe runtime configuration</p><h1 className="mt-2 text-3xl font-black tracking-tight text-foreground-muted">Design Tokens · App Experience</h1><p className="mt-2 max-w-3xl text-sm leading-relaxed text-foreground-muted">Edit only campaign presentation presets. The existing manifest draft, maker-checker approval, publish, audit and rollback lifecycle remains the source of truth.</p></div>
        <div className="flex flex-wrap gap-2"><button type="button" onClick={onRefresh} className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-[10px] font-black uppercase tracking-widest text-foreground-muted"><RefreshCw size={14} aria-hidden="true" /> Refresh</button><button type="button" disabled={!canEdit} onClick={onNew} className="inline-flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-[10px] font-black uppercase tracking-widest text-on-primary disabled:opacity-60"><FilePlus2 size={14} aria-hidden="true" /> New token draft</button></div>
      </div>
      <div className="grid gap-6 xl:grid-cols-[18rem_minmax(0,1fr)]">
        <aside className="space-y-4 rounded-3xl border border-border bg-surface/[0.03] p-4" aria-labelledby="design-token-manifest-list">
          <div className="flex items-center justify-between"><h2 id="design-token-manifest-list" className="text-sm font-black uppercase tracking-wider text-foreground-muted">Scoped revisions</h2><ShieldCheck size={17} className="text-foreground-muted" aria-hidden="true" /></div>
          <div className="space-y-2">{manifests.map((manifest) => <button type="button" key={manifest.manifest_id} onClick={() => onSelect(manifest)} className={`w-full rounded-2xl border p-3 text-left ${manifest.manifest_id === selectedId ? 'border-primary/50 bg-primary/10' : 'border-border bg-surface-subtle hover:border-border'}`}><div className="flex items-center justify-between gap-2"><span className="truncate font-mono text-[10px] text-foreground-muted" title={manifest.manifest_id}>{manifest.manifest_id.slice(0, 8)}…</span><StatusBadge status={manifest.state} labelPrefix="Manifest status" className="px-2 py-1 text-[9px] uppercase tracking-widest" /></div><p className="mt-2 text-sm font-black text-foreground-muted">r{manifest.revision} · {manifest.surface}</p><p className="mt-1 text-[10px] text-foreground-muted">{manifest.market_code} · {manifest.locale}</p></button>)}</div>
          {!manifests.length ? <p className="rounded-2xl border border-dashed border-border p-4 text-center text-xs text-foreground-muted">No manifest in this scope. Start a token draft.</p> : null}
        </aside>
        <div className="min-w-0 space-y-6">
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-surface-subtle p-4 text-xs text-foreground-muted"><span className="font-black uppercase tracking-widest text-foreground-muted">{selected ? `Manifest ${selected.manifest_id.slice(0, 8)}…` : 'New manifest'}</span><span>·</span><span>mode {mode}</span><span>·</span><span>state {actionManifest?.state ?? 'not saved'}</span>{actionManifest?.requires_approval ? <span className="text-warning">· approval {actionManifest.approval_status}</span> : null}</div>
          <DesignTokenEditor value={tokens} disabled={!canEdit || saving} onChange={updateTokens} />
          <ContrastPreview tokens={tokens} mode={previewMode} onModeChange={setPreviewMode} />
          <section className="rounded-3xl border border-border bg-surface/[0.03] p-5" aria-labelledby="design-token-lifecycle-title"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><h2 id="design-token-lifecycle-title" className="text-base font-black text-foreground-muted">Draft and release lifecycle</h2><p className="mt-1 text-xs leading-relaxed text-foreground-muted">Saving creates or updates a manifest draft. Publish is disabled until the accessibility gate passes and the normal permission/approval checks are satisfied.</p></div><div className="flex flex-wrap gap-2"><button type="button" disabled={!canEdit || saving} onClick={() => onSave(saveForm)} className="rounded-xl bg-primary px-3 py-2 text-[10px] font-black uppercase tracking-widest text-on-primary disabled:opacity-60">{saving ? 'Saving…' : 'Save draft'}</button><button type="button" disabled={approvalDisabled} onClick={onApprove} className="inline-flex items-center gap-2 rounded-xl border border-success bg-success-surface px-3 py-2 text-[10px] font-black uppercase tracking-widest text-success disabled:opacity-60"><ShieldCheck size={14} aria-hidden="true" /> Approve</button><button type="button" disabled={publishDisabled} onClick={onPublish} className="inline-flex items-center gap-2 rounded-xl bg-success px-3 py-2 text-[10px] font-black uppercase tracking-widest text-on-success disabled:opacity-60"><Send size={14} aria-hidden="true" /> Publish</button></div></div>{!validation.pass ? <p role="alert" className="mt-4 rounded-xl border border-error bg-error/[0.06] p-3 text-xs text-error">Contrast validation failed. Correct the bounded presets before publishing.</p> : <p className="mt-4 rounded-xl border border-success bg-success/[0.06] p-3 text-xs text-success">All light/dark palette checks pass WCAG AA.</p>}</section>
          {historyLoading ? <p className="rounded-2xl border border-border p-5 text-sm text-foreground-muted">Loading revision history…</p> : null}{history ? <RevisionHistory revisions={history.revisions} audit={history.audit} canRollback={canRollback && Boolean(history.revisions.some((revision) => revision.state === 'published'))} loading={actionBusy} selectedRevision={selectedRevision} onRollback={onRollback} /> : null}
          {publishedManifest ? <p className="text-[11px] text-foreground-muted">Published revision r{publishedManifest.revision} remains the live source until an approved candidate is published or rolled back.</p> : null}
        </div>
      </div>
    </div>
  )
}
