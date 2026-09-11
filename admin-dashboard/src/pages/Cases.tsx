import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, ChevronRight, RefreshCw, ShieldCheck, X } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '../lib/api'
import CaseTimeline from '../components/CaseTimeline'
import { getStatusPresentation, StatusBadge } from '../components/StatusBadge'
import { FocusTrap } from '../components/a11y/FocusTrap'

type SupportCase = {
  id: string
  case_number: string
  category: string
  subject: string
  description: string
  service_code: string
  market_code: string
  priority: string
  status: string
  assigned_to_name?: string | null
  escalation_level: number
  sla_due_at: string
  sla_breached: boolean
  links?: Array<{ id: string; reference_type: string; reference_id: string; reference_label?: string | null }>
  events?: any[]
  policy?: { allowedActions: string[]; suggestedActions: string[]; reason: string }
  authoritative?: { order_id?: string | null; order_status?: string | null; payment_status?: string | null }
}

const statuses = ['', 'open', 'investigating', 'pending_customer', 'pending_internal', 'resolved', 'closed']
const newIdempotencyKey = () => `support-${crypto.randomUUID()}`
const actionLabels: Record<string, string> = {
  assign: 'Tugaskan',
  cancel: 'Batalkan',
  compensate: 'Kompensasi',
  escalate: 'Eskalasi',
  reopen: 'Buka kembali',
  resolve: 'Selesaikan',
}
const actionLabel = (action: string) => actionLabels[action] || action.replaceAll('_', ' ')

