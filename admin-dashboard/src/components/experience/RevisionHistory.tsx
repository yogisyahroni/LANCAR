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
    <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-5" aria-labelledby="experience-history-title">
      <div className="flex items-center gap-3"><History size={18} className="text-primary-light" /><div><h2 id="experience-history-title" className="text-base font-black text-zinc-100">Revision history</h2><p className="text-xs text-zinc-500">Who changed what, with known-good rollback targets.</p></div></div>
      <div className="mt-5 space-y-3">{revisions.length === 0 ? <p className="text-sm text-zinc-600">No revisions yet.</p> : revisions.map((revision) => <div key={revision.id} aria-current={revision.revision === selectedRevision ? 'true' : undefined} className={`flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center sm:justify-between ${revision.revision === selectedRevision ? 'border-primary/60 bg-primary/10' : 'border-white/10 bg-black/10'}`}><div><div className="flex flex-wrap items-center gap-2"><span className="text-sm font-black text-zinc-100">Revision {revision.revision}</span>{revision.revision === selectedRevision ? <span className="rounded-full bg-primary/20 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-primary-light">linked target</span> : null}<span className="rounded-full bg-white/10 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-zinc-400">{revision.state}</span><span className={`rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-widest ${revision.approval_status === 'approved' ? 'bg-emerald-500/10 text-emerald-300' : revision.requires_approval ? 'bg-amber-500/10 text-amber-200' : 'bg-zinc-800 text-zinc-500'}`}>{revision.requires_approval ? `approval ${revision.approval_status}` : 'approval not required'}</span></div><p className="mt-2 text-xs text-zinc-500">Updated by <span className="font-mono text-zinc-400">{revision.updated_by || revision.created_by || 'system'}</span> · {dateLabel(revision.updated_at)}</p></div>{compatibleKnownGood(revision) ? <button type="button" disabled={loading} onClick={() => onRollback(revision.revision)} className="inline-flex items-center justify-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-amber-200 disabled:opacity-50"><RotateCcw size={14} /> Roll back</button> : null}</div>)}</div>
      <div className="mt-6 border-t border-white/10 pt-5"><div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-zinc-500"><UserCheck size={14} /> Audit trail</div><div className="mt-3 space-y-2">{audit.length === 0 ? <p className="text-sm text-zinc-600">No audit events yet.</p> : audit.slice(0, 12).map((event) => <div key={event.id} className="flex flex-col gap-1 rounded-xl bg-black/10 px-3 py-2 text-xs"><div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between"><span className="font-bold text-zinc-300">{event.action} · r{event.revision}</span><span className="text-zinc-600">{event.actor_id || 'system'} · {dateLabel(event.created_at)}</span></div><span className="text-zinc-500">Reason: {event.reason || 'not supplied'}</span></div>)}</div></div>
    </section>
  )
}
