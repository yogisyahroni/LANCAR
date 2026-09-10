import { Clock3, ShieldCheck } from 'lucide-react'

type TimelineEvent = {
  id: string
  event_type: string
  from_status?: string | null
  to_status?: string | null
  actor_role?: string | null
  note?: string | null
  created_at: string
}

export default function CaseTimeline({ events }: { events: TimelineEvent[] }) {
  if (events.length === 0) {
    return <p className="text-sm text-foreground-muted">Belum ada aktivitas pada kasus ini.</p>
  }

  return (
    <ol className="space-y-4" aria-label="Case timeline">
      {events.map((event) => (
        <li key={event.id} className="relative flex gap-3">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary-light">
            {event.event_type.includes('financial') ? <ShieldCheck size={15} aria-hidden="true" /> : <Clock3 size={15} aria-hidden="true" />}
          </div>
          <div className="min-w-0 flex-1 rounded-2xl border border-border bg-surface/[0.025] px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-black uppercase tracking-widest text-foreground-muted">{event.event_type.replaceAll('_', ' ')}</p>
              <time className="text-[10px] text-foreground-muted" dateTime={event.created_at}>
                {new Date(event.created_at).toLocaleString('id-ID')}
              </time>
            </div>
            <p className="mt-1 text-xs text-foreground-muted">
              {event.from_status && event.to_status ? `${event.from_status} → ${event.to_status}` : event.to_status || 'Recorded'}
              {event.actor_role ? ` · ${event.actor_role}` : ''}
            </p>
            {event.note && <p className="mt-2 text-sm leading-relaxed text-foreground-muted">{event.note}</p>}
          </div>
        </li>
      ))}
    </ol>
  )
}
