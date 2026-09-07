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
  critical: 'border-red-500/30 bg-red-500/10 text-red-300',
  high: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  medium: 'border-sky-500/30 bg-sky-500/10 text-sky-300',
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
            <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-3 text-red-300">
              <AlertTriangle size={22} />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-zinc-100">Order Exceptions</h1>
              <p className="mt-1 text-zinc-500">One operational queue for orders that need human action.</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value as '' | ExceptionCategory)}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-primary/40"
            aria-label="Filter exception category"
          >
            {categories.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
          <button
            type="button"
            onClick={() => exceptionsQuery.refetch()}
            className="flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2.5 text-sm font-medium text-zinc-300 transition hover:bg-white/5"
          >
            <RefreshCw size={16} className={exceptionsQuery.isFetching ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="glass-card rounded-2xl border-white/10 p-5">
          <p className="text-xs font-bold uppercase tracking-widest text-zinc-500">Total open signals</p>
          <p className="mt-2 text-3xl font-black text-zinc-100">{exceptionsQuery.data?.total ?? '—'}</p>
        </div>
        <div className="glass-card rounded-2xl border-red-500/20 p-5">
          <p className="text-xs font-bold uppercase tracking-widest text-red-300/70">Critical</p>
          <p className="mt-2 text-3xl font-black text-red-300">{criticalCount}</p>
        </div>
        <div className="glass-card rounded-2xl border-amber-500/20 p-5">
          <p className="text-xs font-bold uppercase tracking-widest text-amber-300/70">High priority</p>
          <p className="mt-2 text-3xl font-black text-amber-300">{highCount}</p>
        </div>
      </div>

      <div className="glass-card overflow-hidden rounded-3xl border-white/10">
        {exceptionsQuery.isLoading ? (
          <div className="p-12 text-center text-sm text-zinc-500">Loading operational exceptions…</div>
        ) : exceptionsQuery.isError ? (
          <div className="p-12 text-center text-sm text-red-300">Exception queue unavailable. Retry after checking admin-service health.</div>
        ) : data.length === 0 ? (
          <div className="p-12 text-center">
            <p className="font-semibold text-zinc-200">No open exceptions</p>
            <p className="mt-2 text-sm text-zinc-500">The queue is clear for the selected filter.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="border-b border-white/10 bg-white/[0.03] text-[10px] uppercase tracking-widest text-zinc-500">
                <tr>
                  <th className="px-6 py-4">Exception</th>
                  <th className="px-6 py-4">Order</th>
                  <th className="px-6 py-4">Age</th>
                  <th className="px-6 py-4">Next action</th>
                  <th className="px-6 py-4" aria-label="Open order" />
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {data.map((item, index) => (
                  <tr key={`${item.category}-${item.order_id ?? item.provider ?? 'unknown'}-${item.occurred_at}-${index}`} className="transition hover:bg-white/[0.03]">
                    <td className="px-6 py-5 align-top">
                      <div className="flex items-start gap-3">
                        <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${severityClass[item.severity]}`}>
                          {item.severity}
                        </span>
                        <div>
                          <p className="font-semibold text-zinc-100">{item.title}</p>
                          <p className="mt-1 max-w-md text-xs leading-relaxed text-zinc-500">{item.summary}</p>
                          {item.provider && <p className="mt-2 text-[10px] font-bold uppercase tracking-widest text-zinc-600">Provider: {item.provider}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-5 align-top">
                      {item.order_id ? (
                        <Link to="/orders" className="inline-flex items-center gap-1.5 font-semibold text-primary-light hover:underline" title="Open Orders Management">
                          {item.order_number || item.order_id.slice(0, 8)} <ExternalLink size={13} />
                        </Link>
                      ) : <span className="text-zinc-600">No linked order</span>}
                      {item.order_status && <p className="mt-1 text-xs uppercase tracking-wider text-zinc-600">{item.order_status}</p>}
                    </td>
                    <td className="px-6 py-5 align-top text-zinc-400">
                      <span className="inline-flex items-center gap-1.5"><Clock3 size={14} /> {item.age_minutes}m</span>
                    </td>
                    <td className="max-w-sm px-6 py-5 align-top text-xs leading-relaxed text-zinc-400">{item.next_action}</td>
                    <td className="px-6 py-5 align-top text-right text-[10px] text-zinc-600">
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
