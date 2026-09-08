import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2, ChevronRight, Clock3, RefreshCw, ShieldCheck, X } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '../lib/api'
import CaseTimeline from '../components/CaseTimeline'

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

const statusClass: Record<string, string> = {
  open: 'border-sky-500/20 bg-sky-500/10 text-sky-300',
  investigating: 'border-amber-500/20 bg-amber-500/10 text-amber-300',
  pending_customer: 'border-violet-500/20 bg-violet-500/10 text-violet-300',
  pending_internal: 'border-orange-500/20 bg-orange-500/10 text-orange-300',
  resolved: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300',
  closed: 'border-zinc-700 bg-zinc-800/50 text-zinc-400',
}

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
            <div className="rounded-2xl border border-primary/20 bg-primary/10 p-3 text-primary-light"><ShieldCheck size={22} /></div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-zinc-100">Support Cases</h1>
              <p className="mt-1 text-zinc-500">Satu timeline operasional untuk customer, merchant, dan courier.</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filter case status" className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-zinc-200">
            {statuses.map((value) => <option key={value} value={value}>{value ? value.replaceAll('_', ' ') : 'All statuses'}</option>)}
          </select>
          <button type="button" onClick={refresh} className="flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2.5 text-sm font-medium text-zinc-300 hover:bg-white/5">
            <RefreshCw size={16} className={casesQuery.isFetching ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="glass-card rounded-2xl border-white/10 p-5"><p className="text-xs font-bold uppercase tracking-widest text-zinc-500">Visible cases</p><p className="mt-2 text-3xl font-black text-zinc-100">{casesQuery.data?.total ?? '—'}</p></div>
        <div className="glass-card rounded-2xl border-amber-500/20 p-5"><p className="text-xs font-bold uppercase tracking-widest text-amber-300/70">Open workload</p><p className="mt-2 text-3xl font-black text-amber-300">{openCount}</p></div>
        <div className="glass-card rounded-2xl border-red-500/20 p-5"><p className="text-xs font-bold uppercase tracking-widest text-red-300/70">SLA breached</p><p className="mt-2 text-3xl font-black text-red-300">{breachedCount}</p></div>
      </div>

      <div className="glass-card overflow-hidden rounded-3xl border-white/10">
        {casesQuery.isLoading ? <div className="p-12 text-center text-sm text-zinc-500">Loading support cases…</div> : casesQuery.isError ? <div className="p-12 text-center text-sm text-red-300">Support case queue unavailable.</div> : data.length === 0 ? <div className="p-12 text-center"><CheckCircle2 className="mx-auto text-emerald-400" /><p className="mt-3 font-semibold text-zinc-200">No cases for this filter</p></div> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-left text-sm">
              <thead className="border-b border-white/10 bg-white/[0.03] text-[10px] uppercase tracking-widest text-zinc-500"><tr><th className="px-6 py-4">Case</th><th className="px-6 py-4">Service / market</th><th className="px-6 py-4">SLA</th><th className="px-6 py-4">Owner</th><th className="px-6 py-4" /></tr></thead>
              <tbody className="divide-y divide-white/5">
                {data.map((item) => <tr key={item.id} className="transition hover:bg-white/[0.03]">
                  <td className="px-6 py-5"><div className="flex items-start gap-3"><span className={`mt-0.5 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${statusClass[item.status] || statusClass.open}`}>{item.status.replaceAll('_', ' ')}</span><div><p className="font-bold text-zinc-100">{item.case_number} · {item.subject}</p><p className="mt-1 text-xs text-zinc-500">{item.category} · {item.priority}</p></div></div></td>
                  <td className="px-6 py-5 text-xs text-zinc-400"><p className="font-bold text-zinc-300">{item.service_code}</p><p className="mt-1 uppercase tracking-widest text-zinc-600">{item.market_code}</p></td>
                  <td className="px-6 py-5 text-xs">{item.sla_breached ? <span className="inline-flex items-center gap-1.5 font-bold text-red-300"><AlertTriangle size={14} /> Breached</span> : <span className="inline-flex items-center gap-1.5 text-zinc-400"><Clock3 size={14} /> {new Date(item.sla_due_at).toLocaleString('id-ID')}</span>}</td>
                  <td className="px-6 py-5 text-xs text-zinc-400">{item.assigned_to_name || 'Unassigned'}</td>
                  <td className="px-6 py-5 text-right"><button type="button" onClick={() => setSelected(item)} aria-label={`Open ${item.case_number}`} className="rounded-xl border border-white/10 p-2.5 text-zinc-400 hover:bg-white/10 hover:text-white"><ChevronRight size={18} /></button></td>
                </tr>)}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {detail && <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 md:p-8">
        <button type="button" aria-label="Close case detail" onClick={() => setSelected(null)} className="absolute inset-0 bg-black/80 backdrop-blur-md" />
        <div className="glass-card relative z-10 max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-[32px] border-white/10 p-6 md:p-10">
          <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[0.2em] text-primary-light">{detail.case_number}</p><h2 className="mt-2 text-3xl font-black tracking-tight text-zinc-100">{detail.subject}</h2><p className="mt-2 text-sm text-zinc-500">{detail.category} · {detail.service_code} · {detail.market_code}</p></div><button type="button" onClick={() => setSelected(null)} className="rounded-xl border border-white/10 p-2 text-zinc-500 hover:text-white"><X size={20} /></button></div>
          <div className="mt-8 grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="space-y-6"><div className="rounded-2xl border border-white/5 bg-white/[0.025] p-5"><p className="text-xs font-black uppercase tracking-widest text-zinc-500">Customer report</p><p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">{detail.description}</p></div><div><div className="mb-4 flex items-center justify-between"><h3 className="text-xs font-black uppercase tracking-widest text-zinc-500">Timeline</h3><span className="text-[10px] text-zinc-600">Append-only audit</span></div><CaseTimeline events={detail.events || []} /></div></div>
            <div className="space-y-5"><div className="rounded-2xl border border-white/5 bg-white/[0.025] p-5"><p className="text-xs font-black uppercase tracking-widest text-zinc-500">Authoritative references</p><div className="mt-3 space-y-2">{(detail.links || []).map((link) => <div key={link.id} className="flex justify-between gap-3 text-xs"><span className="uppercase tracking-widest text-zinc-600">{link.reference_type}</span><span className="max-w-[230px] truncate text-zinc-300" title={link.reference_id}>{link.reference_label || link.reference_id}</span></div>)}{(!detail.links || detail.links.length === 0) && <p className="text-sm text-zinc-600">No visible references</p>}</div>{detail.authoritative?.payment_status && <p className="mt-4 border-t border-white/5 pt-3 text-xs text-zinc-500">Payment state: <span className="font-bold text-zinc-300">{detail.authoritative.payment_status}</span></p>}</div>
              <div className="rounded-2xl border border-white/5 bg-white/[0.025] p-5"><p className="text-xs font-black uppercase tracking-widest text-zinc-500">Policy actions</p><p className="mt-2 text-xs leading-relaxed text-zinc-500">{detail.policy?.reason || 'Policy unavailable'}</p><div className="mt-4 flex flex-wrap gap-2">{(detail.policy?.allowedActions || []).map((action) => <button key={action} type="button" disabled={actionMutation.isPending || updateMutation.isPending} onClick={() => action === 'resolve' || action === 'reopen' ? actionMutation.mutate({ id: detail.id, action }) : actionMutation.mutate({ id: detail.id, action })} className="rounded-xl border border-primary/20 bg-primary/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-primary-light hover:bg-primary/20 disabled:opacity-40">{action.replaceAll('_', ' ')}</button>)}</div></div>
              <div className="rounded-2xl border border-white/5 bg-white/[0.025] p-5"><p className="text-xs font-black uppercase tracking-widest text-zinc-500">Manual status gate</p><select value={detail.status} onChange={(event) => updateMutation.mutate({ id: detail.id, nextStatus: event.target.value })} disabled={updateMutation.isPending} className="mt-3 w-full rounded-xl border border-white/10 bg-zinc-900 px-3 py-2.5 text-sm text-zinc-200">{statuses.filter(Boolean).map((value) => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}</select><p className="mt-3 flex items-center gap-2 text-[10px] text-zinc-600"><ShieldCheck size={13} /> Financial actions require finance role + TOTP.</p></div>
            </div>
          </div>
        </div>
      </div>}
    </div>
  )
}
