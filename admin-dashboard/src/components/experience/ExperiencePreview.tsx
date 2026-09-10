import { CheckCircle2, ExternalLink, Image as ImageIcon, Smartphone, Globe2, Truck, Store, XCircle, Monitor, Moon, Sun, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { useTheme } from '../../providers/ThemeProvider'
import type { ExperienceSection, ExperienceSurface } from './types'

type Props = {
  surface: ExperienceSurface
  sections: ExperienceSection[]
  resolvedSections?: ExperienceSection[]
  simulation?: { matched?: boolean; reason?: string; selected_manifest?: { revision?: number } | null }
}

const surfaceLabel: Record<ExperienceSurface, string> = {
  customer_android: 'Customer Android',
  customer_web: 'Customer Web',
  merchant_android: 'Merchant Android',
  courier_android: 'Courier Android',
}

const surfaceIcon: Record<ExperienceSurface, LucideIcon> = {
  customer_android: Smartphone,
  customer_web: Globe2,
  merchant_android: Store,
  courier_android: Truck,
}

const text = (properties: Record<string, unknown>, key: string) => typeof properties[key] === 'string' ? properties[key] as string : ''

export default function ExperiencePreview({ surface, sections, resolvedSections, simulation }: Props) {
  const { resolvedTheme } = useTheme()
  const [previewMode, setPreviewMode] = useState<'light' | 'dark' | 'system'>('system')
  const effectivePreviewMode = previewMode === 'system' ? resolvedTheme : previewMode
  const SurfaceIcon = surfaceIcon[surface]
  const visibleSections = resolvedSections
    ? resolvedSections.filter((section) => section.enabled !== false)
    : sections.filter((section) => section.enabled !== false)
  return (
    <section className="rounded-3xl border border-border bg-surface-subtle p-5 shadow-2xl shadow-scrim" aria-labelledby="experience-preview-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div><p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary-light">Safe schema preview</p><h2 id="experience-preview-title" className="mt-1 text-lg font-black text-foreground-muted">{surfaceLabel[surface]} surface</h2></div>
        <div className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface-subtle px-3 py-2 text-xs font-bold text-foreground-muted"><SurfaceIcon size={15} aria-hidden="true" /> Native surface contract</div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2" role="group" aria-label="Experience preview theme">
        <span className="text-[10px] font-black uppercase tracking-widest text-foreground-muted">Theme preview</span>
        {([['light', Sun], ['dark', Moon], ['system', Monitor]] as const).map(([mode, Icon]) => (
          <button
            type="button"
            key={mode}
            onClick={() => setPreviewMode(mode)}
            aria-pressed={previewMode === mode}
            className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[10px] font-black uppercase tracking-widest ${previewMode === mode ? 'border-primary bg-primary text-on-primary' : 'border-border text-foreground-secondary hover:bg-surface-subtle hover:text-foreground'}`}
          >
            <Icon size={13} aria-hidden="true" /> {mode}
          </button>
        ))}
      </div>
      {simulation ? <div role={simulation.matched ? 'status' : 'alert'} aria-live={simulation.matched ? 'polite' : 'assertive'} className={`mt-4 flex items-start gap-2 rounded-xl border p-3 text-xs ${simulation.matched ? 'border-success bg-success-surface text-success' : 'border-warning bg-warning-surface text-warning'}`}>{simulation.matched ? <CheckCircle2 size={16} aria-hidden="true" className="mt-0.5 shrink-0" /> : <XCircle size={16} aria-hidden="true" className="mt-0.5 shrink-0" />}<span>Audience simulation: <strong>{simulation.matched ? 'matched' : simulation.reason || 'not matched'}</strong>{simulation.selected_manifest?.revision ? ` · revision ${simulation.selected_manifest.revision}` : ''}</span></div> : null}
      <div className={`theme-preview-${effectivePreviewMode} mt-5 space-y-3 rounded-2xl bg-background p-4`} data-preview-theme={effectivePreviewMode}>
        {visibleSections.length === 0 ? <p className="p-8 text-center text-sm text-foreground-muted">Add an enabled approved component to preview it.</p> : visibleSections.map((section) => {
          const properties = section.properties
          const title = text(properties, 'title') || section.component.replaceAll('_', ' ')
          const body = text(properties, 'body')
          const cta = text(properties, 'cta_label')
          const image = text(properties, 'image_asset_id') || text(properties, 'media_asset_id')
          return <article key={section.id} className="overflow-hidden rounded-2xl border border-border bg-surface/[0.04]">
            {image ? <div className="flex items-center gap-2 border-b border-border bg-primary/10 px-4 py-3 text-xs text-primary-light"><ImageIcon size={15} aria-hidden="true" /> Asset slot: {image}</div> : null}
            <div className="p-4">{section.component === 'campaign_intro' ? <div className="mb-3 rounded-xl border border-info bg-info-surface px-3 py-2 text-[10px] font-black uppercase tracking-wider text-info">Post-native-splash campaign intro · not the OS launch splash</div> : null}<div className="mb-2 flex items-center justify-between gap-3"><span className="text-[10px] font-black uppercase tracking-widest text-foreground-muted">{section.component}</span>{text(properties, 'badge') ? <span className="rounded-full bg-primary/15 px-2 py-1 text-[10px] font-black text-primary-light">{text(properties, 'badge')}</span> : null}</div><h3 className="text-base font-black text-foreground-muted">{title}</h3>{body ? <p className="mt-2 text-sm leading-relaxed text-foreground-muted">{body}</p> : null}{cta ? <div className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-xs font-black text-on-primary">{cta}<ExternalLink size={13} aria-hidden="true" /></div> : null}</div>
          </article>
        })}
      </div>
      <p className="mt-4 text-[11px] leading-relaxed text-foreground-muted">Preview uses the server-resolved allowlisted component schema. It never executes remote code or records campaign exposure, and transaction screens remain native-owned.</p>
    </section>
  )
}
