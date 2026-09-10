import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  Loader2,
  Play,
  RefreshCw,
  RotateCcw,
  Send,
  ShieldCheck,
} from 'lucide-react'
import { api } from '../lib/api'
import { toast } from 'sonner'
import { StatusBadge } from '../components/StatusBadge'

type Revision = {
  id: string
  policy_type: 'pricing' | 'surge'
  policy_version: string
  runtime_config_key: string
  market_code: string
  zone_id: string | null
  service_code: string
  status: 'draft' | 'approved' | 'published' | 'rolled_back'
  business_reason: string
  created_by: string
  approved_by?: string | null
  published_at?: string | null
  created_at: string
}

type Preview = {
  affected_scope?: {
    market_codes: string[]
    zone_ids: string[]
    service_codes: string[]
    active_order_count: number
  }
  example_quotes?: {
    label: string
    current_multiplier: number | null
    candidate_quotes: Array<{ distance_km: number; base_quote_idr: number; candidate_quote_idr: number; applied_multiplier: number }>
  }
  approval?: { status: string; protected_cap_enforced_server_side: boolean }
}

const initialPayload = JSON.stringify({
  zone_scope: 'active_zone',
  timezone: 'Asia/Jakarta',
  floor_multiplier: 1,
  ceiling_multiplier: 1.35,
  protected_cap_multiplier: 1.4,
  peak_multiplier: 1.1,
  peak_windows: [{ start_hour: 11, end_hour: 14 }, { start_hour: 17, end_hour: 20 }],
  fairness_reviewed: true,
}, null, 2)

const idempotencyKey = () =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `economics-${Date.now()}`

const errorMessage = (error: any, fallback: string) =>
  error?.response?.data?.error || error?.response?.data?.message || error?.message || fallback

const formatIdr = (value: number) => new Intl.NumberFormat('id-ID', {
  style: 'currency', currency: 'IDR', maximumFractionDigits: 0,
}).format(value)

