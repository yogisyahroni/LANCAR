import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, Clock3, ExternalLink, RefreshCw } from 'lucide-react'
import { Link } from 'react-router'
import { api } from '../lib/api'

type ExceptionCategory =
  | 'no_supply'
  | 'payment_sla'
  | 'payment_dispatch_mismatch'
  | 'awb_provider_failure'
  | 'carrier_event_anomaly'
  | 'merchant_timeout'
  | 'service_adjustment_pending'
  | 'missing_proof'
  | 'repeated_post_dispatch_cancellation'
  | 'reconciliation_mismatch'

interface OperationalException {
  category: ExceptionCategory
  title: string
  summary: string
  severity: 'critical' | 'high' | 'medium'
  order_id?: string | null
  order_number?: string | null
  order_status?: string | null
  provider?: string | null
  occurred_at: string
  age_minutes: number
  next_action: string
}

const categories: Array<{ value: '' | ExceptionCategory; label: string }> = [
  { value: '', label: 'All exception types' },
  { value: 'no_supply', label: 'No courier / technician' },
  { value: 'payment_sla', label: 'Payment SLA breach' },
  { value: 'payment_dispatch_mismatch', label: 'Payment / dispatch mismatch' },
  { value: 'awb_provider_failure', label: 'AWB / provider failure' },
  { value: 'carrier_event_anomaly', label: 'Carrier event anomaly' },
  { value: 'merchant_timeout', label: 'Merchant timeout / readiness' },
  { value: 'service_adjustment_pending', label: 'Service adjustment approval' },
  { value: 'missing_proof', label: 'Missing proof' },
  { value: 'repeated_post_dispatch_cancellation', label: 'Repeated post-dispatch cancellation' },
  { value: 'reconciliation_mismatch', label: 'Reconciliation mismatch' },
]

const severityClass: Record<OperationalException['severity'], string> = {
  critical: 'border-error bg-error-surface text-error',
  high: 'border-warning bg-warning-surface text-warning',
  medium: 'border-info bg-info-surface text-info',
}

export default function OrderExceptions() {
  const [category, setCategory] = useState<'' | ExceptionCategory>('')
  const exceptionsQuery = useQuery({
    queryKey: ['admin-order-exceptions', category],
    queryFn: async () => {
      const response = await api.get('/admin/orders/exceptions', {
        params: { category: category || undefined, limit: 250 },
      })
      return response.data as { data: OperationalException[]; total: number }
    },
    refetchInterval: 30_000,
  })

  const data = exceptionsQuery.data?.data ?? []
  const criticalCount = useMemo(() => data.filter((item) => item.severity === 'critical').length, [data])
  const highCount = useMemo(() => data.filter((item) => item.severity === 'high').length, [data])

  return (
    <div className="space-y-8 animate-in">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="rounded-2xl border border-error bg-error-surface p-3 text-error">
              <AlertTriangle size={22}  aria-hidden="true"/>
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-foreground-muted">Order Exceptions</h1>
              <p className="mt-1 text-foreground-muted">One operational queue for orders that need human action.</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value as '' | ExceptionCategory)}
            className="rounded-xl border border-border bg-surface-subtle px-4 py-2.5 text-sm text-foreground-muted focus:outline-none focus:ring-2 focus:ring-primary/40"
            aria-label="Filter exception category"
          >
            {categories.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
          <button
            type="button"
            onClick={() => exceptionsQuery.refetch()}
            className="flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-foreground-muted transition hover:bg-surface-subtle"
          >
            <RefreshCw size={16} className={exceptionsQuery.isFetching ? 'animate-spin' : ''} aria-hidden="true" />
            Refresh
          </button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="glass-card rounded-2xl border-border p-5">
          <p className="text-xs font-bold uppercase tracking-wide text-foreground-muted">Total open signals</p>
          <p className="mt-2 text-3xl font-black text-foreground-muted">{exceptionsQuery.data?.total ?? '—'}</p>
        </div>
        <div className="glass-card rounded-2xl border-error p-5">
          <p className="text-xs font-bold uppercase tracking-wide text-error">Critical</p>
          <p className="mt-2 text-3xl font-black text-error">{criticalCount}</p>
        </div>
        <div className="glass-card rounded-2xl border-warning p-5">
          <p className="text-xs font-bold uppercase tracking-wide text-warning">High priority</p>
          <p className="mt-2 text-3xl font-black text-warning">{highCount}</p>
        </div>
      </div>

      <div className="glass-card overflow-hidden rounded-3xl border-border">
        {exceptionsQuery.isLoading ? (
          <div className="p-12 text-center text-sm text-foreground-muted">Loading operational exceptions…</div>
        ) : exceptionsQuery.isError ? (
          <div className="p-12 text-center text-sm text-error">Exception queue unavailable. Retry after checking admin-service health.</div>
        ) : data.length === 0 ? (
          <div className="p-12 text-center">
            <p className="font-semibold text-foreground-muted">No open exceptions</p>
            <p className="mt-2 text-sm text-foreground-muted">The queue is clear for the selected filter.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="border-b border-border bg-surface/[0.03] text-xs uppercase tracking-wide text-foreground-muted">
                <tr>
                  <th scope="col" className="px-6 py-4">Exception</th>
                  <th scope="col" className="px-6 py-4">Order</th>
                  <th scope="col" className="px-6 py-4">Age</th>
                  <th scope="col" className="px-6 py-4">Next action</th>
                  <th scope="col" className="px-6 py-4" aria-label="Open order" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.map((item, index) => (
                  <tr key={`${item.category}-${item.order_id ?? item.provider ?? 'unknown'}-${item.occurred_at}-${index}`} className="transition hover:bg-surface/[0.03]">
                    <td className="px-6 py-5 align-top">
                      <div className="flex items-start gap-3">
                        <span className={`rounded-full border px-2.5 py-1 text-xs font-black uppercase tracking-wide ${severityClass[item.severity]}`}>
                          {item.severity}
                        </span>
                        <div>
                          <p className="font-semibold text-foreground-muted">{item.title}</p>
                          <p className="mt-1 max-w-md text-xs leading-relaxed text-foreground-muted">{item.summary}</p>
                          {item.provider && <p className="mt-2 text-xs font-bold uppercase tracking-wide text-foreground-muted">Provider: {item.provider}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-5 align-top">
                      {item.order_id ? (
                        <Link to="/orders" className="inline-flex items-center gap-1.5 font-semibold text-primary-light hover:underline" title="Open Orders Management">
                          {item.order_number || item.order_id.slice(0, 8)} <ExternalLink size={13} aria-hidden="true" />
                        </Link>
                      ) : <span className="text-foreground-muted">No linked order</span>}
                      {item.order_status && <p className="mt-1 text-xs uppercase tracking-wide text-foreground-muted">{item.order_status}</p>}
                    </td>
                    <td className="px-6 py-5 align-top text-foreground-muted">
                      <span className="inline-flex items-center gap-1.5"><Clock3 size={14} aria-hidden="true" /> {item.age_minutes}m</span>
                    </td>
                    <td className="max-w-sm px-6 py-5 align-top text-xs leading-relaxed text-foreground-muted">{item.next_action}</td>
                    <td className="px-6 py-5 align-top text-right text-xs text-foreground-muted">
                      {new Date(item.occurred_at).toLocaleString('id-ID')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
