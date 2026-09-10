import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Beaker, Loader2, Plus, Power, RefreshCw, ShieldCheck, X } from 'lucide-react'
import { api } from '../lib/api'
import { toast } from 'sonner'
import { StatusBadge } from '../components/StatusBadge'

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
  const createCloseRef = useRef<HTMLButtonElement>(null)
  const createDialogRef = useRef<HTMLDivElement>(null)
  const [form, setForm] = useState({ key: '', name: '', namespace: 'default', markets: 'id-jk', services: 'food_delivery' })

  useEffect(() => {
    if (!showCreate) return
    const previousFocus = document.activeElement as HTMLElement | null
    createCloseRef.current?.focus()
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowCreate(false)
      if (event.key !== 'Tab' || !createDialogRef.current) return
      const focusable = Array.from(createDialogRef.current.querySelectorAll<HTMLElement>('button, input, select, textarea, [href], [tabindex]:not([tabindex="-1"])')).filter((element) => !element.hasAttribute('disabled'))
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      previousFocus?.focus?.()
    }
  }, [showCreate])

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
          <h1 className="text-3xl font-black tracking-tight text-foreground-muted flex items-center gap-3"><Beaker className="text-primary-light" size={27}  aria-hidden="true"/> Experiments</h1>
          <p className="text-foreground-muted mt-1">Assignment deterministik, targeting aman, exposure nyata, dan kill switch.</p>
        </div>
        <div className="flex gap-3">
          <button type="button" onClick={() => experimentsQuery.refetch()} className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-3 text-xs font-black uppercase tracking-widest text-foreground-muted"><RefreshCw size={14} aria-hidden="true" /> Refresh</button>
          <button type="button" onClick={() => setShowCreate(true)} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-3 text-xs font-black uppercase tracking-widest text-on-primary"><Plus size={14} aria-hidden="true" /> New experiment</button>
        </div>
      </div>

      <div className="grid gap-5">
        {experimentsQuery.isLoading ? <div className="glass-card rounded-3xl p-10 text-foreground-muted">Memuat experiment...</div> : null}
        {experimentsQuery.isError ? <div className="glass-card rounded-3xl p-10 text-error">Experiment gagal dimuat.</div> : null}
        {!experimentsQuery.isLoading && !experimentsQuery.isError && (experimentsQuery.data ?? []).length === 0 ? <div className="glass-card rounded-3xl p-10 text-foreground-muted">Belum ada experiment.</div> : null}
        {(experimentsQuery.data ?? []).map((experiment) => (
          <article key={experiment.id} className="glass-card rounded-3xl border-border p-6 shadow-xl shadow-scrim">
            <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-5">
              <div>
                <div className="flex items-center gap-3 flex-wrap"><h2 className="text-lg font-black text-foreground-muted">{experiment.name}</h2><StatusBadge status={experiment.status} labelPrefix="Experiment status" className="text-[10px] uppercase tracking-widest" /></div>
                <p className="font-mono text-xs text-foreground-muted mt-2">{experiment.key} · namespace={experiment.namespace} · v{experiment.version}</p>
                <div className="flex flex-wrap gap-2 mt-4 text-[10px] font-bold text-foreground-muted"><span className="rounded-lg bg-surface-subtle px-2.5 py-1">market: {(experiment.targeting?.market_codes ?? []).join(', ') || 'all'}</span><span className="rounded-lg bg-surface-subtle px-2.5 py-1">service: {(experiment.targeting?.service_codes ?? []).join(', ') || 'all'}</span><span className="rounded-lg bg-surface-subtle px-2.5 py-1">variants: {(experiment.variants ?? []).map((variant) => `${variant.key} ${variant.weight_basis_points / 100}%`).join(' · ')}</span></div>
              </div>
              <div className="flex flex-wrap gap-2">
                {experiment.status === 'draft' && <button type="button" onClick={() => statusMutation.mutate({ experiment, status: 'running' })} disabled={statusMutation.isPending} className="inline-flex items-center gap-2 rounded-xl bg-success-surface border border-success px-3 py-2 text-[10px] font-black uppercase tracking-widest text-success"><Power size={14} aria-hidden="true" /> Run</button>}
                {experiment.status === 'running' && <button type="button" onClick={() => killMutation.mutate(experiment)} disabled={killMutation.isPending} className="inline-flex items-center gap-2 rounded-xl bg-error-surface border border-error px-3 py-2 text-[10px] font-black uppercase tracking-widest text-error"><Power size={14} aria-hidden="true" /> Kill switch</button>}
              </div>
            </div>
            <div className="mt-5 flex items-center gap-2 text-xs text-foreground-muted"><ShieldCheck size={15} className="text-success" aria-hidden="true" /> Guardrails: {(experiment.guardrails ?? []).map((guardrail) => guardrail.metric).join(' · ') || 'not configured'}</div>
            {experiment.kill_reason && <p className="mt-3 text-xs text-error">Kill reason: {experiment.kill_reason}</p>}
          </article>
        ))}
      </div>

      {showCreate && <div className="fixed inset-0 z-[250] flex items-center justify-center bg-scrim/80 p-6"><div ref={createDialogRef} role="dialog" aria-modal="true" aria-labelledby="experiment-create-title" className="glass-card w-full max-w-lg rounded-3xl border-border p-7"><div className="flex items-center justify-between"><h2 id="experiment-create-title" className="text-xl font-black text-foreground-muted">New experiment draft</h2><button ref={createCloseRef} type="button" onClick={() => setShowCreate(false)} aria-label="Tutup form experiment" className="rounded-lg p-2 text-foreground-muted hover:bg-surface-subtle hover:text-foreground"><X size={18} aria-hidden="true" /></button></div><p className="mt-2 text-xs text-foreground-muted">Treatment config hanya menerima product-safe fields; financial truth tetap di server.</p><div className="mt-6 grid gap-4"><label className="text-xs font-bold text-foreground-muted">Key<input value={form.key} onChange={(event) => setForm({ ...form, key: event.target.value })} placeholder="food-home-layout-v2" className="mt-2 w-full rounded-xl border border-border bg-surface-subtle px-4 py-3 text-sm text-foreground" /></label><label className="text-xs font-bold text-foreground-muted">Name<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Food home layout" className="mt-2 w-full rounded-xl border border-border bg-surface-subtle px-4 py-3 text-sm text-foreground" /></label><label className="text-xs font-bold text-foreground-muted">Namespace<input value={form.namespace} onChange={(event) => setForm({ ...form, namespace: event.target.value })} className="mt-2 w-full rounded-xl border border-border bg-surface-subtle px-4 py-3 text-sm text-foreground" /></label><label className="text-xs font-bold text-foreground-muted">Market codes<input value={form.markets} onChange={(event) => setForm({ ...form, markets: event.target.value })} className="mt-2 w-full rounded-xl border border-border bg-surface-subtle px-4 py-3 text-sm text-foreground" /></label><label className="text-xs font-bold text-foreground-muted">Service codes<input value={form.services} onChange={(event) => setForm({ ...form, services: event.target.value })} className="mt-2 w-full rounded-xl border border-border bg-surface-subtle px-4 py-3 text-sm text-foreground" /></label></div><div className="mt-7 flex justify-end gap-3"><button type="button" onClick={() => setShowCreate(false)} className="rounded-xl px-4 py-2.5 text-sm font-bold text-foreground-muted">Cancel</button><button type="button" onClick={submitCreate} disabled={createMutation.isPending} className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-xs font-black uppercase tracking-widest text-on-primary">{createMutation.isPending && <Loader2 size={14} className="animate-spin" aria-hidden="true" />} Create draft</button></div></div></div>}
    </div>
  )
}
