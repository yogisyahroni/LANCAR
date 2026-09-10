import { Link2, ShieldCheck } from 'lucide-react'
import type { DeepLinkRoute } from './deepLinkTypes'

const inputClass = 'mt-1 w-full rounded-xl border border-border bg-surface-subtle px-3 py-2.5 text-sm text-foreground-muted outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/20'

type Props = {
  routes: DeepLinkRoute[]
  routeId: string
  params: Record<string, string>
  onRouteChange: (routeId: string) => void
  onParamsChange: (params: Record<string, string>) => void
}

export default function DeepLinkPicker({ routes, routeId, params, onRouteChange, onParamsChange }: Props) {
  const route = routes.find((candidate) => candidate.route_id === routeId) ?? null
  return <section className="rounded-3xl border border-border bg-surface/[0.03] p-5" aria-labelledby="deep-link-picker-title"><div className="flex items-start gap-3"><div className="rounded-xl bg-primary/10 p-2 text-primary-light"><Link2 size={18} aria-hidden="true" /></div><div><h2 id="deep-link-picker-title" className="text-base font-black text-foreground-muted">Registered destination</h2><p className="mt-1 text-xs leading-relaxed text-foreground-muted">Choose a typed route from the server registry. Raw code targets and unregistered schemes are unavailable.</p></div></div><label className="mt-4 block text-xs font-bold text-foreground-muted">Route<select className={inputClass} value={routeId} onChange={(event) => onRouteChange(event.target.value)}><option value="">Select a registered route</option>{routes.map((candidate) => <option key={candidate.route_id} value={candidate.route_id} disabled={candidate.status === 'deprecated'}>{candidate.label}{candidate.status === 'deprecated' ? ' · deprecated' : ''}</option>)}</select></label>{route ? <div className="mt-4 rounded-2xl border border-info bg-info/[0.06] p-4"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-mono text-xs text-info">{route.template}</p><span className="rounded-full border border-info px-2.5 py-1 text-xs font-bold tracking-wide text-info" aria-label={`Compatibility: minimum app ${route.min_app_version}, schema ${route.min_schema_version}`}>Minimum app {route.min_app_version} · schema {route.min_schema_version}</span></div><p className="mt-2 text-xs text-info">{route.description}</p><p className="mt-2 text-xs font-bold tracking-wide text-info">Fallback: {routes.find((candidate) => candidate.route_id === route.fallback_route_id)?.label ?? route.fallback_route_id}</p></div> : null}{route?.parameters.length ? <div className="mt-4 grid gap-3 sm:grid-cols-2">{route.parameters.map((parameter) => <label key={parameter.name} className="text-xs font-bold text-foreground-muted">{parameter.label}{parameter.required ? ' *' : ''}<input className={inputClass} value={params[parameter.name] || ''} onChange={(event) => onParamsChange({ ...params, [parameter.name]: event.target.value })} placeholder={parameter.example} /><span className="mt-1 block text-xs font-normal text-foreground-muted">{parameter.pattern} · example {parameter.example}</span></label>)}</div> : null}<p className="mt-4 flex items-center gap-2 text-xs text-foreground-muted"><ShieldCheck size={14} className="text-success" aria-hidden="true" /> Required parameters are validated by the server before a campaign draft can use the route.</p></section>
}
