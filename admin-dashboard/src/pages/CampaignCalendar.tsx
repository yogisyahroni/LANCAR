import { useMemo, useState } from 'react'
import { CalendarDays, RefreshCw } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { AdminPageSkeleton } from '../components/ui/Skeleton'

type CalendarEntry = { id: string; title: string; kind: 'Promo' | 'Broadcast'; status: string; startsAt: string | null; endsAt: string | null; detail: string }
const dateLabel = (value: string | null) => value ? new Date(value).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : 'Tidak dijadwalkan'

export default function CampaignCalendar() {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7))
  const query = useQuery({
    queryKey: ['campaign-calendar'],
    queryFn: async () => {
      const [promos, broadcasts] = await Promise.all([
        api.get('/admin/promos', { params: { limit: 100 } }),
        api.get('/admin/broadcasts', { params: { page: 1, limit: 100 } }),
      ])
      const promoRows = promos.data?.data || []
      const broadcastRows = broadcasts.data?.data || []
      return [
        ...promoRows.map((row: any): CalendarEntry => ({ id: `promo-${row.id}`, title: row.name || row.code, kind: 'Promo', status: row.status, startsAt: row.starts_at, endsAt: row.ends_at, detail: row.code || 'Promo campaign' })),
        ...broadcastRows.map((row: any): CalendarEntry => ({ id: `broadcast-${row.id}`, title: row.title, kind: 'Broadcast', status: row.status, startsAt: row.scheduled_at || row.sent_at || row.created_at, endsAt: null, detail: row.target_type || 'Broadcast' })),
      ] as CalendarEntry[]
    },
    staleTime: 30_000,
  })
  const entries = useMemo(() => (query.data || []).filter((entry) => (entry.startsAt || '').slice(0, 7) === month).sort((a, b) => String(a.startsAt).localeCompare(String(b.startsAt))), [query.data, month])

  return <div className="space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[0.32em] text-primary-light">Marketing operations</p><h1 className="mt-2 text-3xl font-black text-zinc-100">Campaign Calendar</h1><p className="mt-2 text-sm text-zinc-500">Satu timeline untuk promo dan broadcast yang benar-benar tersimpan di backend.</p></div><div className="flex gap-2"><input type="month" value={month} onChange={(event) => setMonth(event.target.value)} className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-zinc-100" /><button type="button" onClick={() => query.refetch()} className="rounded-xl border border-white/10 p-3 text-zinc-300 hover:bg-white/10"><RefreshCw className="h-4 w-4" /></button></div></div>
    <div className="rounded-3xl border border-white/10 bg-zinc-900/60 p-5"><div className="mb-5 flex items-center gap-2"><CalendarDays className="h-5 w-5 text-primary-light" /><h2 className="font-black text-zinc-100">Jadwal {new Date(`${month}-01T00:00:00`).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}</h2></div>{query.isLoading ? <AdminPageSkeleton /> : entries.length === 0 ? <div className="p-12 text-center text-zinc-500">Tidak ada promo atau broadcast pada bulan ini.</div> : <div className="grid gap-3">{entries.map((entry) => <article key={entry.id} className="grid gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 md:grid-cols-[180px_1fr_auto] md:items-center"><div><p className="text-xs font-black text-primary-light">{dateLabel(entry.startsAt)}</p>{entry.endsAt && <p className="mt-1 text-[11px] text-zinc-600">sampai {dateLabel(entry.endsAt)}</p>}</div><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-black text-zinc-100">{entry.title}</h3><span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-zinc-400">{entry.kind}</span></div><p className="mt-1 text-xs text-zinc-500">{entry.detail}</p></div><span className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-primary-light">{entry.status}</span></article>)}</div>}</div>
  </div>
}
