import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Beaker, Loader2, Plus, Power, RefreshCw, ShieldCheck } from 'lucide-react'
import { api } from '../lib/api'
import { toast } from 'sonner'

type Experiment = {
  id: string
  key: string
  name: string
  namespace: string
  status: 'draft' | 'running' | 'killed' | 'archived'
  version: number
  targeting?: { market_codes?: string[]; city_codes?: string[]; service_codes?: string[] }
  variants?: Array<{ key: string; weight_basis_points: number }>
  guardrails?: Array<{ metric: string }>
  kill_reason?: string | null
}

const requestKey = (action: string) => {
  const id = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  return `admin.experiment.${action}.${id}`
}
const errorMessage = (error: any) => error?.response?.data?.error || error?.message || 'Operasi experiment gagal'

export default function Experiments() {
  const queryClient = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ key: '', name: '', namespace: 'default', markets: 'id-jk', services: 'food_delivery' })

  const experimentsQuery = useQuery({
    queryKey: ['experiments'],
    queryFn: async (): Promise<Experiment[]> => {
      const response = await api.get('/admin/experiments')
      return response.data?.data ?? []
    },
  })

  const createMutation = useMutation({
    mutationFn: () => api.post('/admin/experiments', {
      key: form.key.trim().toLowerCase(), name: form.name.trim(), namespace: form.namespace.trim().toLowerCase(),
      status: 'draft',
      targeting: {
        market_codes: form.markets.split(',').map((value) => value.trim()).filter(Boolean),
        service_codes: form.services.split(',').map((value) => value.trim()).filter(Boolean),
      },
      variants: [
        { key: 'control', weight_basis_points: 5000, payload: {} },
        { key: 'treatment', weight_basis_points: 5000, payload: {} },
      ],
    }, { headers: { 'X-Idempotency-Key': requestKey('create') } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['experiments'] })
      setShowCreate(false)
      setForm({ key: '', name: '', namespace: 'default', markets: 'id-jk', services: 'food_delivery' })
      toast.success('Experiment draft dibuat')
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  const statusMutation = useMutation({
    mutationFn: ({ experiment, status }: { experiment: Experiment; status: string }) => api.patch(`/admin/experiments/${experiment.key}`, { status, version: experiment.version }, { headers: { 'X-Idempotency-Key': requestKey('status') } }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['experiments'] }); toast.success('Status experiment diperbarui') },
    onError: (error) => toast.error(errorMessage(error)),
  })

  const killMutation = useMutation({
    mutationFn: (experiment: Experiment) => api.post(`/admin/experiments/${experiment.key}/kill`, { reason: 'Kill switch operator: guardrail review' }, { headers: { 'X-Idempotency-Key': requestKey('kill') } }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['experiments'] }); toast.success('Kill switch aktif') },
    onError: (error) => toast.error(errorMessage(error)),
  })

  const submitCreate = () => {
    if (!form.key.trim() || !form.name.trim() || !form.namespace.trim()) { toast.error('Key, nama, dan namespace wajib diisi'); return }
    createMutation.mutate()
  }

  return (
    <div className="space-y-8 animate-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-zinc-100 flex items-center gap-3"><Beaker className="text-primary-light" size={27} /> Experiments</h1>
          <p className="text-zinc-500 mt-1">Assignment deterministik, targeting aman, exposure nyata, dan kill switch.</p>
        </div>
        <div className="flex gap-3">
          <button type="button" onClick={() => experimentsQuery.refetch()} className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-3 text-xs font-black uppercase tracking-widest text-zinc-300"><RefreshCw size={14} /> Refresh</button>
          <button type="button" onClick={() => setShowCreate(true)} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-3 text-xs font-black uppercase tracking-widest text-white"><Plus size={14} /> New experiment</button>
        </div>
      </div>

      <div className="grid gap-5">
        {experimentsQuery.isLoading ? <div className="glass-card rounded-3xl p-10 text-zinc-500">Memuat experiment...</div> : null}
        {experimentsQuery.isError ? <div className="glass-card rounded-3xl p-10 text-red-300">Experiment gagal dimuat.</div> : null}
        {!experimentsQuery.isLoading && !experimentsQuery.isError && (experimentsQuery.data ?? []).length === 0 ? <div className="glass-card rounded-3xl p-10 text-zinc-500">Belum ada experiment.</div> : null}
        {(experimentsQuery.data ?? []).map((experiment) => (
          <article key={experiment.id} className="glass-card rounded-3xl border-white/5 p-6 shadow-xl shadow-black/20">
            <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-5">
              <div>
                <div className="flex items-center gap-3 flex-wrap"><h2 className="text-lg font-black text-zinc-100">{experiment.name}</h2><span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest ${experiment.status === 'running' ? 'bg-emerald-500/15 text-emerald-300' : experiment.status === 'killed' ? 'bg-red-500/15 text-red-300' : 'bg-zinc-800 text-zinc-400'}`}>{experiment.status}</span></div>
                <p className="font-mono text-xs text-zinc-500 mt-2">{experiment.key} · namespace={experiment.namespace} · v{experiment.version}</p>
                <div className="flex flex-wrap gap-2 mt-4 text-[10px] font-bold text-zinc-400"><span className="rounded-lg bg-white/5 px-2.5 py-1">market: {(experiment.targeting?.market_codes ?? []).join(', ') || 'all'}</span><span className="rounded-lg bg-white/5 px-2.5 py-1">service: {(experiment.targeting?.service_codes ?? []).join(', ') || 'all'}</span><span className="rounded-lg bg-white/5 px-2.5 py-1">variants: {(experiment.variants ?? []).map((variant) => `${variant.key} ${variant.weight_basis_points / 100}%`).join(' · ')}</span></div>
              </div>
              <div className="flex flex-wrap gap-2">
                {experiment.status === 'draft' && <button type="button" onClick={() => statusMutation.mutate({ experiment, status: 'running' })} disabled={statusMutation.isPending} className="inline-flex items-center gap-2 rounded-xl bg-emerald-500/15 border border-emerald-500/20 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-emerald-300"><Power size={14} /> Run</button>}
                {experiment.status === 'running' && <button type="button" onClick={() => killMutation.mutate(experiment)} disabled={killMutation.isPending} className="inline-flex items-center gap-2 rounded-xl bg-red-500/15 border border-red-500/20 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-red-300"><Power size={14} /> Kill switch</button>}
              </div>
            </div>
            <div className="mt-5 flex items-center gap-2 text-xs text-zinc-500"><ShieldCheck size={15} className="text-emerald-400" /> Guardrails: {(experiment.guardrails ?? []).map((guardrail) => guardrail.metric).join(' · ') || 'not configured'}</div>
            {experiment.kill_reason && <p className="mt-3 text-xs text-red-300">Kill reason: {experiment.kill_reason}</p>}
          </article>
        ))}
      </div>

      {showCreate && <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/80 p-6"><div className="glass-card w-full max-w-lg rounded-3xl border-white/10 p-7"><div className="flex items-center justify-between"><h2 className="text-xl font-black text-zinc-100">New experiment draft</h2><button type="button" onClick={() => setShowCreate(false)} className="text-zinc-500 hover:text-white">×</button></div><p className="mt-2 text-xs text-zinc-500">Treatment config hanya menerima product-safe fields; financial truth tetap di server.</p><div className="mt-6 grid gap-4"><label className="text-xs font-bold text-zinc-400">Key<input value={form.key} onChange={(event) => setForm({ ...form, key: event.target.value })} placeholder="food-home-layout-v2" className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white" /></label><label className="text-xs font-bold text-zinc-400">Name<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Food home layout" className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white" /></label><label className="text-xs font-bold text-zinc-400">Namespace<input value={form.namespace} onChange={(event) => setForm({ ...form, namespace: event.target.value })} className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white" /></label><label className="text-xs font-bold text-zinc-400">Market codes<input value={form.markets} onChange={(event) => setForm({ ...form, markets: event.target.value })} className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white" /></label><label className="text-xs font-bold text-zinc-400">Service codes<input value={form.services} onChange={(event) => setForm({ ...form, services: event.target.value })} className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white" /></label></div><div className="mt-7 flex justify-end gap-3"><button type="button" onClick={() => setShowCreate(false)} className="rounded-xl px-4 py-2.5 text-sm font-bold text-zinc-400">Cancel</button><button type="button" onClick={submitCreate} disabled={createMutation.isPending} className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-xs font-black uppercase tracking-widest text-white">{createMutation.isPending && <Loader2 size={14} className="animate-spin" />} Create draft</button></div></div></div>}
    </div>
  )
}
