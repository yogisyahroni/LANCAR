import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Globe2, Save, ShieldCheck, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '../lib/api'
import { AdminPageSkeleton } from '../components/ui/Skeleton'
import { useAuthStore } from '../store/useAuthStore'

type MarketConfig = {
  market_code: string
  country_code: string
  currency_code: string
  currency_minor_unit: number
  timezone: string
  display_locale: string
  required_vehicle_types: string[]
  required_document_types: string[]
  required_tax_profile: Record<string, unknown>
  required_payout_methods: string[]
  cross_border_supported: boolean
  policy_version: string
  is_active: boolean
  courier_count?: number
  reverification_count?: number
}

type Draft = Omit<MarketConfig, 'required_vehicle_types' | 'required_document_types' | 'required_payout_methods' | 'required_tax_profile'> & {
  required_vehicle_types: string
  required_document_types: string
  required_payout_methods: string
  required_tax_profile: string
}

type MarketChangeRequest = {
  id: string
  courier_profile_id: string
  courier_name?: string
  from_market_code: string
  target_market_code: string
  source_country_code?: string
  target_country_code?: string
  target_policy_version?: string
  status: string
  reason?: string | null
  requested_at: string
}

const toDraft = (config: MarketConfig): Draft => ({
  ...config,
  required_vehicle_types: (config.required_vehicle_types || []).join(', '),
  required_document_types: (config.required_document_types || []).join(', '),
  required_payout_methods: (config.required_payout_methods || []).join(', '),
  required_tax_profile: JSON.stringify(config.required_tax_profile || { required: false }),
})

const listValue = (value: string) => value.split(',').map((item) => item.trim().toLowerCase()).filter(Boolean)

