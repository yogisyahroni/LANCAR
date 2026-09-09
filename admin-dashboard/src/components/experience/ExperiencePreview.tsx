import { CheckCircle2, ExternalLink, Image as ImageIcon, Smartphone, Globe2, XCircle } from 'lucide-react'
import type { ExperienceSection } from './types'

type Props = {
  surface: 'customer_android' | 'customer_web'
  sections: ExperienceSection[]
  simulation?: { matched?: boolean; reason?: string; selected_manifest?: { revision?: number } | null }
}

const text = (properties: Record<string, unknown>, key: string) => typeof properties[key] === 'string' ? properties[key] as string : ''

export default function ExperiencePreview({ surface, sections, simulation }: Props) {
  return (
    <section className="rounded-3xl border border-white/10 bg-zinc-950/70 p-5 shadow-2xl shadow-black/20" aria-labelledby="experience-preview-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div><p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary-light">Safe schema preview</p><h2 id="experience-preview-title" className="mt-1 text-lg font-black text-zinc-100">{surface === 'customer_android' ? 'Customer Android' : 'Customer Web'} surface</h2></div>
        <div className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-zinc-400">{surface === 'customer_android' ? <Smartphone size={15} /> : <Globe2 size={15} />} Native surface contract</div>
      </div>
      {simulation ? <div className={`mt-4 flex items-start gap-2 rounded-xl border p-3 text-xs ${simulation.matched ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-200' : 'border-amber-500/20 bg-amber-500/10 text-amber-200'}`}>{simulation.matched ? <CheckCircle2 size={16} className="mt-0.5 shrink-0" /> : <XCircle size={16} className="mt-0.5 shrink-0" />}<span>Audience simulation: <strong>{simulation.matched ? 'matched' : simulation.reason || 'not matched'}</strong>{simulation.selected_manifest?.revision ? ` · revision ${simulation.selected_manifest.revision}` : ''}</span></div> : null}
      <div className="mt-5 space-y-3 rounded-2xl bg-zinc-900 p-4">
        {sections.length === 0 ? <p className="p-8 text-center text-sm text-zinc-600">Add an approved component to preview it.</p> : sections.map((section) => {
          const properties = section.properties
          const title = text(properties, 'title') || section.component.replaceAll('_', ' ')
          const body = text(properties, 'body')
          const cta = text(properties, 'cta_label')
          const image = text(properties, 'image_asset_id') || text(properties, 'media_asset_id')
          return <article key={section.id} className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04]">
            {image ? <div className="flex items-center gap-2 border-b border-white/10 bg-primary/10 px-4 py-3 text-xs text-primary-light"><ImageIcon size={15} /> Asset slot: {image}</div> : null}
            <div className="p-4"><div className="mb-2 flex items-center justify-between gap-3"><span className="text-[10px] font-black uppercase tracking-widest text-zinc-600">{section.component}</span>{text(properties, 'badge') ? <span className="rounded-full bg-primary/15 px-2 py-1 text-[10px] font-black text-primary-light">{text(properties, 'badge')}</span> : null}</div><h3 className="text-base font-black text-zinc-100">{title}</h3>{body ? <p className="mt-2 text-sm leading-relaxed text-zinc-400">{body}</p> : null}{cta ? <div className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-xs font-black text-white">{cta}<ExternalLink size={13} /></div> : null}</div>
          </article>
        })}
      </div>
      <p className="mt-4 text-[11px] leading-relaxed text-zinc-600">Preview uses the same allowlisted component schema as the apps. It never executes remote code, and transaction screens remain native-owned.</p>
    </section>
  )
}
