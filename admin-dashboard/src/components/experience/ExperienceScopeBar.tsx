import type { ExperienceSurface } from './types'

export type ExperienceScope = {
  marketCode: string
  surface: ExperienceSurface
  locale: string
  appVersion: string
}

type Props = {
  value: ExperienceScope
  onChange?: (value: ExperienceScope) => void
  readOnly?: boolean
}

const surfaceLabels: Record<ExperienceSurface, string> = {
  customer_android: 'Indonesia Customer Android',
  customer_web: 'Customer Web',
  merchant_android: 'Merchant Android',
  courier_android: 'Courier Android',
}

export default function ExperienceScopeBar({ value, onChange, readOnly = false }: Props) {
  const update = (patch: Partial<ExperienceScope>) => onChange?.({ ...value, ...patch })

  return (
    <section
      aria-label="Active App Experience market and surface context"
      className="rounded-2xl border border-primary/25 bg-primary-soft p-4 shadow-lg shadow-primary/5"
    >
      <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-primary-light">Active control-plane context</p>
          <p className="mt-1 text-xs leading-relaxed text-foreground-muted">
            Semua perubahan Experience berlaku pada scope yang terlihat di bawah; transaction truth tetap berada di service pemiliknya.
          </p>
        </div>
        <div className="grid w-full gap-3 sm:grid-cols-2 xl:w-auto xl:grid-cols-4">
          <label className="text-xs font-bold tracking-wide text-foreground-muted">
            Market / country
            <input
              value={value.marketCode}
              onChange={(event) => update({ marketCode: event.target.value })}
              disabled={readOnly}
              className="mt-1 w-full min-w-32 rounded-xl border border-border bg-surface-subtle px-3 py-2 text-xs font-bold normal-case tracking-normal text-foreground-muted disabled:opacity-60"
            />
          </label>
          <label className="text-xs font-bold tracking-wide text-foreground-muted">
            Surface
            <select
              value={value.surface}
              onChange={(event) => update({ surface: event.target.value as ExperienceSurface })}
              disabled={readOnly}
              className="mt-1 w-full min-w-48 rounded-xl border border-border bg-surface-subtle px-3 py-2 text-xs font-bold normal-case tracking-normal text-foreground-muted disabled:opacity-60"
            >
              {Object.entries(surfaceLabels).map(([surface, label]) => (
                <option key={surface} value={surface}>{label}</option>
              ))}
            </select>
          </label>
          <label className="text-xs font-bold tracking-wide text-foreground-muted">
            Locale
            <input
              value={value.locale}
              onChange={(event) => update({ locale: event.target.value })}
              disabled={readOnly}
              className="mt-1 w-full min-w-28 rounded-xl border border-border bg-surface-subtle px-3 py-2 text-xs font-bold normal-case tracking-normal text-foreground-muted disabled:opacity-60"
            />
          </label>
          <label className="text-xs font-bold tracking-wide text-foreground-muted">
            App version
            <input
              value={value.appVersion}
              onChange={(event) => update({ appVersion: event.target.value })}
              disabled={readOnly}
              className="mt-1 w-full min-w-28 rounded-xl border border-border bg-surface-subtle px-3 py-2 text-xs font-bold normal-case tracking-normal text-foreground-muted disabled:opacity-60"
            />
          </label>
        </div>
      </div>
      <p className="mt-3 text-xs font-bold text-primary-light">
        Viewing: {value.marketCode || 'market belum dipilih'} · {surfaceLabels[value.surface]} · {value.locale || 'locale belum dipilih'} · v{value.appVersion || '—'}
      </p>
    </section>
  )
}
