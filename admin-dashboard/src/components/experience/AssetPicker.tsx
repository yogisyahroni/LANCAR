import { Plus, Trash2 } from 'lucide-react'
import type { ExperienceAsset } from './types'

type Props = {
  value: ExperienceAsset[]
  onChange: (value: ExperienceAsset[]) => void
  disabled?: boolean
  focusAssetId?: string | null
}

const inputClass = 'mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-zinc-100 outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/20 disabled:opacity-50'
const MAX_ASSET_BYTES = 5 * 1024 * 1024

const contentTypeForKind = (kind: ExperienceAsset['kind']) => kind === 'video'
  ? 'video/mp4'
  : kind === 'animation' ? 'image/gif' : 'image/webp'

const toDateTimeInput = (value?: string | null) => value ? new Date(value).toISOString().slice(0, 16) : ''
const toIsoDate = (value: string) => value ? new Date(value).toISOString() : null
const optionalNumber = (value: string) => value.trim() === '' ? null : Number(value)

const newAsset = (index: number): ExperienceAsset => ({
  asset_id: `asset-${index + 1}`,
  uri: '',
  kind: 'image',
  checksum: '',
  content_type: 'image/webp',
  width: null,
  height: null,
  aspect_ratio: null,
  size_limit_bytes: MAX_ASSET_BYTES,
  version: '1',
  expires_at: null,
  cache_policy: 'private',
  retention_until: null,
  fallback_asset_id: null,
})

export default function AssetPicker({ value, onChange, disabled = false, focusAssetId = null }: Props) {
  const update = (index: number, patch: Partial<ExperienceAsset>) => onChange(value.map((asset, assetIndex) => assetIndex === index ? { ...asset, ...patch } : asset))

  return (
    <section className="rounded-2xl border border-white/10 bg-black/10 p-5" aria-labelledby="asset-picker-title">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 id="asset-picker-title" className="text-sm font-black uppercase tracking-wider text-zinc-200">Asset references</h3>
          <p className="mt-1 text-xs text-zinc-500">Use a first-party HTTPS/CDN URL and declare delivery metadata. The server and customer app verify it before caching.</p>
        </div>
        <button type="button" disabled={disabled} onClick={() => onChange([...value, newAsset(value.length)])} className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-primary-light disabled:opacity-50"><Plus size={14} /> Add</button>
      </div>
      {value.length === 0 ? <p className="mt-4 rounded-xl border border-dashed border-white/10 p-4 text-xs text-zinc-600">No assets. Components without media can be published safely.</p> : <div className="mt-4 space-y-3">
        {value.map((asset, index) => <div key={`${asset.asset_id}-${index}`} className={`rounded-xl border p-3 ${asset.asset_id === focusAssetId ? 'border-orange-400/70 bg-orange-500/10' : 'border-white/10 bg-white/[0.03]'}`}>
          {asset.asset_id === focusAssetId ? <p className="mb-3 text-[10px] font-black uppercase tracking-widest text-orange-200">Offending asset linked from overview</p> : null}
          <div className="grid gap-3 md:grid-cols-[1fr_2fr_130px_1fr_auto]">
            <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">ID<input className={inputClass} disabled={disabled} value={asset.asset_id} onChange={(event) => update(index, { asset_id: event.target.value })} /></label>
            <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">HTTPS URI<input className={inputClass} disabled={disabled} value={asset.uri} onChange={(event) => update(index, { uri: event.target.value })} placeholder="https://cdn.example.com/banner.webp" /></label>
            <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Kind<select className={inputClass} disabled={disabled} value={asset.kind} onChange={(event) => { const kind = event.target.value as ExperienceAsset['kind']; update(index, { kind, content_type: contentTypeForKind(kind) }) }}><option value="image">Image</option><option value="animation">Animation</option><option value="icon">Icon</option><option value="video">Video</option></select></label>
            <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Content type<select className={inputClass} disabled={disabled} value={asset.content_type || contentTypeForKind(asset.kind)} onChange={(event) => update(index, { content_type: event.target.value })}><option value="image/webp">image/webp</option><option value="image/avif">image/avif</option><option value="image/png">image/png</option><option value="image/jpeg">image/jpeg</option><option value="image/gif">image/gif</option><option value="video/mp4">video/mp4</option><option value="video/webm">video/webm</option></select></label>
            <button type="button" disabled={disabled} aria-label={`Remove ${asset.asset_id || 'asset'}`} onClick={() => onChange(value.filter((_, assetIndex) => assetIndex !== index))} className="mt-5 self-start rounded-lg p-2 text-zinc-600 transition hover:bg-red-500/10 hover:text-red-300 disabled:opacity-50"><Trash2 size={16} /></button>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-6">
            <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Width<input type="number" min="1" max="4096" className={inputClass} disabled={disabled} value={asset.width ?? ''} onChange={(event) => update(index, { width: optionalNumber(event.target.value) })} /></label>
            <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Height<input type="number" min="1" max="4096" className={inputClass} disabled={disabled} value={asset.height ?? ''} onChange={(event) => update(index, { height: optionalNumber(event.target.value) })} /></label>
            <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Aspect ratio<input type="number" min="0.1" max="20" step="0.01" className={inputClass} disabled={disabled} value={asset.aspect_ratio ?? ''} onChange={(event) => update(index, { aspect_ratio: optionalNumber(event.target.value) })} placeholder="1.78" /></label>
            <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Max bytes<input type="number" min="1" max={MAX_ASSET_BYTES} className={inputClass} disabled={disabled} value={asset.size_limit_bytes ?? MAX_ASSET_BYTES} onChange={(event) => update(index, { size_limit_bytes: Number(event.target.value) })} /></label>
            <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Version<input className={inputClass} disabled={disabled} value={asset.version || '1'} onChange={(event) => update(index, { version: event.target.value })} /></label>
            <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Cache<select className={inputClass} disabled={disabled} value={asset.cache_policy || 'private'} onChange={(event) => update(index, { cache_policy: event.target.value as ExperienceAsset['cache_policy'] })}><option value="private">private</option><option value="public">public</option><option value="no-store">no-store</option></select></label>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-[2fr_2fr_1fr]">
            <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">SHA-256<input className={inputClass} disabled={disabled} value={asset.checksum} onChange={(event) => update(index, { checksum: event.target.value })} placeholder="64 hex characters" /></label>
            <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Fallback asset ID<input className={inputClass} disabled={disabled} value={asset.fallback_asset_id || ''} onChange={(event) => update(index, { fallback_asset_id: event.target.value.trim() || null })} placeholder="lighter-webp" /></label>
            <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Expires at<input type="datetime-local" className={inputClass} disabled={disabled} value={toDateTimeInput(asset.expires_at)} onChange={(event) => update(index, { expires_at: toIsoDate(event.target.value) })} /></label>
          </div>
          <p className="mt-2 text-[10px] text-zinc-600">A fallback is selected on metered/data-saver networks; an expired or unverifiable asset makes the affected campaign ineligible.</p>
        </div>)}
      </div>}
    </section>
  )
}
