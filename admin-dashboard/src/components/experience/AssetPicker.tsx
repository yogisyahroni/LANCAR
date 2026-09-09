import { Plus, Trash2 } from 'lucide-react'
import type { ExperienceAsset } from './types'

type Props = {
  value: ExperienceAsset[]
  onChange: (value: ExperienceAsset[]) => void
  disabled?: boolean
}

const inputClass = 'mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-zinc-100 outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/20 disabled:opacity-50'

export default function AssetPicker({ value, onChange, disabled = false }: Props) {
  const update = (index: number, patch: Partial<ExperienceAsset>) => onChange(value.map((asset, assetIndex) => assetIndex === index ? { ...asset, ...patch } : asset))

  return (
    <section className="rounded-2xl border border-white/10 bg-black/10 p-5" aria-labelledby="asset-picker-title">
      <div className="flex items-center justify-between gap-3">
        <div><h3 id="asset-picker-title" className="text-sm font-black uppercase tracking-wider text-zinc-200">Asset references</h3><p className="mt-1 text-xs text-zinc-500">Use a first-party HTTPS/CDN URL and the SHA-256 checksum. The server blocks missing or invalid references.</p></div>
        <button type="button" disabled={disabled} onClick={() => onChange([...value, { asset_id: `asset-${value.length + 1}`, uri: '', kind: 'image', checksum: '' }])} className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-primary-light disabled:opacity-50"><Plus size={14} /> Add</button>
      </div>
      {value.length === 0 ? <p className="mt-4 rounded-xl border border-dashed border-white/10 p-4 text-xs text-zinc-600">No assets. Components without media can be published safely.</p> : <div className="mt-4 space-y-3">{value.map((asset, index) => <div key={`${asset.asset_id}-${index}`} className="grid gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 md:grid-cols-[1fr_2fr_120px_2fr_auto]"><label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">ID<input className={inputClass} disabled={disabled} value={asset.asset_id} onChange={(event) => update(index, { asset_id: event.target.value })} /></label><label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">HTTPS URI<input className={inputClass} disabled={disabled} value={asset.uri} onChange={(event) => update(index, { uri: event.target.value })} placeholder="https://cdn.example.com/banner.webp" /></label><label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Kind<select className={inputClass} disabled={disabled} value={asset.kind} onChange={(event) => update(index, { kind: event.target.value as ExperienceAsset['kind'] })}><option value="image">Image</option><option value="animation">Animation</option><option value="icon">Icon</option><option value="video">Video</option></select></label><label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">SHA-256<input className={inputClass} disabled={disabled} value={asset.checksum} onChange={(event) => update(index, { checksum: event.target.value })} placeholder="64 hex characters" /></label><button type="button" disabled={disabled} aria-label={`Remove ${asset.asset_id || 'asset'}`} onClick={() => onChange(value.filter((_, assetIndex) => assetIndex !== index))} className="mt-5 self-start rounded-lg p-2 text-zinc-600 transition hover:bg-red-500/10 hover:text-red-300 disabled:opacity-50"><Trash2 size={16} /></button></div>)}</div>}
    </section>
  )
}
