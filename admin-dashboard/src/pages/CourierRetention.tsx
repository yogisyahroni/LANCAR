import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ClipboardCheck, Loader2, PlayCircle, RefreshCw, UserRound } from 'lucide-react'
import { api } from '../lib/api'
import { toast } from 'sonner'

type CourierRetentionRow = {
  courier_profile_id: string
  full_name: string
  email?: string
  phone?: string
  user_status: string
  completed_orders: number
  cancelled_orders: number
  last_order_at?: string | null
  training_count: number
  retraining_id?: string | null
  retraining_reason?: string | null
  retraining_status?: string | null
}

const statusLabel: Record<string, string> = {
  planned: 'Direncanakan', in_progress: 'Berjalan', completed: 'Selesai', cancelled: 'Dibatalkan',
}
const formatDate = (value?: string | null) => value ? new Date(value).toLocaleString('id-ID') : 'Belum ada order'

export default function CourierRetention() {
  const queryClient = useQueryClient()
  const [days, setDays] = useState(30)
  const [selected, setSelected] = useState<CourierRetentionRow | null>(null)
  const [reason, setReason] = useState('Risiko churn: tidak aktif')
  const [notes, setNotes] = useState('')
  const [scheduledAt, setScheduledAt] = useState('')
  const query = useQuery({
    queryKey: ['courier-retention', days],
    queryFn: async () => (await api.get(`/admin/courier-retention?days=${days}`)).data as { couriers: CourierRetentionRow[] },
  })
  const createAction = useMutation({
    mutationFn: async () => api.post(`/admin/courier-retention/${selected?.courier_profile_id}/retraining`, { reason, notes, scheduled_at: scheduledAt || undefined }),
    onSuccess: () => { toast.success('Rencana retraining dibuat'); setSelected(null); setNotes(''); setScheduledAt(''); queryClient.invalidateQueries({ queryKey: ['courier-retention'] }) },
    onError: (error: any) => toast.error(error.response?.data?.error || 'Gagal membuat rencana retraining'),
  })
  const updateAction = useMutation({
    mutationFn: async ({ id, status }: { id: string, status: string }) => api.patch(`/admin/courier-retention/retraining/${id}`, { status }),
    onSuccess: () => { toast.success('Status retraining diperbarui'); queryClient.invalidateQueries({ queryKey: ['courier-retention'] }) },
    onError: () => toast.error('Gagal memperbarui status retraining'),
  })
  const candidates = useMemo(() => query.data?.couriers || [], [query.data])

  return (
    <div className="space-y-8 animate-in max-w-[1500px] mx-auto">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div><p className="text-xs font-black uppercase tracking-[0.25em] text-primary-light">Supply health</p><h1 className="text-3xl font-black text-zinc-100 mt-2">Courier Retention & Retraining</h1><p className="text-zinc-500 mt-2">Pantau kurir approved yang tidak aktif, lalu simpan rencana retraining yang dapat diaudit.</p></div>
        <div className="flex items-center gap-3"><select value={days} onChange={event => setDays(Number(event.target.value))} className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-zinc-200">{[7, 30, 60, 90].map(value => <option key={value} value={value}>{value} hari</option>)}</select><button onClick={() => query.refetch()} className="p-3 rounded-xl border border-white/10 text-zinc-400 hover:text-white" aria-label="Refresh"><RefreshCw size={18} /></button></div>
      </div>
      {query.isLoading ? <div className="h-64 flex items-center justify-center"><Loader2 className="animate-spin text-primary" /></div> : query.isError ? <div className="glass-card rounded-3xl p-8 text-red-300">Data retention gagal dimuat. <button onClick={() => query.refetch()} className="underline">Coba lagi</button></div> : <div className="glass-card rounded-3xl border border-white/5 overflow-hidden">
        <div className="px-6 py-5 border-b border-white/5 flex items-center justify-between"><div className="flex items-center gap-3"><UserRound className="text-primary-light" size={20} /><span className="font-bold text-zinc-100">{candidates.length} courier profiles</span></div><span className="text-xs text-zinc-500">Periode aktivitas {days} hari</span></div>
        <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-xs uppercase tracking-wider text-zinc-500 bg-white/[0.03]"><tr><th className="px-6 py-4">Courier</th><th className="px-6 py-4">Aktivitas terakhir</th><th className="px-6 py-4">Order / batal</th><th className="px-6 py-4">Training</th><th className="px-6 py-4">Retraining</th><th className="px-6 py-4" /></tr></thead><tbody className="divide-y divide-white/5">{candidates.map(courier => <tr key={courier.courier_profile_id} className="hover:bg-white/[0.03]"><td className="px-6 py-4"><p className="font-bold text-zinc-100">{courier.full_name || 'Tanpa nama'}</p><p className="text-xs text-zinc-500">{courier.email || courier.phone || courier.user_status}</p></td><td className="px-6 py-4 text-zinc-300">{formatDate(courier.last_order_at)}</td><td className="px-6 py-4"><span className="text-zinc-200">{courier.completed_orders}</span><span className="text-zinc-600"> / </span><span className="text-amber-300">{courier.cancelled_orders}</span></td><td className="px-6 py-4 text-zinc-300">{courier.training_count} completion</td><td className="px-6 py-4">{courier.retraining_status ? <span className="text-primary-light">{statusLabel[courier.retraining_status] || courier.retraining_status}</span> : <span className="text-zinc-600">Belum ada</span>}</td><td className="px-6 py-4 text-right">{courier.retraining_id ? <select value={courier.retraining_status || 'planned'} onChange={event => updateAction.mutate({ id: courier.retraining_id!, status: event.target.value })} className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs text-zinc-200"><option value="planned">Direncanakan</option><option value="in_progress">Berjalan</option><option value="completed">Selesai</option><option value="cancelled">Dibatalkan</option></select> : <button onClick={() => setSelected(courier)} className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-white"><PlayCircle size={14} /> Retraining</button>}</td></tr>)}</tbody></table>{candidates.length === 0 && <div className="p-10 text-center text-zinc-500">Belum ada courier approved pada periode ini.</div>}</div>
      </div>}
      {selected && <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" role="dialog" aria-modal="true"><div className="w-full max-w-lg rounded-3xl border border-white/10 bg-zinc-950 p-6 space-y-5"><div><h2 className="text-xl font-black text-white">Buat retraining</h2><p className="text-sm text-zinc-500 mt-1">{selected.full_name}</p></div><label className="block text-sm text-zinc-300">Alasan<input value={reason} onChange={event => setReason(event.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white" /></label><label className="block text-sm text-zinc-300">Jadwal<input type="datetime-local" value={scheduledAt} onChange={event => setScheduledAt(event.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white" /></label><label className="block text-sm text-zinc-300">Catatan<textarea value={notes} onChange={event => setNotes(event.target.value)} rows={3} className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white" /></label><div className="flex justify-end gap-3"><button onClick={() => setSelected(null)} className="px-4 py-2 text-sm text-zinc-400">Batal</button><button disabled={!reason.trim() || createAction.isPending} onClick={() => createAction.mutate()} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white disabled:opacity-50"><ClipboardCheck size={16} /> Simpan</button></div></div></div>}
    </div>
  )
}