export default function EconomicsControlPlane() {
  const queryClient = useQueryClient()
  const [policyType, setPolicyType] = useState<'pricing' | 'surge'>('pricing')
  const [marketCode, setMarketCode] = useState('default')
  const [serviceCode, setServiceCode] = useState('food_delivery')
  const [policyVersion, setPolicyVersion] = useState('food-pricing-v3')
  const [businessReason, setBusinessReason] = useState('')
  const [payloadText, setPayloadText] = useState(initialPayload)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [rollbackReason, setRollbackReason] = useState('')

  const revisionsQuery = useQuery({
    queryKey: ['economics-policy-revisions'],
    queryFn: async (): Promise<Revision[]> => {
      const response = await api.get('/admin/economics/policies')
      return response.data?.data ?? []
    },
  })

  const previewQuery = useQuery({
    queryKey: ['economics-policy-preview', selectedId],
    enabled: Boolean(selectedId),
    queryFn: async (): Promise<Preview> => {
      const response = await api.get(`/admin/economics/policies/${selectedId}/preview`)
      return response.data?.data ?? {}
    },
  })

  const createMutation = useMutation({
    mutationFn: async () => {
      let payload: Record<string, unknown>
      try {
        payload = JSON.parse(payloadText)
      } catch {
        throw new Error('Payload policy harus berupa JSON valid')
      }
      const response = await api.post('/admin/economics/policies', {
        policy_type: policyType,
        market_code: marketCode,
        service_code: serviceCode,
        policy_version: policyVersion,
        business_reason: businessReason,
        payload,
      }, { headers: { 'X-Idempotency-Key': idempotencyKey() } })
      return response.data
    },
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['economics-policy-revisions'] })
      setSelectedId(response.data?.id ?? null)
      setBusinessReason('')
      toast.success('Draft economics policy tersimpan')
    },
    onError: (error: any) => toast.error(errorMessage(error, 'Draft policy gagal disimpan')),
  })

  const actionMutation = useMutation({
    mutationFn: async ({ id, action, body }: { id: string; action: string; body?: Record<string, string> }) => {
      const response = await api.post(`/admin/economics/policies/${id}/${action}`, body ?? {}, {
        headers: { 'X-Idempotency-Key': idempotencyKey() },
      })
      return response.data
    },
    onSuccess: (_response, variables) => {
      queryClient.invalidateQueries({ queryKey: ['economics-policy-revisions'] })
      queryClient.invalidateQueries({ queryKey: ['economics-policy-preview', variables.id] })
      toast.success(`Policy ${variables.action} berhasil`)
      if (variables.action === 'rollback') setRollbackReason('')
    },
    onError: (error: any) => toast.error(errorMessage(error, 'Aksi economics policy gagal')),
  })

  const selected = useMemo(() => revisionsQuery.data?.find((item) => item.id === selectedId), [revisionsQuery.data, selectedId])

  const submitDraft = () => {
    if (!businessReason.trim()) {
      toast.error('Business reason wajib diisi')
      return
    }
    createMutation.mutate()
  }

  return (
    <div className="space-y-8 animate-in">
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black text-foreground-muted tracking-tight flex items-center gap-3">
            <ShieldCheck size={28} className="text-primary-light" aria-hidden="true" />
            Economics Control Plane
          </h1>
          <p className="text-foreground-muted mt-1">Draft → preview/simulate → maker-checker approval → publish atau rollback.</p>
        </div>
        <button type="button" onClick={() => revisionsQuery.refetch()} className="inline-flex items-center gap-2 px-4 py-3 rounded-2xl bg-surface-subtle border border-border text-xs font-black uppercase tracking-widest text-foreground-muted">
          <RefreshCw size={15} aria-hidden="true" /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_1.4fr] gap-8 items-start">
        <section className="glass-card rounded-[40px] border-border p-8 space-y-6">
          <div>
            <h2 className="text-lg font-black text-foreground-muted">New policy draft</h2>
            <p className="text-xs text-foreground-muted mt-1">Publish hanya tersedia untuk super_admin dan selalu menyimpan snapshot rollback.</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <label className="text-xs font-bold text-foreground-muted">Type
              <select value={policyType} onChange={(event) => setPolicyType(event.target.value as 'pricing' | 'surge')} className="mt-2 w-full bg-surface-subtle border border-border rounded-xl p-3 text-foreground-muted">
                <option value="pricing">Pricing</option><option value="surge">Surge</option>
              </select>
            </label>
            <label className="text-xs font-bold text-foreground-muted">Market code
              <input value={marketCode} onChange={(event) => setMarketCode(event.target.value)} className="mt-2 w-full bg-surface-subtle border border-border rounded-xl p-3 text-foreground-muted" />
            </label>
            <label className="text-xs font-bold text-foreground-muted">Service code
              <input value={serviceCode} onChange={(event) => setServiceCode(event.target.value)} className="mt-2 w-full bg-surface-subtle border border-border rounded-xl p-3 text-foreground-muted" />
            </label>
            <label className="text-xs font-bold text-foreground-muted">Policy version
              <input value={policyVersion} onChange={(event) => setPolicyVersion(event.target.value)} className="mt-2 w-full bg-surface-subtle border border-border rounded-xl p-3 text-foreground-muted" />
            </label>
          </div>
          <label className="block text-xs font-bold text-foreground-muted">Business reason
            <textarea value={businessReason} onChange={(event) => setBusinessReason(event.target.value)} rows={3} placeholder="Mengapa policy ini diubah?" className="mt-2 w-full bg-surface-subtle border border-border rounded-xl p-3 text-foreground-muted placeholder:text-foreground-muted" />
          </label>
          <label className="block text-xs font-bold text-foreground-muted">Policy payload (JSON)
            <textarea value={payloadText} onChange={(event) => setPayloadText(event.target.value)} rows={12} spellCheck={false} className="mt-2 w-full bg-surface-subtle border border-border rounded-xl p-3 text-xs font-mono text-foreground-muted" />
          </label>
          <button type="button" onClick={submitDraft} disabled={createMutation.isPending} className="w-full inline-flex justify-center items-center gap-2 px-5 py-3 rounded-xl bg-primary text-on-primary text-xs font-black uppercase tracking-widest disabled:opacity-60">
            {createMutation.isPending ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Send size={15} aria-hidden="true" />} Save draft
          </button>
        </section>

        <section className="space-y-6">
          <div className="glass-card rounded-[40px] border-border overflow-hidden">
            <div className="px-8 py-6 border-b border-border flex items-center justify-between"><h2 className="text-lg font-black text-foreground-muted">Revision workflow</h2><span className="text-xs text-foreground-muted">{revisionsQuery.data?.length ?? 0} revisions</span></div>
            {revisionsQuery.isError ? <div className="p-10 text-center text-sm text-error"><AlertCircle className="mx-auto mb-3"  aria-hidden="true"/>Gagal memuat revision policy.</div> : revisionsQuery.isLoading ? <div className="p-10 text-center"><Loader2 className="mx-auto animate-spin text-primary" aria-hidden="true" /></div> : (revisionsQuery.data?.length ?? 0) === 0 ? <div className="p-10 text-center text-sm text-foreground-muted">Belum ada draft policy.</div> : (
              <div className="divide-y divide-border">
                {revisionsQuery.data?.map((revision) => (
                  <div key={revision.id} className={`p-6 space-y-4 ${selectedId === revision.id ? 'bg-primary/5' : ''}`}>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div><p className="font-black text-foreground-muted">{revision.policy_type} · {revision.service_code}</p><p className="text-[11px] font-mono text-foreground-muted">{revision.policy_version} · {revision.market_code}</p></div>
                      <StatusBadge status={revision.status} labelPrefix="Policy revision status" className="rounded-lg" />
                    </div>
                    <p className="text-xs text-foreground-muted">{revision.business_reason}</p>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => setSelectedId(revision.id)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-surface-subtle text-[10px] font-black uppercase tracking-widest text-foreground-muted"><Eye size={13} aria-hidden="true" /> Preview</button>
                      {(revision.status === 'draft' || revision.status === 'approved') && <button type="button" onClick={() => { setSelectedId(revision.id); actionMutation.mutate({ id: revision.id, action: 'simulate' }) }} disabled={actionMutation.isPending} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-info-surface text-[10px] font-black uppercase tracking-widest text-info"><Play size={13} aria-hidden="true" /> Simulate</button>}
                      {revision.status === 'draft' && <button type="button" onClick={() => actionMutation.mutate({ id: revision.id, action: 'approve' })} disabled={actionMutation.isPending} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-success-surface text-[10px] font-black uppercase tracking-widest text-success"><CheckCircle2 size={13} aria-hidden="true" /> Approve</button>}
                      {revision.status === 'approved' && <button type="button" onClick={() => actionMutation.mutate({ id: revision.id, action: 'publish' })} disabled={actionMutation.isPending} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary/15 text-[10px] font-black uppercase tracking-widest text-primary-light"><Send size={13} aria-hidden="true" /> Publish</button>}
                      {revision.status === 'published' && <button type="button" onClick={() => setSelectedId(revision.id)} disabled={actionMutation.isPending} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-warning-surface text-[10px] font-black uppercase tracking-widest text-warning disabled:opacity-60"><RotateCcw size={13} aria-hidden="true" /> Rollback</button>}
                    </div>
                    {revision.status === 'published' && selectedId === revision.id && <input value={rollbackReason} onChange={(event) => setRollbackReason(event.target.value)} placeholder="Business reason rollback" className="w-full bg-surface-subtle border border-border rounded-lg p-2.5 text-xs text-foreground-muted" />}
                    {revision.status === 'published' && selectedId === revision.id && rollbackReason.trim() && <button type="button" onClick={() => actionMutation.mutate({ id: revision.id, action: 'rollback', body: { business_reason: rollbackReason } })} className="text-[10px] text-warning underline">Konfirmasi rollback {revision.policy_version}</button>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {selected && <div className="glass-card rounded-[40px] border-border p-8 space-y-6">
            <div className="flex items-center justify-between"><div><h2 className="text-lg font-black text-foreground-muted">Preview & simulation</h2><p className="text-xs text-foreground-muted mt-1">{selected.runtime_config_key}</p></div><button type="button" onClick={() => previewQuery.refetch()} aria-label="Refresh economics preview" title="Refresh economics preview" className="text-foreground-muted hover:text-foreground"><Play size={18} aria-hidden="true" /></button></div>
            {previewQuery.isLoading ? <Loader2 className="animate-spin text-primary" aria-hidden="true" /> : previewQuery.isError ? <p className="text-sm text-error">Preview gagal dimuat.</p> : <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-surface-subtle rounded-xl p-3"><p className="text-[10px] uppercase text-foreground-muted">Market</p><p className="font-black text-foreground-muted">{previewQuery.data?.affected_scope?.market_codes.join(', ')}</p></div>
                <div className="bg-surface-subtle rounded-xl p-3"><p className="text-[10px] uppercase text-foreground-muted">Zone</p><p className="font-black text-foreground-muted">{previewQuery.data?.affected_scope?.zone_ids.length ? 'Scoped' : 'Global'}</p></div>
                <div className="bg-surface-subtle rounded-xl p-3"><p className="text-[10px] uppercase text-foreground-muted">Service</p><p className="font-black text-foreground-muted">{previewQuery.data?.affected_scope?.service_codes.join(', ')}</p></div>
                <div className="bg-surface-subtle rounded-xl p-3"><p className="text-[10px] uppercase text-foreground-muted">Active orders</p><p className="font-black text-foreground-muted">{previewQuery.data?.affected_scope?.active_order_count ?? 0}</p></div>
              </div>
              <div><p className="text-xs font-black uppercase tracking-widest text-foreground-muted mb-3">Example quotes</p><p className="text-xs text-foreground-muted mb-3">{previewQuery.data?.example_quotes?.label}</p><div className="space-y-2">{previewQuery.data?.example_quotes?.candidate_quotes.map((quote) => <div key={quote.distance_km} className="flex justify-between bg-surface-subtle rounded-xl p-3 text-xs"><span className="text-foreground-muted">{quote.distance_km} km · x{quote.applied_multiplier}</span><span className="font-black text-foreground-muted">{formatIdr(quote.candidate_quote_idr)}</span></div>)}</div></div>
              <div className="flex items-center gap-2 text-xs text-success"><ShieldCheck size={15} aria-hidden="true" /> Protected floor/ceiling divalidasi server-side sebelum approve/publish.</div>
            </>}
          </div>}
        </section>
      </div>
    </div>
  )
}
