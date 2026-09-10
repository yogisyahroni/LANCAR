import { CheckCircle2, Monitor, Moon, Sun, XCircle, type LucideIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { validateDesignTokens, type DesignTokenValues } from './DesignTokenEditor'

export type PreviewMode = 'light' | 'dark' | 'system'

type Props = {
  tokens: DesignTokenValues
  mode: PreviewMode
  onModeChange: (mode: PreviewMode) => void
}

const modeLabels: Record<PreviewMode, string> = { light: 'Light', dark: 'Dark', system: 'System' }
const modeOptions: readonly [PreviewMode, LucideIcon][] = [['light', Sun], ['dark', Moon], ['system', Monitor]]

export default function ContrastPreview({ tokens, mode, onModeChange }: Props) {
  const [systemDark, setSystemDark] = useState(false)
  const validation = validateDesignTokens(tokens)
  const effectiveMode = mode === 'system' ? (systemDark ? 'dark' : 'light') : mode
  const preview = validation.preview[effectiveMode]

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const update = () => setSystemDark(media.matches)
    update()
    media.addEventListener?.('change', update)
    return () => media.removeEventListener?.('change', update)
  }, [])

  return (
    <section className="rounded-3xl border border-border bg-surface/[0.03] p-5" aria-labelledby="contrast-preview-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div><p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary-light">Accessibility gate</p><h2 id="contrast-preview-title" className="mt-1 text-lg font-black text-foreground-muted">Contrast and mode preview</h2><p className="mt-1 text-xs leading-relaxed text-foreground-muted">The same finite palette and WCAG AA check used by the manifest validator is shown before a draft can publish.</p></div>
        <div className="flex rounded-xl border border-border bg-surface-subtle p-1" role="group" aria-label="Preview color mode">
          {modeOptions.map(([key, Icon]) => <button type="button" key={key} onClick={() => onModeChange(key)} aria-pressed={mode === key} className={`inline-flex items-center gap-1 rounded-lg px-3 py-2 text-[10px] font-black uppercase tracking-widest ${mode === key ? 'bg-primary text-on-primary' : 'text-foreground-secondary hover:text-foreground'}`}><Icon size={13} aria-hidden="true" />{modeLabels[key]}</button>)}
        </div>
      </div>
      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="rounded-2xl border border-border p-5" style={{ backgroundColor: preview.background, color: preview.text }}>
          <div className="flex items-center justify-between gap-3"><span className="text-[10px] font-black uppercase tracking-widest opacity-70">{modeLabels[mode]} preview · {effectiveMode}</span><span className="rounded-full px-2 py-1 text-[10px] font-black" style={{ backgroundColor: preview.accent, color: preview.accentText }}>Badge</span></div>
          <div className="mt-5 rounded-2xl p-4" style={{ backgroundColor: preview.accent, color: preview.accentText }}><p className="text-sm font-black">Campaign card</p><p className="mt-1 text-xs opacity-90">Presentation tokens affect this campaign surface only.</p><button type="button" className="mt-4 rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-widest" style={{ backgroundColor: preview.background, color: preview.text }}>Safe CTA preview</button></div>
          <p className="mt-4 text-[11px] opacity-70">Transaction screens retain packaged theme values.</p>
        </div>
        <div className="space-y-2">
          {validation.checks.map((check) => <div key={check.id} className={`rounded-xl border p-3 ${check.pass ? 'border-success bg-success/[0.06]' : 'border-error bg-error/[0.06]'}`}><div className="flex items-center gap-2 text-xs font-black">{check.pass ? <CheckCircle2 size={14} aria-hidden="true" className="text-success" /> : <XCircle size={14} aria-hidden="true" className="text-error" />}<span className={check.pass ? 'text-success' : 'text-error'}>{check.label}</span></div><p className="mt-1 text-[11px] text-foreground-muted">{check.ratio.toFixed(2)}:1 · minimum 4.50:1</p></div>)}
          <p className={`rounded-xl border p-3 text-xs font-black ${validation.pass ? 'border-success bg-success/[0.06] text-success' : 'border-error bg-error/[0.06] text-error'}`}>{validation.pass ? 'Ready for publish validation' : 'Publish blocked until contrast is safe'}</p>
        </div>
      </div>
    </section>
  )
}