export default function Cases() {
  const [status, setStatus] = useState('')
  const [selected, setSelected] = useState<SupportCase | null>(null)
  const queryClient = useQueryClient()
  const casesQuery = useQuery({
    queryKey: ['support-cases', status],
    queryFn: async () => (await api.get('/admin/support/cases', { params: { status: status || undefined, limit: 100 } })).data as { data: SupportCase[]; total: number },
    refetchInterval: 30_000,
  })

  const detailQuery = useQuery({
    queryKey: ['support-case', selected?.id],
    enabled: Boolean(selected?.id),
    queryFn: async () => (await api.get(`/admin/support/cases/${selected?.id}`)).data.data as SupportCase,
  })

  const refresh = () => {
    void casesQuery.refetch()
    if (selected?.id) void detailQuery.refetch()
  }

  const updateMutation = useMutation({
    mutationFn: async ({ id, nextStatus }: { id: string; nextStatus: string }) => {
      await api.patch(`/admin/support/cases/${id}`, { status: nextStatus, note: `Status diubah dari support console menjadi ${nextStatus}` }, { headers: { 'X-Idempotency-Key': newIdempotencyKey() } })
    },
    onSuccess: () => {
      toast.success('Status kasus diperbarui')
      queryClient.invalidateQueries({ queryKey: ['support-cases'] })
      queryClient.invalidateQueries({ queryKey: ['support-case', selected?.id] })
    },
    onError: () => toast.error('Status kasus gagal diperbarui'),
  })

  const actionMutation = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: string }) => {
      await api.post(`/admin/support/cases/${id}/actions`, { action, reason: `Action ${action} dijalankan dari support console` }, { headers: { 'X-Idempotency-Key': newIdempotencyKey() } })
    },
    onSuccess: () => {
      toast.success('Action support berhasil dicatat')
      queryClient.invalidateQueries({ queryKey: ['support-cases'] })
      queryClient.invalidateQueries({ queryKey: ['support-case', selected?.id] })
    },
    onError: (error: any) => toast.error(error?.response?.data?.error || 'Action support gagal'),
  })

  const data = casesQuery.data?.data || []
  const openCount = useMemo(() => data.filter((item) => !['resolved', 'closed'].includes(item.status)).length, [data])
  const breachedCount = useMemo(() => data.filter((item) => item.sla_breached).length, [data])
  const detail = detailQuery.data || selected

  return (
    <div className="space-y-8 animate-in">
      <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="rounded-2xl border border-primary/20 bg-primary/10 p-3 text-primary-light"><ShieldCheck size={22} aria-hidden="true" /></div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-foreground-muted">Support Cases</h1>
              <p className="mt-1 text-foreground-muted">Satu timeline operasional untuk customer, merchant, dan courier.</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filter case status" className="rounded-xl border border-border bg-surface-subtle px-4 py-2.5 text-sm text-foreground-muted">
            {statuses.map((value) => <option key={value} value={value}>{value ? getStatusPresentation(value).label : 'Semua status'}</option>)}
          </select>
          <button type="button" onClick={refresh} className="flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-foreground-muted hover:bg-surface-subtle">
            <RefreshCw size={16} className={casesQuery.isFetching ? 'animate-spin' : ''} aria-hidden="true" /> Refresh
          </button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="glass-card rounded-2xl border-border p-5"><p className="text-xs font-bold uppercase tracking-wide text-foreground-muted">Visible cases</p><p className="mt-2 text-3xl font-black text-foreground-muted">{casesQuery.data?.total ?? '—'}</p></div>
        <div className="glass-card rounded-2xl border-warning p-5"><p className="text-xs font-bold uppercase tracking-wide text-warning">Open workload</p><p className="mt-2 text-3xl font-black text-warning">{openCount}</p></div>
        <div className="glass-card rounded-2xl border-error p-5"><p className="text-xs font-bold uppercase tracking-wide text-error">SLA breached</p><p className="mt-2 text-3xl font-black text-error">{breachedCount}</p></div>
      </div>

      <div className="glass-card overflow-hidden rounded-3xl border-border">
        {casesQuery.isLoading ? <div className="p-12 text-center text-sm text-foreground-muted">Loading support cases…</div> : casesQuery.isError ? <div className="p-12 text-center text-sm text-error">Support case queue unavailable.</div> : data.length === 0 ? <div className="p-12 text-center"><CheckCircle2 className="mx-auto text-success" aria-hidden="true" /><p className="mt-3 font-semibold text-foreground-muted">No cases for this filter</p></div> : (
          <div role="region" aria-label="Support cases table" tabIndex={0} className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-left text-sm">
              <thead className="border-b border-border bg-surface/[0.03] text-xs uppercase tracking-wide text-foreground-muted"><tr><th scope="col" className="px-6 py-4">Case</th><th scope="col" className="px-6 py-4">Service / market</th><th scope="col" className="px-6 py-4">SLA</th><th scope="col" className="px-6 py-4">Owner</th><th scope="col" className="px-6 py-4" /></tr></thead>
              <tbody className="divide-y divide-border">
                {data.map((item) => <tr key={item.id} className="transition hover:bg-surface/[0.03]">
                  <td className="px-6 py-5"><div className="flex items-start gap-3"><StatusBadge status={item.status} labelPrefix="Case status" className="mt-0.5" /><div><p className="font-bold text-foreground-muted">{item.case_number} · {item.subject}</p><p className="mt-1 text-xs text-foreground-muted">{item.category} · {item.priority}</p></div></div></td>
                  <td className="px-6 py-5 text-xs text-foreground-muted"><p className="font-bold text-foreground-muted">{item.service_code}</p><p className="mt-1 uppercase tracking-wide text-foreground-muted">{item.market_code}</p></td>
                  <td className="px-6 py-5 text-xs"><StatusBadge status={item.sla_breached ? 'critical' : 'scheduled'} labelPrefix="Case SLA" label={item.sla_breached ? 'Melewati SLA' : `Jatuh tempo ${new Date(item.sla_due_at).toLocaleString('id-ID')}`} className={item.sla_breached ? 'border-error bg-error-surface' : 'border-border bg-surface-subtle text-foreground-muted'} /></td>
                  <td className="px-6 py-5 text-xs text-foreground-muted">{item.assigned_to_name || 'Unassigned'}</td>
                  <td className="px-6 py-5 text-right"><button type="button" onClick={() => setSelected(item)} aria-label={`Open ${item.case_number}`} title={`Open ${item.case_number}`} className="rounded-xl border border-border p-2.5 text-foreground-muted hover:bg-surface-subtle hover:text-foreground"><ChevronRight size={18} aria-hidden="true" /></button></td>
                </tr>)}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {detail && <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 md:p-8">
        <button type="button" aria-label="Close case detail" onClick={() => setSelected(null)} className="absolute inset-0 bg-scrim/80 backdrop-blur-md" />
        <FocusTrap active={Boolean(detail)} className="relative z-10 max-h-[92vh] w-full max-w-5xl">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="case-detail-title"
          onKeyDown={(event) => {
            if (event.key === 'Escape') setSelected(null)
          }}
          className="glass-card h-full max-h-[92vh] w-full overflow-y-auto rounded-[32px] border-border p-6 md:p-10"
        >
          <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-wide text-primary-light">{detail.case_number}</p><h2 id="case-detail-title" className="mt-2 text-3xl font-black tracking-tight text-foreground-muted">{detail.subject}</h2><p className="mt-2 text-sm text-foreground-muted">{detail.category} · {detail.service_code} · {detail.market_code}</p></div><button type="button" onClick={() => setSelected(null)} aria-label="Close case detail" title="Close case detail" className="rounded-xl border border-border p-2 text-foreground-muted hover:text-foreground"><X size={20} aria-hidden="true" /></button></div>
          <div className="mt-8 grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="space-y-6"><div className="rounded-2xl border border-border bg-surface/[0.025] p-5"><p className="text-xs font-black uppercase tracking-wide text-foreground-muted">Customer report</p><p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-foreground-muted">{detail.description}</p></div><div><div className="mb-4 flex items-center justify-between"><h3 className="text-xs font-black uppercase tracking-wide text-foreground-muted">Timeline</h3><span className="text-xs text-foreground-muted">Append-only audit</span></div><CaseTimeline events={detail.events || []} /></div></div>
            <div className="space-y-5"><div className="rounded-2xl border border-border bg-surface/[0.025] p-5"><p className="text-xs font-black uppercase tracking-wide text-foreground-muted">Authoritative references</p><div className="mt-3 space-y-2">{(detail.links || []).map((link) => <div key={link.id} className="flex justify-between gap-3 text-xs"><span className="uppercase tracking-wide text-foreground-muted">{link.reference_type}</span><span className="max-w-[230px] truncate text-foreground-muted" title={link.reference_id}>{link.reference_label || link.reference_id}</span></div>)}{(!detail.links || detail.links.length === 0) && <p className="text-sm text-foreground-muted">No visible references</p>}</div>{detail.authoritative?.payment_status && <div className="mt-4 flex items-center gap-2 border-t border-border pt-3"><span className="text-xs text-foreground-muted">Payment state:</span><StatusBadge status={detail.authoritative.payment_status} labelPrefix="Payment state" /></div>}</div>
              <div className="rounded-2xl border border-border bg-surface/[0.025] p-5"><p className="text-xs font-black uppercase tracking-wide text-foreground-muted">Policy actions</p><p className="mt-2 text-xs leading-relaxed text-foreground-muted">{detail.policy?.reason || 'Policy unavailable'}</p><div className="mt-4 flex flex-wrap gap-2">{(detail.policy?.allowedActions || []).map((action) => <button key={action} type="button" disabled={actionMutation.isPending || updateMutation.isPending} onClick={() => actionMutation.mutate({ id: detail.id, action })} className="rounded-xl border border-primary/20 bg-primary/10 px-3 py-2 text-xs font-bold tracking-wide text-primary-light hover:bg-primary/20 disabled:opacity-60">{actionLabel(action)}</button>)}</div></div>
              <div className="rounded-2xl border border-border bg-surface/[0.025] p-5"><p className="text-xs font-black uppercase tracking-wide text-foreground-muted">Manual status gate</p><select value={detail.status} onChange={(event) => updateMutation.mutate({ id: detail.id, nextStatus: event.target.value })} disabled={updateMutation.isPending} className="mt-3 w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm text-foreground-muted">{statuses.filter(Boolean).map((value) => <option key={value} value={value}>{getStatusPresentation(value).label}</option>)}</select><p className="mt-3 flex items-center gap-2 text-xs text-foreground-muted"><ShieldCheck size={13} aria-hidden="true" /> Financial actions require finance role + TOTP.</p></div>
            </div>
          </div>
        </div>
        </FocusTrap>
      </div>}
    </div>
  )
}
