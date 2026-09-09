import { useMemo, useState } from 'react'
import { Languages, Plus, RefreshCw, Send, ShieldCheck } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '../lib/api'

type Surface = 'customer_android' | 'customer_web' | 'merchant_android' | 'courier_android'
type ContentKind = 'marketing' | 'banner' | 'help'
type ContentState = 'draft' | 'published' | 'superseded' | 'rolled_back'

type ContentPack = {
  id: string
  market_code: string
  surface: Surface
  pack_key: string
  content_kind: ContentKind
  locale: string
  value: string
  revision: number
  state: ContentState
  effective_from: string
  effective_to: string | null
  content_checksum: string
}

type FormState = {
  market_code: string
  surface: Surface
  pack_key: string
  content_kind: ContentKind
  locale: string
  value: string
  effective_from: string
  effective_to: string
}

const inputClass = 'mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-zinc-100 outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/20'
const maxLength: Record<ContentKind, number> = { marketing: 500, banner: 320, help: 700 }
const surfaces: Array<[Surface, string]> = [
  ['customer_android', 'Customer Android'],
  ['customer_web', 'Customer Web'],
  ['merchant_android', 'Merchant Android'],
  ['courier_android', 'Courier Android'],
]

const newForm = (): FormState => ({
  market_code: 'id-jk',
  surface: 'customer_web',
  pack_key: 'home.banner.title',
  content_kind: 'banner',
  locale: 'id-ID',
  value: '',
  effective_from: '',
  effective_to: '',
})

