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
          <h1 className="text-3xl font-black text-zinc-100 tracking-tight flex items-center gap-3">
            <ShieldCheck size={28} className="text-primary-light" />
            Economics Control Plane
          </h1>
          <p className="text-zinc-500 mt-1">Draft → preview/simulate → maker-checker approval → publish atau rollback.</p>
        </div>
        <button type="button" onClick={() => revisionsQuery.refetch()} className="inline-flex items-center gap-2 px-4 py-3 rounded-2xl bg-white/5 border border-white/10 text-xs font-black uppercase tracking-widest text-zinc-300">
          <RefreshCw size={15} /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_1.4fr] gap-8 items-start">
        <section className="glass-card rounded-[40px] border-white/5 p-8 space-y-6">
          <div>
            <h2 className="text-lg font-black text-zinc-100">New policy draft</h2>
            <p className="text-xs text-zinc-500 mt-1">Publish hanya tersedia untuk super_admin dan selalu menyimpan snapshot rollback.</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <label className="text-xs font-bold text-zinc-500">Type
              <select value={policyType} onChange={(event) => setPolicyType(event.target.value as 'pricing' | 'surge')} className="mt-2 w-full bg-white/5 border border-white/10 rounded-xl p-3 text-zinc-200">
                <option value="pricing">Pricing</option><option value="surge">Surge</option>
              </select>
            </label>
            <label className="text-xs font-bold text-zinc-500">Market code
              <input value={marketCode} onChange={(event) => setMarketCode(event.target.value)} className="mt-2 w-full bg-white/5 border border-white/10 rounded-xl p-3 text-zinc-200" />
            </label>
            <label className="text-xs font-bold text-zinc-500">Service code
              <input value={serviceCode} onChange={(event) => setServiceCode(event.target.value)} className="mt-2 w-full bg-white/5 border border-white/10 rounded-xl p-3 text-zinc-200" />
            </label>
            <label className="text-xs font-bold text-zinc-500">Policy version
              <input value={policyVersion} onChange={(event) => setPolicyVersion(event.target.value)} className="mt-2 w-full bg-white/5 border border-white/10 rounded-xl p-3 text-zinc-200" />
            </label>
          </div>
          <label className="block text-xs font-bold text-zinc-500">Business reason
            <textarea value={businessReason} onChange={(event) => setBusinessReason(event.target.value)} rows={3} placeholder="Mengapa policy ini diubah?" className="mt-2 w-full bg-white/5 border border-white/10 rounded-xl p-3 text-zinc-200 placeholder:text-zinc-700" />
          </label>
          <label className="block text-xs font-bold text-zinc-500">Policy payload (JSON)
            <textarea value={payloadText} onChange={(event) => setPayloadText(event.target.value)} rows={12} spellCheck={false} className="mt-2 w-full bg-black/20 border border-white/10 rounded-xl p-3 text-xs font-mono text-zinc-200" />
          </label>
          <button type="button" onClick={submitDraft} disabled={createMutation.isPending} className="w-full inline-flex justify-center items-center gap-2 px-5 py-3 rounded-xl bg-primary text-white text-xs font-black uppercase tracking-widest disabled:opacity-50">
            {createMutation.isPending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Save draft
          </button>
        </section>

        <section className="space-y-6">
          <div className="glass-card rounded-[40px] border-white/5 overflow-hidden">
            <div className="px-8 py-6 border-b border-white/5 flex items-center justify-between"><h2 className="text-lg font-black text-zinc-100">Revision workflow</h2><span className="text-xs text-zinc-500">{revisionsQuery.data?.length ?? 0} revisions</span></div>
            {revisionsQuery.isError ? <div className="p-10 text-center text-sm text-red-300"><AlertCircle className="mx-auto mb-3" />Gagal memuat revision policy.</div> : revisionsQuery.isLoading ? <div className="p-10 text-center"><Loader2 className="mx-auto animate-spin text-primary" /></div> : (revisionsQuery.data?.length ?? 0) === 0 ? <div className="p-10 text-center text-sm text-zinc-500">Belum ada draft policy.</div> : (
              <div className="divide-y divide-white/5">
                {revisionsQuery.data?.map((revision) => (
                  <div key={revision.id} className={`p-6 space-y-4 ${selectedId === revision.id ? 'bg-primary/5' : ''}`}>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div><p className="font-black text-zinc-100">{revision.policy_type} · {revision.service_code}</p><p className="text-[11px] font-mono text-zinc-500">{revision.policy_version} · {revision.market_code}</p></div>
                      <span className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-widest text-zinc-300">{revision.status}</span>
                    </div>
                    <p className="text-xs text-zinc-400">{revision.business_reason}</p>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => setSelectedId(revision.id)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/5 text-[10px] font-black uppercase tracking-widest text-zinc-300"><Eye size={13} /> Preview</button>
                      {(revision.status === 'draft' || revision.status === 'approved') && <button type="button" onClick={() => { setSelectedId(revision.id); actionMutation.mutate({ id: revision.id, action: 'simulate' }) }} disabled={actionMutation.isPending} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-sky-500/10 text-[10px] font-black uppercase tracking-widest text-sky-300"><Play size={13} /> Simulate</button>}
                      {revision.status === 'draft' && <button type="button" onClick={() => actionMutation.mutate({ id: revision.id, action: 'approve' })} disabled={actionMutation.isPending} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-500/10 text-[10px] font-black uppercase tracking-widest text-emerald-300"><CheckCircle2 size={13} /> Approve</button>}
                      {revision.status === 'approved' && <button type="button" onClick={() => actionMutation.mutate({ id: revision.id, action: 'publish' })} disabled={actionMutation.isPending} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary/15 text-[10px] font-black uppercase tracking-widest text-primary-light"><Send size={13} /> Publish</button>}
                      {revision.status === 'published' && <button type="button" onClick={() => setSelectedId(revision.id)} disabled={actionMutation.isPending} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-500/10 text-[10px] font-black uppercase tracking-widest text-amber-300 disabled:opacity-40"><RotateCcw size={13} /> Rollback</button>}
                    </div>
                    {revision.status === 'published' && selectedId === revision.id && <input value={rollbackReason} onChange={(event) => setRollbackReason(event.target.value)} placeholder="Business reason rollback" className="w-full bg-white/5 border border-white/10 rounded-lg p-2.5 text-xs text-zinc-200" />}
                    {revision.status === 'published' && selectedId === revision.id && rollbackReason.trim() && <button type="button" onClick={() => actionMutation.mutate({ id: revision.id, action: 'rollback', body: { business_reason: rollbackReason } })} className="text-[10px] text-amber-300 underline">Konfirmasi rollback {revision.policy_version}</button>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {selected && <div className="glass-card rounded-[40px] border-white/5 p-8 space-y-6">
            <div className="flex items-center justify-between"><div><h2 className="text-lg font-black text-zinc-100">Preview & simulation</h2><p className="text-xs text-zinc-500 mt-1">{selected.runtime_config_key}</p></div><button type="button" onClick={() => previewQuery.refetch()} className="text-zinc-400 hover:text-white"><Play size={18} /></button></div>
            {previewQuery.isLoading ? <Loader2 className="animate-spin text-primary" /> : previewQuery.isError ? <p className="text-sm text-red-300">Preview gagal dimuat.</p> : <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-white/5 rounded-xl p-3"><p className="text-[10px] uppercase text-zinc-500">Market</p><p className="font-black text-zinc-200">{previewQuery.data?.affected_scope?.market_codes.join(', ')}</p></div>
                <div className="bg-white/5 rounded-xl p-3"><p className="text-[10px] uppercase text-zinc-500">Zone</p><p className="font-black text-zinc-200">{previewQuery.data?.affected_scope?.zone_ids.length ? 'Scoped' : 'Global'}</p></div>
                <div className="bg-white/5 rounded-xl p-3"><p className="text-[10px] uppercase text-zinc-500">Service</p><p className="font-black text-zinc-200">{previewQuery.data?.affected_scope?.service_codes.join(', ')}</p></div>
                <div className="bg-white/5 rounded-xl p-3"><p className="text-[10px] uppercase text-zinc-500">Active orders</p><p className="font-black text-zinc-200">{previewQuery.data?.affected_scope?.active_order_count ?? 0}</p></div>
              </div>
              <div><p className="text-xs font-black uppercase tracking-widest text-zinc-500 mb-3">Example quotes</p><p className="text-xs text-zinc-500 mb-3">{previewQuery.data?.example_quotes?.label}</p><div className="space-y-2">{previewQuery.data?.example_quotes?.candidate_quotes.map((quote) => <div key={quote.distance_km} className="flex justify-between bg-white/5 rounded-xl p-3 text-xs"><span className="text-zinc-400">{quote.distance_km} km · x{quote.applied_multiplier}</span><span className="font-black text-zinc-200">{formatIdr(quote.candidate_quote_idr)}</span></div>)}</div></div>
              <div className="flex items-center gap-2 text-xs text-emerald-300"><ShieldCheck size={15} /> Protected floor/ceiling divalidasi server-side sebelum approve/publish.</div>
            </>}
          </div>}
        </section>
      </div>
    </div>
  )
}
