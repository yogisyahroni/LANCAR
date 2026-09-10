import type { AssetUsage } from './assetLibraryTypes'

const stateLabel: Record<AssetUsage['state'], string> = {
  draft: 'draft',
  published: 'live',
  superseded: 'retained rollback',
  rolled_back: 'rolled back',
}

const dateLabel = (value: string | null) => value ? new Date(value).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : 'No end'

export default function AssetUsagePanel({ usages }: { usages: AssetUsage[] }) {
  if (usages.length === 0) return <p className="rounded-xl border border-dashed border-border p-4 text-xs text-foreground-muted">No manifest currently references this asset.</p>
  return <div className="space-y-2">{usages.map((usage) => <article key={`${usage.manifest_id}-${usage.revision}-${usage.surface}`} className="rounded-xl border border-border bg-surface-subtle p-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-mono text-[11px] text-foreground-muted">{usage.manifest_id} · r{usage.revision}</p><span className="rounded-full border border-border px-2 py-1 text-[9px] font-black uppercase tracking-widest text-foreground-muted">{stateLabel[usage.state]}</span></div><p className="mt-2 text-[11px] text-foreground-muted">{usage.market_code} · {usage.surface} · {usage.placements.length ? usage.placements.join(', ') : 'unclassified placement'}</p><p className="mt-1 text-[10px] text-foreground-muted">{dateLabel(usage.starts_at)} → {dateLabel(usage.ends_at)}</p></article>)}</div>
}
