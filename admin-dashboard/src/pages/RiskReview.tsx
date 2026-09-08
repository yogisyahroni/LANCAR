import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, RefreshCw, ShieldAlert, UserRound } from 'lucide-react'
import { api } from '../lib/api'
import { toast } from 'sonner'

const decisions = ['ALLOW', 'CHALLENGE', 'REVIEW', 'HOLD', 'BLOCK'] as const
type RiskDecision = typeof decisions[number]

const decisionStyle: Record<string, string> = {
  ALLOW: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  CHALLENGE: 'border-sky-500/30 bg-sky-500/10 text-sky-300',
  REVIEW: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  HOLD: 'border-orange-500/30 bg-orange-500/10 text-orange-300',
  BLOCK: 'border-red-500/30 bg-red-500/10 text-red-300',
}

const idempotencyKey = (id: string) => `risk-review-${id}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`

type RiskReview = {
  id: string
  risk_decision_id: string
  review_status: string
  review_evidence: { signal_count?: number; reason_codes?: string[] }
  reviewer_id?: string | null
  manual_decision?: RiskDecision | null
  manual_reason?: string | null
  reviewed_at?: string | null
  created_at: string
  operation: string
  market_code: string
  entity_type: string
  entity_id: string
  decision: RiskDecision
  risk_score: number
  reason_codes: string[]
  policy_version: string
  failure_mode: string
  correlation_id?: string | null
}

const formatDate = (value?: string | null) => value ? new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '-'

