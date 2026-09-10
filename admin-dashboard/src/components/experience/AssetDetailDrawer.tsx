import { Image, X } from 'lucide-react'
import type { LibraryAsset } from './assetLibraryTypes'
import AssetUsagePanel from './AssetUsagePanel'
import { StatusBadge } from '../StatusBadge'

const lifecycleLabel: Record<LibraryAsset['lifecycle'], string> = {
  active: 'Aktif',
  deprecated: 'Deprecated',
  scheduled_deletion: 'Penghapusan terjadwal',
}

const lifecycleClass: Record<LibraryAsset['lifecycle'], string> = {
  active: 'border-success bg-success-surface',
  deprecated: 'border-border bg-surface-subtle',
  scheduled_deletion: 'border-warning bg-warning-surface',
}

const bytesLabel = (value?: number) => value ? `${(value / (1024 * 1024)).toFixed(2)} MiB` : 'Unknown'

export default function AssetDetailDrawer({ asset, onClose }: { asset: LibraryAsset; onClose: () => void }) {
  const isVideo = asset.content_type?.startsWith('video/') || asset.kind === 'video'
  const liveReference = asset.usages.some((usage) => usage.state === 'published')
  const surfaces = Array.from(new Set(asset.usages.map((usage) => usage.surface)))
  const placements = Array.from(new Set(asset.usages.flatMap((usage) => usage.placements)))
  return <aside className="rounded-3xl border border-border bg-surface-subtle p-5 shadow-2xl" aria-labelledby="asset-detail-title"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.25em] text-primary-light">Asset detail</p><h2 id="asset-detail-title" className="mt-2 break-all text-xl font-black text-foreground-muted">{asset.asset_id}</h2><p className="mt-1 text-xs text-foreground-muted">Immutable version {asset.version || '1'} · SHA-256 {asset.checksum.slice(0, 12)}…</p></div><button type="button" onClick={onClose} aria-label="Close asset detail" title="Close asset detail" className="rounded-lg p-2 text-foreground-muted hover:bg-surface-subtle hover:text-foreground-muted"><X size={17} aria-hidden="true" /></button></div><div className="mt-5 overflow-hidden rounded-2xl border border-border bg-scrim/30">{asset.uri ? isVideo ? <video src={asset.uri} controls className="max-h-64 w-full object-contain" aria-label={`Preview ${asset.asset_id}`} /> : <img src={asset.uri} alt={`Preview ${asset.asset_id}`} className="max-h-64 w-full object-contain" /> : <div className="flex h-40 items-center justify-center text-foreground-muted"><Image size={34} aria-hidden="true" /></div>}</div><div className="mt-4 flex flex-wrap gap-2"><StatusBadge status={asset.lifecycle} labelPrefix="Asset lifecycle" label={lifecycleLabel[asset.lifecycle]} className={lifecycleClass[asset.lifecycle]} />{liveReference ? <StatusBadge status="protected" labelPrefix="Asset reference" label="Live reference protected" className="border-info bg-info/[0.06]" /> : null}</div><dl className="mt-4 grid gap-3 text-xs sm:grid-cols-2"><div><dt className="text-foreground-muted">Content type</dt><dd className="mt-1 text-foreground-muted">{asset.content_type || 'Unknown'} · {asset.kind}</dd></div><div><dt className="text-foreground-muted">Dimensions / size limit</dt><dd className="mt-1 text-foreground-muted">{asset.width && asset.height ? `${asset.width} × ${asset.height}` : 'Unknown'} · {bytesLabel(asset.size_limit_bytes)}</dd></div><div><dt className="text-foreground-muted">URI</dt><dd className="mt-1 break-all text-foreground-muted">{asset.uri || 'Not registered'}</dd></div><div><dt className="text-foreground-muted">Fallback</dt><dd className="mt-1 text-foreground-muted">{asset.fallback_asset_id || 'None declared'}</dd></div><div><dt className="text-foreground-muted">Expires</dt><dd className="mt-1 text-foreground-muted">{asset.expires_at ? new Date(asset.expires_at).toLocaleString('id-ID') : 'No expiry'}</dd></div><div><dt className="text-foreground-muted">Retention until</dt><dd className="mt-1 text-foreground-muted">{asset.retention_until ? new Date(asset.retention_until).toLocaleString('id-ID') : 'Not scheduled'}</dd></div></dl><div className="mt-4 rounded-2xl border border-info bg-info/[0.06] p-4 text-xs leading-relaxed text-info"><p className="font-black uppercase tracking-widest">Compatibility hints</p><p className="mt-2">Observed surfaces: {surfaces.length ? surfaces.join(', ') : 'not referenced yet'} · placements: {placements.length ? placements.join(', ') : 'not classified'}. Final compatibility remains server-validated by the component and manifest schemas.</p></div><div className="mt-5 rounded-2xl border border-warning bg-warning/[0.06] p-4 text-xs leading-relaxed text-warning"><p className="font-black uppercase tracking-widest">Historical safety</p><p className="mt-2">There is no destructive delete action here. Live and retained rollback references stay immutable; remove an asset only through a new versioned manifest after the retention window.</p></div><div className="mt-5"><div className="mb-3 flex items-center justify-between gap-3"><h3 className="text-sm font-black text-foreground-muted">Usage references</h3><span className="text-xs font-bold text-foreground-muted" aria-label={`${asset.usages.length} usage references`}>{asset.usages.length} revision{asset.usages.length === 1 ? '' : 's'}</span></div><AssetUsagePanel usages={asset.usages} /></div></aside>
}
