import type { ExperienceTargeting } from './types'
import { StatusBadge } from '../StatusBadge'

type Props = {
  value: ExperienceTargeting
  onChange: (value: ExperienceTargeting) => void
  disabled?: boolean
}

const fieldClass = 'mt-1 w-full rounded-xl border border-border bg-surface-subtle px-3 py-2.5 text-sm text-foreground-muted outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/20 disabled:opacity-60'

const csv = (value: string[]) => value.join(', ')
const parseCsv = (value: string) => value.split(',').map((item) => item.trim().toLowerCase()).filter(Boolean)

export default function TargetingEditor({ value, onChange, disabled = false }: Props) {
  const setList = (key: keyof ExperienceTargeting, input: string) => onChange({ ...value, [key]: parseCsv(input) })

  return (
    <section className="rounded-2xl border border-border bg-surface-subtle p-5" aria-labelledby="audience-targeting-title">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 id="audience-targeting-title" className="text-sm font-black uppercase tracking-wider text-foreground-muted">Audience targeting</h3>
          <p className="mt-1 text-xs text-foreground-muted">Server resolves these dimensions. Sensitive personal attributes are not available.</p>
        </div>
        <StatusBadge status="protected" labelPrefix="Audience targeting schema" label="Governed schema" className="border-success bg-success-surface text-success" />
      </div>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <label className="text-xs font-bold text-foreground-muted">City codes<input className={fieldClass} disabled={disabled} value={csv(value.city_codes)} onChange={(event) => setList('city_codes', event.target.value)} placeholder="jakarta-selatan, bandung" /></label>
        <label className="text-xs font-bold text-foreground-muted">Zone codes<input className={fieldClass} disabled={disabled} value={csv(value.zone_codes)} onChange={(event) => setList('zone_codes', event.target.value)} placeholder="zone-south" /></label>
        <label className="text-xs font-bold text-foreground-muted">Locales<input className={fieldClass} disabled={disabled} value={csv(value.locales)} onChange={(event) => setList('locales', event.target.value)} placeholder="id-ID, en-US" /></label>
        <label className="text-xs font-bold text-foreground-muted">Service-usage cohorts<input className={fieldClass} disabled={disabled} value={csv(value.service_usage_cohorts)} onChange={(event) => setList('service_usage_cohorts', event.target.value)} placeholder="food-repeat" /></label>
        <label className="text-xs font-bold text-foreground-muted">Experiment cohorts<input className={fieldClass} disabled={disabled} value={csv(value.cohorts)} onChange={(event) => setList('cohorts', event.target.value)} placeholder="internal-test, beta" /></label>
        <label className="text-xs font-bold text-foreground-muted">Experiment assignments<input className={fieldClass} disabled={disabled} value={csv(value.experiment_assignments)} onChange={(event) => setList('experiment_assignments', event.target.value)} placeholder="treatment-a" /></label>
        <label className="text-xs font-bold text-foreground-muted">Experiment reference<input className={fieldClass} disabled={disabled} value={value.experiment_ref ?? ''} onChange={(event) => onChange({ ...value, experiment_ref: event.target.value.trim().toLowerCase() || null })} placeholder="food-home-v2" /></label>
        <label className="text-xs font-bold text-foreground-muted">User status<select className={fieldClass} disabled={disabled} value={value.user_status ?? ''} onChange={(event) => onChange({ ...value, user_status: (event.target.value || null) as ExperienceTargeting['user_status'] })}><option value="">All users</option><option value="new">New users</option><option value="existing">Existing users</option></select></label>
      </div>
      <fieldset className="mt-4">
        <legend className="text-xs font-bold text-foreground-muted">Roles</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {(['customer', 'merchant', 'courier'] as const).map((role) => {
            const checked = value.roles.includes(role)
            return <label key={role} className={`inline-flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold transition ${checked ? 'border-primary/50 bg-primary/15 text-primary-light' : 'border-border bg-surface-subtle text-foreground-secondary'}`}><input className="sr-only" type="checkbox" disabled={disabled} checked={checked} onChange={() => onChange({ ...value, roles: checked ? value.roles.filter((item) => item !== role) : [...value.roles, role] })} />{role}</label>
          })}
        </div>
      </fieldset>
    </section>
  )
}
