import type { AssetUsage } from './assetLibraryTypes'
import { StatusBadge } from '../StatusBadge'

const stateLabel: Record<AssetUsage['state'], string> = {
  draft: 'Draft',
  published: 'Live',
  superseded: 'Retained rollback',
  rolled_back: 'Rolled back',
}

const dateLabel = (value: string | null) => value ? new Date(value).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : 'No end'

export default function AssetUsagePanel({ usages }: { usages: AssetUsage[] }) {
  if (usages.length === 0) return <p className="rounded-xl border border-dashed border-border p-4 text-xs text-foreground-muted">No manifest currently references this asset.</p>
  return <div className="space-y-2">{usages.map((usage) => <article key={`${usage.manifest_id}-${usage.revision}-${usage.surface}`} className="rounded-xl border border-border bg-surface-subtle p-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-mono text-[11px] text-foreground-muted">{usage.manifest_id} · r{usage.revision}</p><StatusBadge status={usage.state} labelPrefix="Manifest state" label={stateLabel[usage.state]} /></div><p className="mt-2 text-[11px] text-foreground-muted">{usage.market_code} · {usage.surface} · {usage.placements.length ? usage.placements.join(', ') : 'unclassified placement'}</p><p className="mt-1 text-[10px] text-foreground-muted">{dateLabel(usage.starts_at)} → {dateLabel(usage.ends_at)}</p></article>)}</div>
}