const requestKey = (action: string) => `admin.localized_content.${action}.${typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`}`

const errorMessage = (error: unknown) => {
  const response = error as { response?: { data?: { message?: unknown } } }
  return typeof response.response?.data?.message === 'string' ? response.response.data.message : 'Localized content operation failed'
}

export default function LocalizedContentPacks() {
  const queryClient = useQueryClient()
  const [form, setForm] = useState<FormState>(newForm)
  const [showForm, setShowForm] = useState(true)
  const limit = maxLength[form.content_kind]
  const query = useQuery({
    queryKey: ['localized-content-packs'],
    queryFn: async (): Promise<ContentPack[]> => (await api.get('/admin/content-packs')).data?.data ?? [],
  })

  const createMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        ...form,
        market_code: form.market_code.trim().toLowerCase(),
        pack_key: form.pack_key.trim().toLowerCase(),
        locale: form.locale.trim(),
        value: form.value.trim(),
        ...(form.effective_from ? { effective_from: new Date(form.effective_from).toISOString() } : {}),
        effective_to: form.effective_to ? new Date(form.effective_to).toISOString() : null,
      }
      return api.post('/admin/content-packs', payload, { headers: { 'X-Idempotency-Key': requestKey('create') } })
    },
    onSuccess: () => {
      setForm(newForm())
      queryClient.invalidateQueries({ queryKey: ['localized-content-packs'] })
      toast.success('Localized content draft created')
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  const publishMutation = useMutation({
    mutationFn: (id: string) => api.post(`/admin/content-packs/${id}/publish`, {}, { headers: { 'X-Idempotency-Key': requestKey('publish') } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['localized-content-packs'] })
      toast.success('Localized content published')
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  const sorted = useMemo(() => [...(query.data ?? [])].sort((a, b) => `${a.pack_key}:${a.locale}:${b.revision}`.localeCompare(`${b.pack_key}:${b.locale}:${a.revision}`)), [query.data])

  const handleUseAsRevision = (record: ContentPack) => {
    setForm({
      market_code: record.market_code,
      surface: record.surface,
      pack_key: record.pack_key,
      content_kind: record.content_kind,
      locale: record.locale,
      value: record.value,
      effective_from: '',
      effective_to: '',
    })
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className="space-y-6 p-6 lg:p-8">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-3"><Languages className="text-primary-light" size={26} /><h1 className="text-3xl font-black tracking-tight text-zinc-100">Localized Content Packs</h1></div>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-zinc-500">Publish bounded marketing, banner, and help copy per locale without an app release. Legal, financial, consent, and transaction copy must use the approved market/compliance document path.</p>
        </div>
        <button type="button" onClick={() => query.refetch()} className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 px-4 py-3 text-xs font-black uppercase tracking-widest text-zinc-300"><RefreshCw size={14} /> Refresh</button>
      </header>

      {showForm ? <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 shadow-xl shadow-black/10" aria-labelledby="localized-content-editor-title">
        <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary-light">Draft → publish</p><h2 id="localized-content-editor-title" className="mt-1 text-xl font-black text-zinc-100">Create a locale revision</h2></div><ShieldCheck className="text-emerald-400" size={20} /></div>
        <div className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <label className="text-xs font-bold text-zinc-400">Market code<input className={inputClass} value={form.market_code} onChange={(event) => setForm({ ...form, market_code: event.target.value })} /></label>
          <label className="text-xs font-bold text-zinc-400">Surface<select className={inputClass} value={form.surface} onChange={(event) => setForm({ ...form, surface: event.target.value as Surface })}>{surfaces.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="text-xs font-bold text-zinc-400">Locale<input className={inputClass} value={form.locale} onChange={(event) => setForm({ ...form, locale: event.target.value })} placeholder="id-ID" /></label>
          <label className="text-xs font-bold text-zinc-400">Content kind<select className={inputClass} value={form.content_kind} onChange={(event) => setForm({ ...form, content_kind: event.target.value as ContentKind })}><option value="marketing">Marketing</option><option value="banner">Banner</option><option value="help">Help</option></select></label>
          <label className="text-xs font-bold text-zinc-400 md:col-span-2 lg:col-span-4">Pack key<input className={inputClass} value={form.pack_key} onChange={(event) => setForm({ ...form, pack_key: event.target.value })} placeholder="home.banner.title" /><span className="mt-1 block text-[11px] font-normal text-zinc-600">Use this key in an experience section&apos;s localized copy reference. Protected legal/financial/consent keys are rejected.</span></label>
          <label className="text-xs font-bold text-zinc-400 md:col-span-2 lg:col-span-4">Copy<textarea className={`${inputClass} min-h-24 resize-y`} value={form.value} maxLength={limit} onChange={(event) => setForm({ ...form, value: event.target.value })} /><span className={`mt-1 block text-right text-[11px] font-normal ${form.value.length > limit ? 'text-red-300' : 'text-zinc-600'}`}>{form.value.length}/{limit}</span></label>
          <label className="text-xs font-bold text-zinc-400">Effective from<input type="datetime-local" className={inputClass} value={form.effective_from} onChange={(event) => setForm({ ...form, effective_from: event.target.value })} /></label>
          <label className="text-xs font-bold text-zinc-400">Effective to<input type="datetime-local" className={inputClass} value={form.effective_to} onChange={(event) => setForm({ ...form, effective_to: event.target.value })} /></label>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-3"><button type="button" disabled={createMutation.isPending || !form.value.trim() || form.value.length > limit} onClick={() => createMutation.mutate()} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-3 text-xs font-black uppercase tracking-widest text-white disabled:opacity-50"><Plus size={14} /> {createMutation.isPending ? 'Saving...' : 'Save draft'}</button><p className="text-xs text-zinc-500">Publishing is TOTP-protected and creates an immutable revision.</p></div>
      </section> : null}

      <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-5" aria-labelledby="localized-content-list-title">
        <div className="flex items-center justify-between gap-3"><div><h2 id="localized-content-list-title" className="text-lg font-black text-zinc-100">Revision history</h2><p className="mt-1 text-xs text-zinc-500">Fallback order: requested locale → language → market default → language → id-ID.</p></div><button type="button" onClick={() => { setForm(newForm()); setShowForm(true) }} className="inline-flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-primary-light"><Plus size={14} /> New revision</button></div>
        {query.isLoading ? <p className="mt-5 text-sm text-zinc-500">Loading content packs...</p> : null}
        {query.isError ? <p className="mt-5 text-sm text-red-300">Content pack list failed to load.</p> : null}
        <div className="mt-5 space-y-3">{sorted.map((record) => <article key={record.id} className="rounded-2xl border border-white/10 bg-black/10 p-4"><div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="font-mono text-xs text-primary-light">{record.pack_key}</span><span className="rounded-full bg-white/10 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-zinc-400">{record.locale}</span><span className="rounded-full bg-white/10 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-zinc-400">{record.surface}</span><span className={`rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-widest ${record.state === 'published' ? 'bg-emerald-500/10 text-emerald-300' : record.state === 'draft' ? 'bg-amber-500/10 text-amber-200' : 'bg-zinc-800 text-zinc-500'}`}>{record.state}</span><span className="text-[10px] text-zinc-500">r{record.revision}</span></div><p className="mt-3 break-words text-sm text-zinc-200">{record.value}</p><p className="mt-2 text-[10px] text-zinc-600">{record.content_kind} · checksum {record.content_checksum.slice(0, 12)}…</p></div><div className="flex shrink-0 flex-wrap gap-2">{record.state === 'draft' ? <button type="button" disabled={publishMutation.isPending} onClick={() => publishMutation.mutate(record.id)} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white disabled:opacity-50"><Send size={13} /> Publish</button> : null}<button type="button" onClick={() => handleUseAsRevision(record)} className="rounded-xl border border-white/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-zinc-400">Use as revision</button></div></div></article>)}</div>
        {!query.isLoading && sorted.length === 0 ? <div className="mt-5 rounded-2xl border border-dashed border-white/10 p-6 text-center text-sm text-zinc-600">No localized content revisions yet.</div> : null}
      </section>
    </div>
  )
}
