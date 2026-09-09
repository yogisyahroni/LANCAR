import { AlertTriangle, CheckCircle2, GitCompareArrows, ShieldCheck } from 'lucide-react'
import type { ExperienceSection } from './types'

export type PreviewResult = {
  impression_recorded: false
  simulation: { matched?: boolean; reason?: string }
  context: Record<string, unknown>
  validation: {
    valid: boolean
    issues: Array<{ path: string; code: string; message: string; blocking: boolean }>
  }
  candidate: {
    manifest: { revision: number; sections: ExperienceSection[] }
    section_outcomes: Array<{ section_id: string; component: string; status: 'rendered' | 'skipped' | 'fallback'; reason?: string }>
  } | null
  fallback: { revision: number; sections: ExperienceSection[] } | null
  current_live: { revision: number; sections: ExperienceSection[] } | null
  diff: {
    changed_fields: string[]
    added_sections: string[]
    removed_sections: string[]
    changed_sections: string[]
    field_changes: Array<{ field: string; previous: unknown; next: unknown }>
  }
  release_summary?: {
    audience: {
      mode: 'broad' | 'targeted'
      market_code: string
      locale: string
      dimensions: Record<string, unknown>
    }
    schedule: { starts_at: string; ends_at: string | null; timezone: string }
    rollout: { stage: 'canary' | 'public'; canary_cohort: string | null; percentage: number }
    affected_surfaces: string[]
    blast_radius: { level: 'low' | 'medium' | 'high'; reasons: string[] }
  }
}

type Props = { result?: PreviewResult }

const valueLabel = (value: unknown): string => {
  if (value === null || value === undefined) return 'none'
  const serialized = typeof value === 'string' ? value : JSON.stringify(value)
  return serialized.length > 360 ? `${serialized.slice(0, 360)}…` : serialized
}

