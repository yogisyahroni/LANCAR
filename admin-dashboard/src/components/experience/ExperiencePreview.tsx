import { CheckCircle2, ExternalLink, Image as ImageIcon, Smartphone, Globe2, Truck, Store, XCircle, Monitor, Moon, Sun, Search, CreditCard, type LucideIcon } from 'lucide-react'
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
        <div><p className="text-xs font-black uppercase tracking-wide text-primary-light">Safe schema preview</p><h2 id="experience-preview-title" className="mt-1 text-lg font-black text-foreground-muted">{surfaceLabel[surface]} surface</h2></div>
        <div className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface-subtle px-3 py-2 text-xs font-bold text-foreground-muted"><SurfaceIcon size={15} aria-hidden="true" /> Native surface contract</div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2" role="group" aria-label="Experience preview theme">
        <span className="text-xs font-black uppercase tracking-wide text-foreground-muted">Theme preview</span>
        {([['light', Sun], ['dark', Moon], ['system', Monitor]] as const).map(([mode, Icon]) => (
          <button
            type="button"
            key={mode}
            onClick={() => setPreviewMode(mode)}
            aria-pressed={previewMode === mode}
            className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-black uppercase tracking-wide ${previewMode === mode ? 'border-primary bg-primary text-on-primary' : 'border-border text-foreground-secondary hover:bg-surface-subtle hover:text-foreground'}`}
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
          const isHero = section.component === 'hero_banner'
          const customBg = text(properties, 'background_color') || (isHero ? '#006C47' : undefined)
          const bgAsset = text(properties, 'background_image_asset_id')

          if (isHero) {
            const bgImageUrl = text(properties, 'background_image_url')
            const resolvedBgImage = bgImageUrl
              ? bgImageUrl.replace(/^\/uploads\//, 'http://localhost:8080/uploads/')
              : null

            return (
              <article
                key={section.id}
                className="overflow-hidden rounded-2xl border border-white/10 shadow-xl"
                style={{ position: 'relative', minHeight: 220 }}
                data-media-composition="hero-theme"
              >
                {/* === Full-bleed Background === */}
                <div
                  className="absolute inset-0"
                  style={
                    resolvedBgImage
                      ? { backgroundImage: `url(${resolvedBgImage})`, backgroundSize: 'cover', backgroundPosition: 'top center' }
                      : { background: customBg ? `linear-gradient(180deg, ${customBg} 0%, rgba(0,0,0,0.75) 100%)` : '#006C47' }
                  }
                />

                {/* === Floating Search Bar (top — bebas, sengaja tidak diberi danger zone) === */}
                <div className="relative z-10 mx-3 mt-3 flex items-center gap-2 rounded-full bg-white/90 backdrop-blur px-3 py-1.5 shadow-sm">
                  <Search aria-hidden="true" className="w-3.5 h-3.5 text-gray-400" />
                  <span className="text-[11px] text-gray-400 font-medium flex-1">Cari layanan, makanan, paket…</span>
                  <span className="text-[10px] font-black text-emerald-700 bg-emerald-100 rounded-full px-1.5 py-0.5">LANCAR</span>
                </div>

                {/* === Hero Content area — safe zone === */}
                <div className="relative z-10 px-4 pt-2 pb-0" style={{ minHeight: 80 }}>
                  {text(properties, 'badge') ? (
                    <span className="inline-block rounded-full bg-white/20 backdrop-blur px-2.5 py-0.5 text-[10px] font-bold text-white border border-white/20 mb-1">
                      {text(properties, 'badge')}
                    </span>
                  ) : null}
                  {text(properties, 'title') ? (
                    <h3 className="text-sm font-black text-white leading-tight drop-shadow">{text(properties, 'title')}</h3>
                  ) : null}
                  {text(properties, 'cta_label') ? (
                    <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-[#D4F73C] px-3 py-1 text-[10px] font-black text-slate-900 shadow">
                      {text(properties, 'cta_label')} →
                    </span>
                  ) : null}
                </div>

                {/* === Bottom Danger Zone strip (sebelum card) === */}
                <div
                  className="relative z-10 mx-0 mt-2"
                  style={{
                    height: 18,
                    background: 'repeating-linear-gradient(135deg, rgba(239,68,68,0.45) 0px, rgba(239,68,68,0.45) 6px, rgba(0,0,0,0.35) 6px, rgba(0,0,0,0.35) 12px)',
                    borderTop: '1.5px dashed rgba(239,68,68,0.8)',
                  }}
                >
                  <span className="absolute inset-0 flex items-center justify-center text-[8px] font-black text-white drop-shadow">
                    Area Tertutup Card Saldo (Bottom Danger Zone)
                  </span>
                </div>

                {/* === Floating WalletCard mockup === */}
                <div className="relative z-20 mx-3 mb-3 rounded-2xl bg-white shadow-xl border border-gray-100 overflow-hidden">
                  <div className="flex items-center gap-3 px-4 py-3">
                    <div className="w-9 h-9 rounded-xl bg-green-100 flex items-center justify-center shrink-0">
                      <CreditCard aria-hidden="true" className="w-4.5 h-4.5 text-green-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] text-gray-500 font-semibold">Saldo siap dipakai</p>
                      <p className="text-[15px] font-black text-gray-900 leading-tight">Rp50.000</p>
                      <p className="text-[9px] text-gray-400">183 coins reward</p>
                    </div>
                    <div className="shrink-0 flex flex-col items-end gap-1">
                      <button className="rounded-full bg-green-600 px-2.5 py-1 text-[9px] font-black text-white">+ Topup</button>
                      <button className="rounded-full border border-gray-200 px-2 py-0.5 text-[9px] font-bold text-gray-600">Tarik</button>
                    </div>
                  </div>
                </div>

                {/* Label pojok */}
                <div className="absolute top-1 right-1 z-30">
                  <span className="rounded-md bg-black/50 backdrop-blur px-1.5 py-0.5 text-[8px] font-black text-white/80">
                    Simulasi Device
                  </span>
                </div>
              </article>
            )
          }

          return (
            <article key={section.id} className="overflow-hidden rounded-2xl border border-border bg-surface/[0.04]" data-media-composition="separate-content">
              {image ? <div className="flex items-center gap-2 border-b border-border bg-primary/10 px-4 py-3 text-xs text-primary-light"><ImageIcon size={15} aria-hidden="true" /> Asset slot: {image}</div> : null}
              <div className="p-4">
                {section.component === 'campaign_intro' ? <div className="mb-3 rounded-xl border border-info bg-info-surface px-3 py-2 text-xs font-black uppercase tracking-wide text-info">Post-native-splash campaign intro · not the OS launch splash</div> : null}
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className="text-xs font-black uppercase tracking-wide text-foreground-muted">{section.component}</span>
                  {text(properties, 'badge') ? <span className="rounded-full bg-primary/15 px-2 py-1 text-xs font-black text-primary-light">{text(properties, 'badge')}</span> : null}
                </div>
                <h3 className="text-base font-black text-foreground-muted">{title}</h3>
                {body ? <p className="mt-2 text-sm leading-relaxed text-foreground-muted">{body}</p> : null}
                {cta ? <div className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-xs font-black text-on-primary">{cta}<ExternalLink size={13} aria-hidden="true" /></div> : null}
              </div>
            </article>
          )
        })}
      </div>
      <p className="mt-4 text-xs leading-relaxed text-foreground-muted">Preview uses the server-resolved allowlisted component schema. It never executes remote code or records campaign exposure, and transaction screens remain native-owned.</p>
    </section>
  )
}
