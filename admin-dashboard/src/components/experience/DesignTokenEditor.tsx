import { LockKeyhole, ShieldCheck } from 'lucide-react'

export type DesignTokenKey = 'accent_preset' | 'background_preset' | 'corner_preset' | 'spacing_preset' | 'badge_preset'

export type DesignTokenValues = Record<DesignTokenKey, string>

type TokenDefinition = {
  key: DesignTokenKey
  label: string
  description: string
  options: readonly string[]
  labels: Record<string, string>
}

export const DEFAULT_DESIGN_TOKENS: DesignTokenValues = {
  accent_preset: 'brand',
  background_preset: 'surface',
  corner_preset: 'standard',
  spacing_preset: 'standard',
  badge_preset: 'pill',
}

export const DESIGN_TOKEN_DEFINITIONS: readonly TokenDefinition[] = [
  {
    key: 'accent_preset',
    label: 'Campaign accent',
    description: 'Predefined campaign emphasis color; no arbitrary hex value.',
    options: ['brand', 'campaign_orange', 'campaign_blue'],
    labels: { brand: 'Brand', campaign_orange: 'Campaign orange', campaign_blue: 'Campaign blue' },
  },
  {
    key: 'background_preset',
    label: 'Campaign background',
    description: 'Bounded surface palette for campaign presentation only.',
    options: ['surface', 'brand_soft', 'accent_soft'],
    labels: { surface: 'Surface', brand_soft: 'Brand soft', accent_soft: 'Accent soft' },
  },
  {
    key: 'corner_preset',
    label: 'Corner shape',
    description: 'Packaged corner geometry; transaction screens stay unchanged.',
    options: ['compact', 'standard', 'emphasized'],
    labels: { compact: 'Compact', standard: 'Standard', emphasized: 'Emphasized' },
  },
  {
    key: 'spacing_preset',
    label: 'Campaign spacing',
    description: 'Packaged spacing density for dynamic presentation content.',
    options: ['compact', 'standard', 'relaxed'],
    labels: { compact: 'Compact', standard: 'Standard', relaxed: 'Relaxed' },
  },
  {
    key: 'badge_preset',
    label: 'Badge style',
    description: 'Presentation-only badge treatment; no eligibility or pricing effect.',
    options: ['hidden', 'label', 'pill'],
    labels: { hidden: 'Hidden', label: 'Label', pill: 'Pill' },
  },
]

const TOKEN_PALETTE = {
  accent: {
    brand: { light: '#003A20', dark: '#1A7A4C', onLight: '#FFFFFF', onDark: '#F4F7F5' },
    campaign_orange: { light: '#F97316', dark: '#FB923C', onLight: '#1A0E00', onDark: '#0B120E' },
    campaign_blue: { light: '#2563EB', dark: '#60A5FA', onLight: '#FFFFFF', onDark: '#0B120E' },
  },
  background: {
    surface: { light: '#FFFFFF', dark: '#142019', onLight: '#14211A', onDark: '#F4F7F5' },
    brand_soft: { light: '#E8F5EE', dark: '#0D3322', onLight: '#14211A', onDark: '#F4F7F5' },
    accent_soft: { light: '#FFF1E6', dark: '#3D2414', onLight: '#14211A', onDark: '#F4F7F5' },
  },
} as const

