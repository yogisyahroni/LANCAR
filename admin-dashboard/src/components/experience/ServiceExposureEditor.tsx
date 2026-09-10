import { ArrowDown, ArrowUp, Eye, EyeOff, Plus, Trash2 } from 'lucide-react'
import type { ServiceExposureEntry } from './types'

const inputClass = 'mt-1 w-full rounded-xl border border-border bg-surface-subtle px-3 py-2.5 text-sm text-foreground-muted outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/20 disabled:opacity-60'

type Props = {
  entries: ServiceExposureEntry[]
  disabled?: boolean
  onChange: (entries: ServiceExposureEntry[]) => void
}

const normalize = (entry: Partial<ServiceExposureEntry>, position: number): ServiceExposureEntry => ({
  service_code: String(entry.service_code || '').trim().toLowerCase(),
  service_category: String(entry.service_category || '').trim().toLowerCase() || undefined,
  enabled: entry.enabled !== false,
  position,
  label: String(entry.label || '').trim() || undefined,
  subtitle: String(entry.subtitle || '').trim() || undefined,
  badge: String(entry.badge || '').trim() || undefined,
  fallback_behavior: entry.fallback_behavior || 'hide_entry',
})

const resequence = (entries: ServiceExposureEntry[]) => entries.map((entry, index) => normalize(entry, index))

export default function ServiceExposureEditor({ entries, disabled = false, onChange }: Props) {
  const update = (index: number, patch: Partial<ServiceExposureEntry>) => {
    onChange(resequence(entries.map((entry, entryIndex) => entryIndex === index ? normalize({ ...entry, ...patch }, entryIndex) : entry)))
  }
  const move = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction
    if (nextIndex < 0 || nextIndex >= entries.length) return
    const next = [...entries]
    const [item] = next.splice(index, 1)
    next.splice(nextIndex, 0, item)
    onChange(resequence(next))
  }

  return (
    <div className="md:col-span-2 rounded-2xl border border-primary/20 bg-primary/5 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-wider text-primary-light">Service exposure entries</p>
          <p className="mt-1 text-xs leading-relaxed text-foreground-muted">Urutan dan copy hanya mengatur discovery. Ketersediaan transaksi tetap diambil dari service catalog/market control plane.</p>
        </div>
        <button
          type="button"
          disabled={disabled || entries.length >= 20}
          onClick={() => onChange(resequence([...entries, normalize({ service_code: '', enabled: true, fallback_behavior: 'hide_entry' }, entries.length)]))}
          className="inline-flex items-center gap-1 rounded-lg border border-primary/30 px-2.5 py-1.5 text-xs font-bold tracking-wide text-primary-light disabled:opacity-60"
        >
          <Plus size={12} aria-hidden="true" /> Add service
        </button>
      </div>
      <div className="mt-4 space-y-3">
        {entries.map((entry, index) => (
          <div key={`${entry.service_code}-${index}`} className="rounded-xl border border-border bg-surface-subtle p-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-bold tracking-wide text-foreground-muted">Position {index + 1}</span>
              <div className="flex items-center gap-1">
                <button type="button" disabled={disabled || index === 0} onClick={() => move(index, -1)} className="rounded-lg p-1.5 text-foreground-muted hover:bg-surface-subtle disabled:opacity-60" aria-label={`Move ${entry.service_code || 'service'} up`} title={`Move ${entry.service_code || 'service'} up`}><ArrowUp size={14} aria-hidden="true" /></button>
                <button type="button" disabled={disabled || index === entries.length - 1} onClick={() => move(index, 1)} className="rounded-lg p-1.5 text-foreground-muted hover:bg-surface-subtle disabled:opacity-60" aria-label={`Move ${entry.service_code || 'service'} down`} title={`Move ${entry.service_code || 'service'} down`}><ArrowDown size={14} aria-hidden="true" /></button>
                <button type="button" disabled={disabled || entries.length <= 1} onClick={() => onChange(resequence(entries.filter((_, itemIndex) => itemIndex !== index)))} className="rounded-lg p-1.5 text-on-error hover:bg-error-surface hover:text-error disabled:opacity-60" aria-label={`Remove ${entry.service_code || 'service'}`} title={`Remove ${entry.service_code || 'service'}`}><Trash2 size={14} aria-hidden="true" /></button>
              </div>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              <label className="text-xs font-bold text-foreground-muted">Service ID / code<input className={inputClass} disabled={disabled} value={entry.service_code} onChange={(event) => update(index, { service_code: event.target.value })} placeholder="food_delivery" /></label>
              <label className="text-xs font-bold text-foreground-muted">Category<input className={inputClass} disabled={disabled} value={entry.service_category || ''} onChange={(event) => update(index, { service_category: event.target.value })} placeholder="food" /></label>
              <label className="flex items-end gap-2 text-xs font-bold text-foreground-muted"><input type="checkbox" disabled={disabled} checked={entry.enabled} onChange={(event) => update(index, { enabled: event.target.checked })} className="mb-3 h-4 w-4 accent-primary" />{entry.enabled ? <Eye size={14} className="mb-3 text-success" aria-hidden="true" /> : <EyeOff size={14} className="mb-3 text-warning" aria-hidden="true" />} {entry.enabled ? 'Discovery tampil' : 'Discovery disembunyikan'}</label>
              <label className="text-xs font-bold text-foreground-muted">Marketing label<input className={inputClass} disabled={disabled} value={entry.label || ''} onChange={(event) => update(index, { label: event.target.value })} placeholder="Food delivery" /></label>
              <label className="text-xs font-bold text-foreground-muted">Subtitle<input className={inputClass} disabled={disabled} value={entry.subtitle || ''} onChange={(event) => update(index, { subtitle: event.target.value })} placeholder="Pesan makanan" /></label>
              <label className="text-xs font-bold text-foreground-muted">Badge<input className={inputClass} disabled={disabled} value={entry.badge || ''} onChange={(event) => update(index, { badge: event.target.value })} placeholder="Baru" /></label>
              <label className="text-xs font-bold text-foreground-muted md:col-span-2 lg:col-span-3">Unavailable fallback<select className={inputClass} disabled={disabled} value={entry.fallback_behavior} onChange={(event) => update(index, { fallback_behavior: event.target.value as ServiceExposureEntry['fallback_behavior'] })}><option value="hide_entry">Hide entry</option><option value="show_authoritative_name">Show authoritative name</option><option value="show_unavailable_notice">Show unavailable notice</option></select></label>
            </div>
          </div>
        ))}
        {entries.length === 0 ? <p className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-foreground-muted">Add at least one service entry.</p> : null}
      </div>
    </div>
  )
}