export default function CourierMarketConfig() {
  const { user } = useAuthStore()
  const queryClient = useQueryClient()
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [newMarket, setNewMarket] = useState({ market_code: '', country_code: '', currency_code: '', currency_minor_unit: 0, timezone: 'UTC', display_locale: 'en-US', policy_version: 'courier-market-v1' })
  const { data, isLoading } = useQuery({
    queryKey: ['courier-market-configs'],
    queryFn: async () => (await api.get('/admin/courier-market-configs')).data.data as MarketConfig[],
  })
  const { data: changeRequests = [] } = useQuery({
    queryKey: ['courier-market-change-requests'],
    queryFn: async () => (await api.get('/admin/courier-market-change-requests?status=pending')).data.data as MarketChangeRequest[],
    enabled: ['super_admin', 'ops_admin', 'ops_security'].includes(user?.role || ''),
  })

  const canEdit = ['super_admin', 'ops_admin'].includes(user?.role || '')
  const canReview = ['super_admin', 'ops_admin', 'ops_security'].includes(user?.role || '')

  const updateMarket = useMutation({
    mutationFn: async (draft: Draft) => {
      let taxProfile: Record<string, unknown>
      try {
        taxProfile = JSON.parse(draft.required_tax_profile || '{}')
      } catch {
        throw new Error('JSON tax profile tidak valid')
      }
      return api.patch(`/admin/courier-market-configs/${draft.market_code}`, {
        ...draft,
        required_vehicle_types: listValue(draft.required_vehicle_types),
        required_document_types: listValue(draft.required_document_types),
        required_payout_methods: listValue(draft.required_payout_methods),
        required_tax_profile: taxProfile,
      }, { headers: { 'X-Idempotency-Key': `market-config-${draft.market_code}-${Date.now()}` } })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['courier-market-configs'] })
      toast.success('Policy market disimpan; courier yang terdampak akan diminta re-verifikasi.')
    },
    onError: (error: any) => toast.error(error.response?.data?.message || error.message || 'Gagal menyimpan policy market'),
  })

  const createMarket = useMutation({
    mutationFn: async () => api.post('/admin/courier-market-configs', {
      ...newMarket,
      required_vehicle_types: [],
      required_document_types: [],
      required_payout_methods: [],
      required_tax_profile: { required: false },
      cross_border_supported: false,
      is_active: true,
    }, { headers: { 'X-Idempotency-Key': `market-create-${newMarket.market_code}-${Date.now()}` } }),
    onSuccess: () => {
      setNewMarket({ market_code: '', country_code: '', currency_code: '', currency_minor_unit: 0, timezone: 'UTC', display_locale: 'en-US', policy_version: 'courier-market-v1' })
      queryClient.invalidateQueries({ queryKey: ['courier-market-configs'] })
      toast.success('Market baru berhasil dibuat; lengkapi policy requirement sebelum assignment.')
    },
    onError: (error: any) => toast.error(error.response?.data?.message || error.message || 'Gagal membuat market'),
  })

  const reviewRequest = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'approved' | 'rejected' }) => api.patch(`/admin/courier-market-change-requests/${id}`, { status }, { headers: { 'X-Idempotency-Key': `market-review-${id}-${status}-${Date.now()}` } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['courier-market-change-requests'] })
      queryClient.invalidateQueries({ queryKey: ['courier-market-configs'] })
      toast.success('Review market change tersimpan.')
    },
    onError: (error: any) => toast.error(error.response?.data?.message || error.message || 'Gagal mereview market change'),
  })

  const configs = data || []
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.32em] text-primary-light">Courier Compliance Ops</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-zinc-100">Market & Localization</h1>
          <p className="mt-2 max-w-3xl text-sm text-zinc-500">Atur kendaraan, dokumen, tax profile, payout method, currency, timezone, dan kebijakan cross-border. Perubahan requirement menaikkan kebutuhan re-verifikasi.</p>
        </div>
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-xs text-amber-200">Assignment market tidak bisa diubah langsung oleh courier.</div>
      </div>

      {isLoading ? <AdminPageSkeleton /> : (
        <>
          {canEdit && <section className="rounded-3xl border border-primary/20 bg-primary/5 p-5">
            <h2 className="text-lg font-black text-white">Tambah market</h2>
            <p className="mt-1 text-xs text-zinc-500">Market baru aktif tanpa assignment courier; vehicle, dokumen, tax, payout, dan verifikasi harus dikonfigurasi terlebih dahulu.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {(['market_code', 'country_code', 'currency_code', 'timezone', 'display_locale', 'policy_version'] as const).map((key) => (
                <label key={key} className="space-y-1"><span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">{key}</span><input className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-primary" value={newMarket[key]} onChange={(event) => setNewMarket((current) => ({ ...current, [key]: event.target.value }))} /></label>
              ))}
              <label className="space-y-1"><span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">currency minor unit</span><input className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-primary" type="number" min="0" max="3" value={newMarket.currency_minor_unit} onChange={(event) => setNewMarket((current) => ({ ...current, currency_minor_unit: Number(event.target.value) }))} /></label>
            </div>
            <button disabled={createMarket.isPending} onClick={() => createMarket.mutate()} className="mt-4 flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-black text-white disabled:opacity-50"><Globe2 className="h-4 w-4" /> {createMarket.isPending ? 'Membuat…' : 'Buat market'}</button>
          </section>}

          <div className="grid gap-5 lg:grid-cols-2">
          {configs.map((config) => {
            const draft = drafts[config.market_code] || toDraft(config)
            const update = (key: keyof Draft, value: string | number | boolean) => setDrafts((current) => ({ ...current, [config.market_code]: { ...draft, [key]: value } }))
            return (
              <section key={config.market_code} className="rounded-3xl border border-white/10 bg-zinc-900/60 p-5">
                <div className="mb-5 flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/15 text-primary-light"><Globe2 className="h-5 w-5" /></div>
                    <div>
                      <h2 className="text-xl font-black text-white">{config.market_code}</h2>
                      <p className="text-xs uppercase tracking-widest text-zinc-500">{config.country_code} · {config.courier_count || 0} courier · {config.reverification_count || 0} perlu reverify</p>
                    </div>
                  </div>
                  {canEdit && <button onClick={() => updateMarket.mutate(draft)} className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-black text-white hover:bg-primary-dark"><Save className="h-4 w-4" /> Simpan</button>}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {(['country_code', 'currency_code', 'currency_minor_unit', 'timezone', 'display_locale', 'policy_version'] as const).map((key) => (
                    <label key={key} className="space-y-1"><span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">{key}</span><input className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-primary" type={key === 'currency_minor_unit' ? 'number' : 'text'} value={draft[key]} onChange={(event) => update(key, key === 'currency_minor_unit' ? Number(event.target.value) : event.target.value)} /></label>
                  ))}
                  {(['required_vehicle_types', 'required_document_types', 'required_payout_methods'] as const).map((key) => (
                    <label key={key} className="space-y-1"><span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">{key.replaceAll('_', ' ')}</span><input className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-primary" placeholder="pisahkan dengan koma" value={draft[key]} onChange={(event) => update(key, event.target.value)} /></label>
                  ))}
                </div>
                <label className="mt-3 block space-y-1"><span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">required tax profile (JSON)</span><textarea className="min-h-20 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 font-mono text-xs text-zinc-100 outline-none focus:border-primary" value={draft.required_tax_profile} onChange={(event) => update('required_tax_profile', event.target.value)} /></label>
                <div className="mt-4 flex flex-wrap gap-4 text-sm text-zinc-300">
                  <label className="flex items-center gap-2"><input type="checkbox" checked={draft.cross_border_supported} onChange={(event) => update('cross_border_supported', event.target.checked)} /> Cross-border policy enabled</label>
                  <label className="flex items-center gap-2"><input type="checkbox" checked={draft.is_active} onChange={(event) => update('is_active', event.target.checked)} /> Market active</label>
                </div>
                <p className="mt-4 flex items-center gap-2 text-xs text-zinc-500"><ShieldCheck className="h-4 w-4 text-emerald-300" /> Cross-border enabled tidak otomatis memberi izin courier; tetap perlu decision per courier.</p>
              </section>
            )
          })}
          </div>

          <section className="rounded-3xl border border-white/10 bg-zinc-900/60 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><h2 className="text-xl font-black text-white">Pending market change requests</h2><p className="mt-1 text-xs text-zinc-500">Approval memindahkan assignment hanya setelah courier offline, tidak punya job aktif, dan target policy lulus verifikasi.</p></div>
              <span className="rounded-full bg-amber-500/15 px-3 py-1 text-xs font-bold text-amber-200">{changeRequests.length} pending</span>
            </div>
            <div className="mt-4 space-y-3">
              {changeRequests.length === 0 && <p className="rounded-2xl border border-dashed border-white/10 p-4 text-sm text-zinc-500">Tidak ada request menunggu review.</p>}
              {changeRequests.map((request) => <div key={request.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/20 p-4">
                <div><p className="font-bold text-zinc-100">{request.courier_name || request.courier_profile_id} · {request.from_market_code} → {request.target_market_code}</p><p className="mt-1 text-xs text-zinc-500">{request.reason || 'Tidak ada alasan tambahan'} · {new Date(request.requested_at).toLocaleString()}</p></div>
                {canReview && <div className="flex gap-2"><button onClick={() => reviewRequest.mutate({ id: request.id, status: 'approved' })} className="flex items-center gap-1 rounded-lg bg-emerald-500/15 px-3 py-2 text-xs font-bold text-emerald-200"><CheckCircle2 className="h-4 w-4" /> Approve</button><button onClick={() => reviewRequest.mutate({ id: request.id, status: 'rejected' })} className="flex items-center gap-1 rounded-lg bg-rose-500/15 px-3 py-2 text-xs font-bold text-rose-200"><XCircle className="h-4 w-4" /> Reject</button></div>}
              </div>)}
            </div>
          </section>
        </>
      )}
    </div>
  )
}
