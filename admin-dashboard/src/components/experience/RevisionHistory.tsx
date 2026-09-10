import { History, RotateCcw, UserCheck } from 'lucide-react'
import type { ExperienceAuditRecord, ExperienceManifest } from './types'

type Props = {
  revisions: ExperienceManifest[]
  audit: ExperienceAuditRecord[]
  onRollback: (revision: number) => void
  canRollback: boolean
  loading?: boolean
  selectedRevision?: number | null
  currentPublishedRevision?: number | null
}

const dateLabel = (value: string) => {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

export default function RevisionHistory({ revisions, audit, onRollback, canRollback, loading = false, selectedRevision = null, currentPublishedRevision = null }: Props) {
  const currentPublished = revisions.find((revision) => revision.state === 'published' && (currentPublishedRevision === null || revision.revision === currentPublishedRevision)) ?? null
  const compatibleKnownGood = (revision: ExperienceManifest) => Boolean(
    canRollback
    && currentPublished
    && revision.state !== 'published'
    && revision.state !== 'draft'
    && revision.revision < currentPublished.revision
    && revision.market_code === currentPublished.market_code
    && revision.surface === currentPublished.surface
    && revision.schema_version === currentPublished.schema_version
    && !revision.kill_switch_active,
  )
  return (
    <section className="rounded-3xl border border-border bg-surface/[0.03] p-5" aria-labelledby="experience-history-title">
      <div className="flex items-center gap-3"><History size={18} className="text-primary-light" aria-hidden="true" /><div><h2 id="experience-history-title" className="text-base font-black text-foreground-muted">Revision history</h2><p className="text-xs text-foreground-muted">Who changed what, with known-good rollback targets.</p></div></div>
      <div className="mt-5 space-y-3">{revisions.length === 0 ? <p className="text-sm text-foreground-muted">No revisions yet.</p> : revisions.map((revision) => <div key={revision.id} aria-current={revision.revision === selectedRevision ? 'true' : undefined} className={`flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center sm:justify-between ${revision.revision === selectedRevision ? 'border-primary/60 bg-primary/10' : 'border-border bg-surface-subtle'}`}><div><div className="flex flex-wrap items-center gap-2"><span className="text-sm font-black text-foreground-muted">Revision {revision.revision}</span>{revision.revision === selectedRevision ? <span className="rounded-full bg-primary/20 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-primary-light">linked target</span> : null}<span className="rounded-full bg-surface-subtle px-2 py-1 text-[10px] font-black uppercase tracking-widest text-foreground-muted">{revision.state}</span><span className={`rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-widest ${revision.approval_status === 'approved' ? 'bg-success-surface text-success' : revision.requires_approval ? 'bg-warning-surface text-warning' : 'bg-surface-raised text-foreground-muted'}`}>{revision.requires_approval ? `approval ${revision.approval_status}` : 'approval not required'}</span></div><p className="mt-2 text-xs text-foreground-muted">Updated by <span className="font-mono text-foreground-muted">{revision.updated_by || revision.created_by || 'system'}</span> · {dateLabel(revision.updated_at)}</p></div>{compatibleKnownGood(revision) ? <button type="button" disabled={loading} onClick={() => onRollback(revision.revision)} className="inline-flex items-center justify-center gap-2 rounded-xl border border-warning bg-warning-surface px-3 py-2 text-[10px] font-black uppercase tracking-widest text-warning disabled:opacity-60"><RotateCcw size={14} aria-hidden="true" /> Roll back</button> : null}</div>)}</div>
      <div className="mt-6 border-t border-border pt-5"><div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-foreground-muted"><UserCheck size={14} aria-hidden="true" /> Audit trail</div><div className="mt-3 space-y-2">{audit.length === 0 ? <p className="text-sm text-foreground-muted">No audit events yet.</p> : audit.slice(0, 12).map((event) => <div key={event.id} className="flex flex-col gap-1 rounded-xl bg-surface-subtle px-3 py-2 text-xs"><div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between"><span className="font-bold text-foreground-muted">{event.action} · r{event.revision}</span><span className="text-foreground-muted">{event.actor_id || 'system'} · {dateLabel(event.created_at)}</span></div><span className="text-foreground-muted">Reason: {event.reason || 'not supplied'}</span></div>)}</div></div>
    </section>
  )
}
