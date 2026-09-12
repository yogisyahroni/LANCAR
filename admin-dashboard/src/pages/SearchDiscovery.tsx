import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, Plus, Search } from 'lucide-react'
import { api } from '../lib/api'
import { toast } from 'sonner'

type Synonym = { id?: string; term: string; canonical_term: string; kind: string; reviewed: boolean; active: boolean }
type MerchandisingRule = { id?: string; query_term: string; entity_id: string; action: string; reason: string; expires_at: string; reviewed: boolean; active: boolean }

const inputClass = 'bg-surface-subtle border border-border rounded-xl p-3'

export default function SearchDiscovery() {
  const client = useQueryClient()
  const [marketCode, setMarketCode] = useState('id-jk')
  const [locale, setLocale] = useState('id-ID')
  const [q, setQ] = useState('ayam geprk')
  const [draft, setDraft] = useState<Synonym>({ term: '', canonical_term: '', kind: 'synonym', reviewed: false, active: true })
  const [rule, setRule] = useState<MerchandisingRule>({ query_term: '', entity_id: '', action: 'boost', reason: '', expires_at: '', reviewed: false, active: true })

  const synonyms = useQuery({
    queryKey: ['search-synonyms', marketCode, locale],
    queryFn: async () => (await api.get('/admin/search/synonyms', { params: { market_code: marketCode, locale } })).data?.data ?? [],
  })
  const rules = useQuery({
    queryKey: ['search-merchandising', marketCode, locale],
    queryFn: async () => (await api.get('/admin/search/merchandising', { params: { market_code: marketCode, locale } })).data?.data ?? [],
  })
  const preview = useQuery({
    queryKey: ['search-preview', q, marketCode, locale],
    enabled: q.trim().length > 0,
    queryFn: async () => (await api.get('/search', { params: { q, market_code: marketCode, locale } })).data?.data,
  })
  const quality = useQuery({
    queryKey: ['search-quality', marketCode, locale],
    queryFn: async () => (await api.get('/admin/search/quality', { params: { market_code: marketCode, locale } })).data?.data,
  })
  const save = useMutation({
    mutationFn: async () => api.post('/admin/search/synonyms', { ...draft, market_code: marketCode, locale }),
    onSuccess: () => { client.invalidateQueries({ queryKey: ['search-synonyms'] }); setDraft({ term: '', canonical_term: '', kind: 'synonym', reviewed: false, active: true }); toast.success('Sinonim disimpan') },
    onError: () => toast.error('Sinonim gagal disimpan'),
  })
  const saveRule = useMutation({
    mutationFn: async () => api.post('/admin/search/merchandising', { ...rule, market_code: marketCode, locale, expires_at: new Date(rule.expires_at).toISOString() }),
    onSuccess: () => { client.invalidateQueries({ queryKey: ['search-merchandising'] }); setRule({ query_term: '', entity_id: '', action: 'boost', reason: '', expires_at: '', reviewed: false, active: true }); toast.success('Rule merchandising disimpan') },
    onError: () => toast.error('Rule merchandising gagal disimpan'),
  })

  return <div className="space-y-8 animate-in" aria-labelledby="search-title">
    <header><h1 id="search-title" className="text-3xl font-black text-foreground-muted tracking-tight italic uppercase">Search Discovery</h1><p className="text-foreground-muted mt-1">Preview query, kelola sinonim per market/locale, dan jaga organic truth tetap terpisah dari Ads.</p></header>
    <section className="glass-card p-6 rounded-3xl border-border space-y-4" aria-labelledby="preview-title">
      <h2 id="preview-title" className="font-black uppercase tracking-wide">Query preview</h2>
      <div className="flex flex-col md:flex-row gap-3"><label className="sr-only" htmlFor="search-preview-query">Query</label><input id="search-preview-query" value={q} onChange={e => setQ(e.target.value)} className={`flex-1 ${inputClass}`} placeholder="ayam geprk" /><input aria-label="Market code" value={marketCode} onChange={e => setMarketCode(e.target.value)} className={`w-28 ${inputClass}`} /><input aria-label="Locale" value={locale} onChange={e => setLocale(e.target.value)} className={`w-24 ${inputClass}`} /></div>
      {preview.isLoading ? <Loader2 className="animate-spin" aria-label="Loading preview" /> : preview.data && <div className="rounded-2xl bg-surface-subtle p-4"><p className="text-sm">Intent: <strong>{preview.data.intent?.service || 'discovery'}</strong> · canonical: <strong>{preview.data.intent?.canonical_query}</strong></p><ul className="mt-3 space-y-2" aria-label="Search preview results">{preview.data.results?.map((item: any) => <li key={`${item.entity_type}-${item.entity_id}`} className="flex items-center gap-2 text-sm"><Search size={14} aria-hidden="true" />{item.title} <span className="text-xs text-foreground-muted">{item.available ? 'available' : 'unavailable'}</span></li>)}</ul></div>}
    </section>
    <section className="glass-card p-6 rounded-3xl border-border space-y-5" aria-labelledby="synonyms-title">
      <div className="flex items-center justify-between"><h2 id="synonyms-title" className="font-black uppercase tracking-wide">Synonyms & misspellings</h2><span className="text-xs text-foreground-muted">Reviewed changes are audited</span></div>
      <div className="grid grid-cols-1 md:grid-cols-5 gap-3"><input aria-label="Term" value={draft.term} onChange={e => setDraft({ ...draft, term: e.target.value })} className={inputClass} placeholder="geprk" /><input aria-label="Canonical term" value={draft.canonical_term} onChange={e => setDraft({ ...draft, canonical_term: e.target.value })} className={inputClass} placeholder="geprek" /><select aria-label="Synonym kind" value={draft.kind} onChange={e => setDraft({ ...draft, kind: e.target.value })} className={inputClass}><option value="synonym">Synonym</option><option value="misspelling">Misspelling</option><option value="intent_alias">Intent alias</option></select><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.reviewed} onChange={e => setDraft({ ...draft, reviewed: e.target.checked })} /> Reviewed</label><button type="button" disabled={save.isPending || !draft.term || !draft.canonical_term} onClick={() => save.mutate()} className="rounded-xl bg-primary text-on-primary p-3 font-bold disabled:opacity-100 disabled:bg-surface-subtle disabled:text-foreground-muted"><Plus size={16} className="inline mr-1" aria-hidden="true" />Save</button></div>
      <ul className="divide-y divide-border">{synonyms.data?.map((item: Synonym) => <li key={item.id ?? item.term} className="py-3 flex justify-between text-sm"><span><strong>{item.term}</strong> → {item.canonical_term}</span><span className="text-foreground-muted">{item.kind}{item.reviewed ? ' · reviewed' : ' · pending'}</span></li>)}{!synonyms.isLoading && !synonyms.data?.length && <li className="py-3 text-sm text-foreground-muted">Belum ada konfigurasi untuk scope ini.</li>}</ul>
    </section>
    <section className="glass-card p-6 rounded-3xl border-border space-y-5" aria-labelledby="merchandising-title">
      <div className="flex items-center justify-between"><h2 id="merchandising-title" className="font-black uppercase tracking-wide">Merchandising rules</h2><span className="text-xs text-foreground-muted">Pin/boost wajib beralasan dan kedaluwarsa</span></div>
      <div className="grid grid-cols-1 md:grid-cols-6 gap-3"><input aria-label="Rule query" value={rule.query_term} onChange={e => setRule({ ...rule, query_term: e.target.value })} className={inputClass} placeholder="ayam geprek" /><input aria-label="Entity ID" value={rule.entity_id} onChange={e => setRule({ ...rule, entity_id: e.target.value })} className={inputClass} placeholder="UUID entity" /><select aria-label="Rule action" value={rule.action} onChange={e => setRule({ ...rule, action: e.target.value })} className={inputClass}><option value="pin">Pin</option><option value="boost">Boost</option><option value="exclude">Exclude</option></select><input aria-label="Rule reason" value={rule.reason} onChange={e => setRule({ ...rule, reason: e.target.value })} className={inputClass} placeholder="Alasan bisnis" /><input aria-label="Rule expiry" type="datetime-local" value={rule.expires_at} onChange={e => setRule({ ...rule, expires_at: e.target.value })} className={inputClass} /><button type="button" disabled={saveRule.isPending || !rule.query_term || !rule.entity_id || !rule.reason || !rule.expires_at} onClick={() => saveRule.mutate()} className="rounded-xl bg-primary text-on-primary p-3 font-bold disabled:opacity-100 disabled:bg-surface-subtle disabled:text-foreground-muted"><Plus size={16} className="inline mr-1" aria-hidden="true" />Save rule</button></div>
      <ul className="divide-y divide-border">{rules.data?.map((item: MerchandisingRule) => <li key={item.id ?? `${item.query_term}-${item.entity_id}`} className="py-3 flex justify-between gap-4 text-sm"><span><strong>{item.query_term}</strong> · {item.action} · {item.entity_id}</span><span className="text-foreground-muted">{item.reviewed ? 'reviewed' : 'pending'} · expires {item.expires_at ? new Date(item.expires_at).toLocaleDateString() : '—'}</span></li>)}{!rules.isLoading && !rules.data?.length && <li className="py-3 text-sm text-foreground-muted">Belum ada rule untuk scope ini.</li>}</ul>
    </section>
    <section className="glass-card p-6 rounded-3xl border-border space-y-4" aria-labelledby="quality-title"><h2 id="quality-title" className="font-black uppercase tracking-wide">Search quality</h2>{quality.isLoading ? <Loader2 className="animate-spin" aria-label="Loading quality metrics" /> : <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm"><div><span className="text-foreground-muted">Queries 24h</span><strong className="block text-xl">{quality.data?.query_volume ?? 0}</strong></div><div><span className="text-foreground-muted">Zero-result rate</span><strong className="block text-xl">{((quality.data?.zero_result_rate ?? 0) * 100).toFixed(1)}%</strong></div><div><span className="text-foreground-muted">Avg latency</span><strong className="block text-xl">{Math.round(quality.data?.average_latency_ms ?? 0)} ms</strong></div><div><span className="text-foreground-muted">Indexed types</span><strong className="block text-xl">{quality.data?.freshness_by_entity_type?.length ?? 0}</strong></div></div>}</section>
  </div>
}