export default function RevisionDiffPreview({ result }: Props) {
  if (!result) return (
    <section className="rounded-3xl border border-dashed border-white/10 bg-white/[0.02] p-5 text-sm text-zinc-500" aria-label="preview not run">
      Run the server preview before publishing. It resolves the candidate against the production manifest rules and does not create an impression.
    </section>
  )

  const outcomes = result.candidate?.section_outcomes ?? []
  return (
    <section className="space-y-4 rounded-3xl border border-white/10 bg-white/[0.03] p-5" aria-labelledby="revision-diff-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div><div className="flex items-center gap-2"><GitCompareArrows size={18} className="text-primary-light" /><h2 id="revision-diff-title" className="text-base font-black text-zinc-100">Live vs candidate resolver result</h2></div><p className="mt-1 text-xs text-zinc-500">Server-selected revision and fallback behavior for the selected market, surface, version, capability and audience.</p></div>
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-emerald-300"><ShieldCheck size={13} /> No impression recorded</span>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-black/10 p-3"><p className="text-[10px] font-black uppercase tracking-widest text-zinc-600">Current live</p><p className="mt-2 text-sm font-black text-zinc-200">{result.current_live ? `Revision ${result.current_live.revision}` : 'No matching live revision'}</p><p className="mt-1 text-xs text-zinc-500">{result.current_live?.sections.length ?? 0} sections</p></div>
        <div className="rounded-2xl border border-primary/20 bg-primary/5 p-3"><p className="text-[10px] font-black uppercase tracking-widest text-primary-light">Candidate</p><p className="mt-2 text-sm font-black text-zinc-200">{result.candidate ? `Revision ${result.candidate.manifest.revision}` : 'Not rendered for context'}</p><p className="mt-1 text-xs text-zinc-500">{result.candidate?.manifest.sections.length ?? 0} sections</p></div>
        <div className={`rounded-2xl border p-3 ${result.validation.valid ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-red-500/20 bg-red-500/5'}`}><p className="text-[10px] font-black uppercase tracking-widest text-zinc-600">Publish gate</p><p className={`mt-2 text-sm font-black ${result.validation.valid ? 'text-emerald-200' : 'text-red-200'}`}>{result.validation.valid ? 'Pass' : 'Blocked'}</p><p className="mt-1 text-xs text-zinc-500">{result.validation.issues.length} validation issue(s)</p></div>
      </div>
      {result.release_summary ? <div className="grid gap-3 lg:grid-cols-4" aria-label="approval release summary">
        <div className="rounded-2xl border border-white/10 bg-black/10 p-3"><p className="text-[10px] font-black uppercase tracking-widest text-zinc-600">Audience</p><p className="mt-2 text-sm font-black text-zinc-200">{result.release_summary.audience.mode}</p><p className="mt-1 text-xs text-zinc-500">{result.release_summary.audience.market_code} · {result.release_summary.audience.locale}</p><p className="mt-1 text-[11px] text-zinc-600">{Object.entries(result.release_summary.audience.dimensions).filter(([, value]) => Array.isArray(value) ? value.length > 0 : Boolean(value)).map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : String(value)}`).join(' · ') || 'No additional constraints'}</p></div>
        <div className="rounded-2xl border border-white/10 bg-black/10 p-3"><p className="text-[10px] font-black uppercase tracking-widest text-zinc-600">Schedule</p><p className="mt-2 text-sm font-black text-zinc-200">{new Date(result.release_summary.schedule.starts_at).toLocaleString()}</p><p className="mt-1 text-xs text-zinc-500">{result.release_summary.schedule.timezone}{result.release_summary.schedule.ends_at ? ` → ${new Date(result.release_summary.schedule.ends_at).toLocaleString()}` : ' · no end'}</p></div>
        <div className="rounded-2xl border border-white/10 bg-black/10 p-3"><p className="text-[10px] font-black uppercase tracking-widest text-zinc-600">Rollout / surfaces</p><p className="mt-2 text-sm font-black text-zinc-200">{result.release_summary.rollout.stage} · {result.release_summary.rollout.percentage}%</p><p className="mt-1 text-xs text-zinc-500">{result.release_summary.rollout.canary_cohort || 'general audience'} · {result.release_summary.affected_surfaces.join(', ')}</p></div>
        <div className={`rounded-2xl border p-3 ${result.release_summary.blast_radius.level === 'high' ? 'border-red-500/20 bg-red-500/5' : result.release_summary.blast_radius.level === 'medium' ? 'border-amber-500/20 bg-amber-500/5' : 'border-emerald-500/20 bg-emerald-500/5'}`}><p className="text-[10px] font-black uppercase tracking-widest text-zinc-600">Risk / blast radius</p><p className="mt-2 text-sm font-black uppercase text-zinc-200">{result.release_summary.blast_radius.level}</p><div className="mt-1 space-y-1">{result.release_summary.blast_radius.reasons.map((reason) => <p key={reason} className="text-xs text-zinc-500">{reason}</p>)}</div></div>
      </div> : null}
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-black/10 p-3"><p className="text-[10px] font-black uppercase tracking-widest text-zinc-600">Current live sections</p><div className="mt-2 space-y-1">{result.current_live?.sections.map((section) => <p key={section.id} className="text-xs text-zinc-400">{section.id} · {section.component}</p>) ?? <p className="text-xs text-zinc-600">None</p>}</div></div>
        <div className="rounded-2xl border border-primary/20 bg-primary/5 p-3"><p className="text-[10px] font-black uppercase tracking-widest text-primary-light">Candidate sections</p><div className="mt-2 space-y-1">{result.candidate?.manifest.sections.map((section) => <p key={section.id} className="text-xs text-zinc-300">{section.id} · {section.component}</p>) ?? <p className="text-xs text-zinc-600">Not rendered for this context</p>}</div></div>
      </div>
      {!result.validation.valid ? <div className="space-y-2 rounded-2xl border border-red-500/20 bg-red-500/5 p-4" role="alert"><p className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-red-200"><AlertTriangle size={14} /> Blocking validation</p>{result.validation.issues.map((issue) => <p key={`${issue.code}:${issue.path}`} className="text-xs text-red-100/80">{issue.path} · {issue.message}</p>)}</div> : <p className="flex items-center gap-2 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs text-emerald-200"><CheckCircle2 size={14} /> Schema, asset/deep-link integrity, schedule and targeting gates are clear for this saved candidate.</p>}
      {outcomes.length ? <div className="space-y-2"><p className="text-[10px] font-black uppercase tracking-widest text-zinc-600">Component outcomes</p>{outcomes.map((outcome) => <div key={outcome.section_id} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/10 px-3 py-2 text-xs"><span className="font-mono text-zinc-300">{outcome.section_id} · {outcome.component}</span><span className={outcome.status === 'rendered' ? 'text-emerald-300' : outcome.status === 'fallback' ? 'text-amber-300' : 'text-zinc-500'}>{outcome.status}{outcome.reason ? ` · ${outcome.reason}` : ''}</span></div>)}</div> : null}
      <div className="space-y-1 text-[11px] text-zinc-500"><div className="flex flex-wrap gap-2"><span>Changed: {result.diff.changed_fields.length}</span><span>·</span><span>Added sections: {result.diff.added_sections.length}</span><span>·</span><span>Removed: {result.diff.removed_sections.length}</span><span>·</span><span>Changed sections: {result.diff.changed_sections.length}</span></div>{result.diff.changed_fields.length ? <p>Fields: {result.diff.changed_fields.join(', ')}</p> : null}</div>
      {result.diff.field_changes.length ? <div className="space-y-2 rounded-2xl border border-white/10 bg-black/10 p-4" aria-label="field-level revision diff"><p className="text-[10px] font-black uppercase tracking-widest text-zinc-600">Field-level changes</p>{result.diff.field_changes.map((change) => <div key={change.field} className="grid gap-2 rounded-xl border border-white/5 bg-white/[0.02] p-3 text-xs md:grid-cols-[7rem_1fr_1fr] md:items-start"><span className="font-black uppercase tracking-wider text-primary-light">{change.field}</span><span className="break-words text-red-200/80"><strong className="mr-1 text-[10px] uppercase tracking-widest text-zinc-600">Previous</strong>{valueLabel(change.previous)}</span><span className="break-words text-emerald-200/80"><strong className="mr-1 text-[10px] uppercase tracking-widest text-zinc-600">New</strong>{valueLabel(change.next)}</span></div>)}</div> : null}
    </section>
  )
}
