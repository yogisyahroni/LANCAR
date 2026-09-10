import type { ExperienceConflict, ExperienceForm } from './types'

type Props = {
  form: ExperienceForm
  conflicts: ExperienceConflict[]
  scheduleOnly?: boolean
}

const list = (items: string[]) => items.length ? items.join(', ') : 'All'

const adminTimeFor = (value: string, timeZone: string) => {
  if (!value) return 'Not set'
  const wallClock = new Date(`${value}:00Z`)
  if (Number.isNaN(wallClock.getTime())) return value
  try {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).formatToParts(wallClock).filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)]))
    const targetAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute)
    const offset = targetAsUtc - wallClock.getTime()
    return new Date(wallClock.getTime() - offset).toLocaleString()
  } catch {
    return value
  }
}

export default function TargetingSummary({ form, conflicts, scheduleOnly = false }: Props) {
  const targeting = form.targeting
  const hasTargeting = Boolean(targeting.market_codes.length || targeting.city_codes.length || targeting.zone_codes.length || targeting.locales.length || targeting.service_usage_cohorts.length || targeting.cohorts.length || targeting.roles.length || targeting.user_status || targeting.experiment_ref || targeting.experiment_assignments.length)
  return (
    <section className="space-y-4 rounded-3xl border border-primary/20 bg-primary/[0.04] p-5" aria-labelledby="targeting-summary-title">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between"><div><h2 id="targeting-summary-title" className="text-sm font-black uppercase tracking-wider text-foreground-muted">{scheduleOnly ? 'Schedule & audience safety' : 'Audience resolution summary'}</h2><p className="mt-1 text-xs leading-relaxed text-foreground-muted">The server resolves targeting and schedule. The customer client receives the selected sanitized manifest, not these rule details.</p></div><span className="rounded-full bg-info-surface px-3 py-1 text-[10px] font-black uppercase tracking-widest text-info">Server-side resolver</span></div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-border bg-surface-subtle p-3 text-xs"><p className="font-black uppercase tracking-widest text-foreground-muted">Market</p><p className="mt-1 text-foreground-muted">{list(targeting.market_codes) === 'All' ? form.market_code : list(targeting.market_codes)}</p></div>
        <div className="rounded-2xl border border-border bg-surface-subtle p-3 text-xs"><p className="font-black uppercase tracking-widest text-foreground-muted">City / zone</p><p className="mt-1 text-foreground-muted">{list(targeting.city_codes)} / {list(targeting.zone_codes)}</p></div>
        <div className="rounded-2xl border border-border bg-surface-subtle p-3 text-xs"><p className="font-black uppercase tracking-widest text-foreground-muted">Locale / role</p><p className="mt-1 text-foreground-muted">{list(targeting.locales)} / {list(targeting.roles)}</p></div>
        <div className="rounded-2xl border border-border bg-surface-subtle p-3 text-xs"><p className="font-black uppercase tracking-widest text-foreground-muted">Rollout</p><p className="mt-1 text-foreground-muted">{form.rollout_stage} · {form.rollout_percentage}%{form.canary_cohort ? ` · ${form.canary_cohort}` : ''}</p></div>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl border border-border bg-surface-subtle p-4 text-xs text-foreground-muted"><p className="font-black uppercase tracking-widest text-foreground-muted">Fallback audience before publish</p><p className="mt-2 leading-relaxed">{hasTargeting ? 'If this targeted revision does not match, the resolver ranks another eligible published revision with the same market, surface, locale and app-version scope. If none matches, the client keeps its packaged fallback.' : 'This is the default/broad audience for the selected market and surface. It is eligible when no more-specific audience wins.'}</p></div>
        <div className="rounded-2xl border border-border bg-surface-subtle p-4 text-xs text-foreground-muted"><p className="font-black uppercase tracking-widest text-foreground-muted">Effective schedule</p><p className="mt-2">{form.starts_at || 'Not set'} → {form.ends_at || 'No end'} ({form.schedule_timezone})</p><p className="mt-1 text-foreground-muted">Admin local preview: {adminTimeFor(form.starts_at, form.schedule_timezone)} → {form.ends_at ? adminTimeFor(form.ends_at, form.schedule_timezone) : 'No end'}</p></div>
      </div>
      <div className={`rounded-2xl border p-4 text-xs ${conflicts.length ? 'border-warning bg-warning/[0.08] text-warning' : 'border-success bg-success/[0.06] text-success'}`}><p className="font-black uppercase tracking-widest">Conflict detector</p>{conflicts.length ? <ul className="mt-2 space-y-1">{conflicts.map((conflict) => <li key={`${conflict.manifest_id}-${conflict.revision}`}>Possible overlap with {conflict.campaign_name} r{conflict.revision} on {conflict.placements.join(', ')}.</li>)}</ul> : <p className="mt-2">No active published campaign currently overlaps this market, surface, schedule and audience.</p>}</div>
    </section>
  )
}