const relativeLuminance = (hex: string) => {
  const channels = [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255)
  const linear = channels.map((channel) => channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
  return (0.2126 * linear[0]) + (0.7152 * linear[1]) + (0.0722 * linear[2])
}

const contrastRatio = (foreground: string, background: string) => {
  const light = Math.max(relativeLuminance(foreground), relativeLuminance(background))
  const dark = Math.min(relativeLuminance(foreground), relativeLuminance(background))
  return (light + 0.05) / (dark + 0.05)
}

export const validateDesignTokens = (tokens: DesignTokenValues) => {
  const accent = TOKEN_PALETTE.accent[tokens.accent_preset as keyof typeof TOKEN_PALETTE.accent]
  const background = TOKEN_PALETTE.background[tokens.background_preset as keyof typeof TOKEN_PALETTE.background]
  const checks = [
    { id: 'accent-light', label: 'Accent light', ratio: contrastRatio(accent.onLight, accent.light) },
    { id: 'accent-dark', label: 'Accent dark', ratio: contrastRatio(accent.onDark, accent.dark) },
    { id: 'background-light', label: 'Background light', ratio: contrastRatio(background.onLight, background.light) },
    { id: 'background-dark', label: 'Background dark', ratio: contrastRatio(background.onDark, background.dark) },
  ].map((check) => ({ ...check, pass: check.ratio >= 4.5 }))
  return {
    pass: checks.every((check) => check.pass),
    checks,
    preview: {
      light: { background: background.light, text: background.onLight, accent: accent.light, accentText: accent.onLight },
      dark: { background: background.dark, text: background.onDark, accent: accent.dark, accentText: accent.onDark },
    },
  }
}

export const normalizeDesignTokens = (properties: Record<string, unknown> | undefined): DesignTokenValues => {
  const source = properties ?? {}
  return DESIGN_TOKEN_DEFINITIONS.reduce((tokens, definition) => {
    const value = typeof source[definition.key] === 'string' && definition.options.includes(source[definition.key] as string)
      ? source[definition.key] as string
      : DEFAULT_DESIGN_TOKENS[definition.key]
    tokens[definition.key] = value
    return tokens
  }, { ...DEFAULT_DESIGN_TOKENS })
}

const inputClass = 'mt-2 w-full rounded-xl border border-border bg-surface-subtle px-3 py-2.5 text-sm font-bold text-foreground-muted disabled:cursor-not-allowed disabled:opacity-60'

type Props = {
  value: DesignTokenValues
  disabled?: boolean
  onChange: (key: DesignTokenKey, value: string) => void
}

export default function DesignTokenEditor({ value, disabled = false, onChange }: Props) {
  return (
    <section className="rounded-3xl border border-border bg-surface/[0.03] p-5" aria-labelledby="design-token-editor-title">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-primary/10 p-2 text-primary-light"><ShieldCheck size={18} aria-hidden="true" /></div>
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-primary-light">Bounded runtime theme</p>
          <h2 id="design-token-editor-title" className="mt-1 text-lg font-black text-foreground-muted">Campaign presentation tokens</h2>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-foreground-muted">Only registered enum presets can be selected. The editor never accepts CSS, Kotlin, JavaScript, fonts or arbitrary color values.</p>
        </div>
      </div>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        {DESIGN_TOKEN_DEFINITIONS.map((definition) => (
          <label key={definition.key} className="rounded-2xl border border-border bg-surface-subtle p-4 text-xs font-black text-foreground-muted">
            <span>{definition.label}</span>
            <select
              className={inputClass}
              disabled={disabled}
              value={value[definition.key]}
              onChange={(event) => onChange(definition.key, event.target.value)}
            >
              {definition.options.map((option) => <option key={option} value={option}>{definition.labels[option]}</option>)}
            </select>
            <span className="mt-2 block text-xs font-normal leading-relaxed text-foreground-muted">{definition.description}</span>
          </label>
        ))}
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-2">
        {[
          ['Core brand and safety palette', 'Packaged defaults remain authoritative; campaign presets cannot replace the core brand system.'],
          ['Transaction screens', 'Booking, payment, order and tracking screens keep the packaged theme and are not remotely re-themed.'],
          ['Remote code and fonts', 'CSS/Kotlin/JavaScript instructions, arbitrary WebView content and font binaries are rejected.'],
          ['Marketing override boundary', 'Marketing operators can choose only the five bounded presets above; locked controls are server-enforced.'],
        ].map(([title, description]) => (
          <div key={title} className="flex gap-3 rounded-2xl border border-warning bg-warning/[0.06] p-4">
            <LockKeyhole size={16} className="mt-0.5 shrink-0 text-warning" aria-hidden="true" />
            <div><p className="text-xs font-black text-warning">{title}</p><p className="mt-1 text-xs leading-relaxed text-warning">{description}</p></div>
          </div>
        ))}
      </div>
    </section>
  )
}