export default function RiskReview() {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState('PENDING')
  const [drafts, setDrafts] = useState<Record<string, { decision: RiskDecision; reason: string; summary: string }>>({})
  const reviewsQuery = useQuery({
    queryKey: ['risk-reviews', status],
    queryFn: async (): Promise<RiskReview[]> => (await api.get('/admin/risk/reviews', { params: { status } })).data.data || [],
    refetchInterval: 30_000,
  })

  const resolveMutation = useMutation({
    mutationFn: async ({ review, draft }: { review: RiskReview; draft: { decision: RiskDecision; reason: string; summary: string } }) => {
      if (!draft.reason.trim() || !draft.summary.trim()) throw new Error('Reason dan ringkasan evidence wajib diisi')
      return api.post(`/admin/risk/reviews/${review.id}/resolve`, {
        decision: draft.decision,
        reason: draft.reason.trim(),
        evidence: { summary: draft.summary.trim(), source: 'admin_review', references: [review.risk_decision_id] },
      }, { headers: { 'X-Idempotency-Key': idempotencyKey(review.id) } })
    },
    onSuccess: () => {
      toast.success('Risk review diselesaikan dan diaudit')
      queryClient.invalidateQueries({ queryKey: ['risk-reviews'] })
    },
    onError: (error: any) => toast.error(error.response?.data?.error || error.message || 'Risk review gagal disimpan'),
  })

  const reviews = reviewsQuery.data || []
  const updateDraft = (id: string, patch: Partial<{ decision: RiskDecision; reason: string; summary: string }>) => {
    setDrafts((current) => ({
      ...current,
      [id]: { decision: current[id]?.decision || 'ALLOW', reason: current[id]?.reason || '', summary: current[id]?.summary || '', ...patch },
    }))
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.32em] text-primary-light">Trust &amp; Safety Control</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-zinc-100">Risk Review Queue</h1>
          <p className="mt-2 max-w-3xl text-sm text-zinc-500">Keputusan risiko terpusat dengan reason code, policy version, evidence, reviewer, dan fail-mode yang terlihat jelas.</p>
        </div>
        <button type="button" onClick={() => reviewsQuery.refetch()} className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-xs font-black uppercase tracking-widest text-zinc-200 hover:bg-white/10">
          <RefreshCw className={`h-4 w-4 ${reviewsQuery.isFetching ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      <div className="flex gap-2">
        {(['PENDING', 'RESOLVED', 'ALL'] as const).map((item) => (
          <button key={item} type="button" onClick={() => setStatus(item === 'ALL' ? '' : item)} className={`rounded-full px-4 py-2 text-xs font-black ${status === (item === 'ALL' ? '' : item) ? 'bg-primary text-white' : 'bg-white/5 text-zinc-400 hover:bg-white/10'}`}>{item}</button>
        ))}
      </div>

      <div className="grid gap-5">
        {reviewsQuery.isLoading ? <div className="h-48 animate-pulse rounded-[32px] bg-white/[0.04]" /> : reviews.length === 0 ? (
          <div className="rounded-[32px] border border-dashed border-white/10 p-12 text-center text-sm text-zinc-500">Tidak ada risk review pada filter ini.</div>
        ) : reviews.map((review) => {
          const draft = drafts[review.id] || { decision: 'ALLOW' as RiskDecision, reason: '', summary: '' }
          const pending = review.review_status === 'PENDING'
          return (
            <section key={review.id} className="rounded-[32px] border border-white/10 bg-zinc-950/70 p-6 shadow-xl shadow-black/10">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-3 text-amber-300"><ShieldAlert className="h-5 w-5" /></div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-black text-zinc-100">{review.operation}</h2>
                      <span className={`rounded-full border px-2 py-1 text-[10px] font-black tracking-widest ${decisionStyle[review.decision] || decisionStyle.REVIEW}`}>{review.decision}</span>
                      <span className="rounded-full border border-white/10 px-2 py-1 text-[10px] font-black tracking-widest text-zinc-400">{review.review_status}</span>
                    </div>
                    <p className="mt-2 text-xs text-zinc-500">{review.entity_type} · {review.entity_id} · {review.market_code} · {formatDate(review.created_at)}</p>
                  </div>
                </div>
                <div className="text-right text-xs text-zinc-500"><p>Score <span className="font-black text-zinc-200">{Number(review.risk_score).toFixed(1)}</span></p><p className="mt-1">Policy {review.policy_version}</p></div>
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-3">
                <div className="rounded-2xl bg-white/[0.04] p-4"><p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Reason codes</p><p className="mt-2 text-xs leading-5 text-zinc-300">{review.reason_codes?.join(', ') || '-'}</p></div>
                <div className="rounded-2xl bg-white/[0.04] p-4"><p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Failure mode</p><p className="mt-2 text-xs text-zinc-300">{review.failure_mode}</p></div>
                <div className="rounded-2xl bg-white/[0.04] p-4"><p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Evidence signals</p><p className="mt-2 text-xs text-zinc-300">{review.review_evidence?.signal_count ?? 0} coarse signals</p></div>
              </div>

              {pending ? <div className="mt-5 grid gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 md:grid-cols-[180px_1fr_1fr_auto] md:items-end">
                <label className="text-xs text-zinc-400">Decision<select value={draft.decision} onChange={(event) => updateDraft(review.id, { decision: event.target.value as RiskDecision })} className="mt-2 w-full rounded-xl border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-zinc-100">{decisions.map((item) => <option key={item}>{item}</option>)}</select></label>
                <label className="text-xs text-zinc-400">Reason<textarea value={draft.reason} onChange={(event) => updateDraft(review.id, { reason: event.target.value })} rows={2} placeholder="Alasan keputusan manual" className="mt-2 w-full rounded-xl border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-zinc-100" /></label>
                <label className="text-xs text-zinc-400">Evidence summary<textarea value={draft.summary} onChange={(event) => updateDraft(review.id, { summary: event.target.value })} rows={2} placeholder="Bukti non-rahasia / referensi kasus" className="mt-2 w-full rounded-xl border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-zinc-100" /></label>
                <button type="button" onClick={() => resolveMutation.mutate({ review, draft })} disabled={resolveMutation.isPending} className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-xs font-black text-white hover:opacity-90 disabled:opacity-50"><CheckCircle2 className="h-4 w-4" /> Resolve</button>
              </div> : <p className="mt-5 flex items-center gap-2 text-xs text-zinc-500"><UserRound className="h-4 w-4" /> Reviewed by {review.reviewer_id || 'admin'} · {formatDate(review.reviewed_at)} · {review.manual_reason || '-'}</p>}
            </section>
          )
        })}
      </div>
    </div>
  )
}

