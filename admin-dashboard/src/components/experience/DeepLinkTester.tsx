import { useState } from 'react'
import { AlertTriangle, CheckCircle2, FlaskConical } from 'lucide-react'
import type { DeepLinkRoute } from './deepLinkTypes'
import type { ExperienceSurface } from './types'

type Result = { deep_link: string; route: DeepLinkRoute; compatible: boolean; reason: string; fallback: DeepLinkRoute | null }
type Props = { route: DeepLinkRoute | null; routes: DeepLinkRoute[]; surface: ExperienceSurface; appVersion: string; schemaVersion: number; onTest: () => Promise<{ deep_link: string; route: DeepLinkRoute }> }

const versionParts = (value: string) => value.split(/[.+-]/, 1)[0].split('.').map((part) => Number(part) || 0)
const versionAtLeast = (actual: string, minimum: string) => {
  const left = versionParts(actual)
  const right = versionParts(minimum)
  for (const index of [0, 1, 2]) {
    if ((left[index] || 0) > (right[index] || 0)) return true
    if ((left[index] || 0) < (right[index] || 0)) return false
  }
  return true
}

export default function DeepLinkTester({ route, routes, surface, appVersion, schemaVersion, onTest }: Props) {
  const [result, setResult] = useState<Result | null>(null)
  async function run() {
    if (!route) return
    const compatible = route.status === 'active' && route.supported_surfaces.includes(surface) && versionAtLeast(appVersion, route.min_app_version) && schemaVersion >= route.min_schema_version
    const reason = route.status !== 'active' ? 'Route is deprecated' : !route.supported_surfaces.includes(surface) ? `Surface ${surface} is not supported` : !versionAtLeast(appVersion, route.min_app_version) ? `App version ${appVersion} is below ${route.min_app_version}` : schemaVersion < route.min_schema_version ? `Schema version ${schemaVersion} is below ${route.min_schema_version}` : 'Destination is supported'
    try {
      const validated = await onTest()
      setResult({ ...validated, compatible, reason, fallback: routes.find((candidate) => candidate.route_id === route.fallback_route_id) ?? null })
    } catch {
      setResult({ deep_link: '', route, compatible: false, reason: 'Server rejected the required route parameters', fallback: routes.find((candidate) => candidate.route_id === route.fallback_route_id) ?? null })
    }
  }
  return <section className="rounded-3xl border border-border bg-surface/[0.03] p-5" aria-labelledby="deep-link-tester-title"><div className="flex items-start gap-3"><div className="rounded-xl bg-warning-surface p-2 text-warning"><FlaskConical size={18} aria-hidden="true" /></div><div><h2 id="deep-link-tester-title" className="text-base font-black text-foreground-muted">Destination tester</h2><p className="mt-1 text-xs leading-relaxed text-foreground-muted">Simulates the selected platform/app/schema compatibility and asks the server to resolve the typed destination.</p></div></div><div className="mt-4 grid gap-3 sm:grid-cols-3"><div><p className="text-xs font-black uppercase tracking-wide text-foreground-muted">Surface</p><p className="mt-1 text-xs text-foreground-muted">{surface}</p></div><div><p className="text-xs font-black uppercase tracking-wide text-foreground-muted">App version</p><p className="mt-1 text-xs text-foreground-muted">{appVersion || 'Not set'}</p></div><div><p className="text-xs font-black uppercase tracking-wide text-foreground-muted">Schema version</p><p className="mt-1 text-xs text-foreground-muted">{schemaVersion}</p></div></div><button type="button" disabled={!route} onClick={() => { void run() }} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-3 text-xs font-black uppercase tracking-wide text-on-primary disabled:opacity-60">Run typed destination test</button>{result ? <div className={`mt-4 rounded-2xl border p-4 text-xs ${result.compatible ? 'border-success bg-success/[0.06] text-success' : 'border-warning bg-warning/[0.06] text-warning'}`}><p className="font-black uppercase tracking-wide">{result.compatible ? <CheckCircle2 size={14} className="mr-1 inline" aria-hidden="true" /> : <AlertTriangle size={14} className="mr-1 inline"  aria-hidden="true"/>}{result.compatible ? 'Destination available' : 'Fallback required'}</p><p className="mt-2">{result.reason}</p>{result.compatible ? <p className="mt-1 font-mono">{result.deep_link}</p> : result.fallback ? <p className="mt-1">Fallback: <strong>{result.fallback.label}</strong> · {result.fallback.template}</p> : null}</div> : null}</section>
}
