import { useEffect, useState } from 'react'
import { MapPin, Pencil, Plus, Trash2, X } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '../lib/api'

type MeetingPoint = {
  meeting_point_id: string
  name: string
  latitude: number
  longitude: number
  category: string
  address: string
  is_active: boolean
  usage_count: number
  avg_wait_time_min: number
}

type Draft = Omit<MeetingPoint, 'meeting_point_id' | 'usage_count' | 'avg_wait_time_min'> & { id?: string }

const emptyDraft: Draft = { name: '', category: 'hub', address: '', latitude: -6.2088, longitude: 106.8456, is_active: true }

export default function MeetingPoints() {
  const client = useQueryClient()
  const [draft, setDraft] = useState<Draft | null>(null)
  const points = useQuery({
    queryKey: ['meeting-points'],
    queryFn: async () => {
      const response = await api.get('/admin/meeting-points')
      return (Array.isArray(response.data) ? response.data : response.data?.data || []) as MeetingPoint[]
    }
  })
  const save = useMutation({
    mutationFn: async (value: Draft) => {
      const body = { id: value.id || crypto.randomUUID(), name: value.name.trim(), category: value.category, address: value.address.trim(), latitude: Number(value.latitude), longitude: Number(value.longitude), is_active: value.is_active }
      if (value.id) return api.put(`/admin/meeting-points/${value.id}`, body)
      return api.post('/admin/meeting-points', body)
    },
    onSuccess: () => { client.invalidateQueries({ queryKey: ['meeting-points'] }); setDraft(null); toast.success('Meeting point tersimpan') },
    onError: () => toast.error('Meeting point gagal disimpan')
  })
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/meeting-points/${id}`),
    onSuccess: () => { client.invalidateQueries({ queryKey: ['meeting-points'] }); toast.success('Meeting point dihapus') },
    onError: () => toast.error('Meeting point gagal dihapus')
  })

  useEffect(() => { if (points.isError) toast.error('Data meeting point belum bisa dimuat') }, [points.isError])

  return <div className="space-y-6 pb-20">
    <div className="flex flex-wrap items-center justify-between gap-4"><div><h1 className="text-3xl font-black uppercase italic text-zinc-100">Meeting Points</h1><p className="mt-1 text-zinc-500">Kelola titik serah-terima operasional yang dipakai matching.</p></div><button onClick={() => setDraft(emptyDraft)} className="inline-flex items-center gap-2 rounded-2xl bg-primary px-5 py-3 text-sm font-black uppercase tracking-wider text-white"><Plus size={17} /> Tambah titik</button></div>
    {points.isLoading ? <p className="rounded-2xl bg-white/5 p-8 text-zinc-400">Memuat data database…</p> : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{points.data?.map((point) => <article key={point.meeting_point_id} className="rounded-3xl border border-white/10 bg-white/5 p-5"><div className="flex items-start justify-between gap-3"><div><h2 className="font-bold text-zinc-100">{point.name}</h2><p className="mt-1 text-xs uppercase tracking-widest text-primary-light">{point.category || 'hub'} · {point.is_active ? 'aktif' : 'nonaktif'}</p></div><MapPin className="text-primary-light" size={19} /></div><p className="mt-4 text-sm text-zinc-400">{point.address || 'Alamat belum tersedia'}</p><p className="mt-2 font-mono text-xs text-zinc-500">{Number(point.latitude).toFixed(6)}, {Number(point.longitude).toFixed(6)}</p><div className="mt-4 flex items-center justify-between border-t border-white/10 pt-4 text-xs text-zinc-500"><span>{point.usage_count || 0} penggunaan · rata-rata {Number(point.avg_wait_time_min || 0).toFixed(1)} mnt</span><div className="flex gap-2"><button onClick={() => setDraft({ id: point.meeting_point_id, name: point.name, category: point.category || 'hub', address: point.address || '', latitude: point.latitude, longitude: point.longitude, is_active: point.is_active })} className="rounded-lg p-2 text-zinc-300 hover:bg-white/10"><Pencil size={15} /></button><button onClick={() => { if (window.confirm('Hapus meeting point ini?')) remove.mutate(point.meeting_point_id) }} className="rounded-lg p-2 text-red-300 hover:bg-red-500/10"><Trash2 size={15} /></button></div></div></article>)}</div>}
    {draft && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"><form onSubmit={(event) => { event.preventDefault(); if (!draft.name.trim() || !draft.address.trim() || !Number.isFinite(Number(draft.latitude)) || !Number.isFinite(Number(draft.longitude))) { toast.error('Nama, alamat, dan koordinat wajib valid'); return } save.mutate(draft) }} className="w-full max-w-lg space-y-4 rounded-3xl border border-white/10 bg-zinc-950 p-6"><div className="flex items-center justify-between"><h2 className="text-xl font-black text-white">{draft.id ? 'Edit' : 'Tambah'} meeting point</h2><button type="button" onClick={() => setDraft(null)}><X className="text-zinc-400" /></button></div><label className="block text-sm text-zinc-300">Nama<input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 p-3 text-white" required /></label><label className="block text-sm text-zinc-300">Alamat<input value={draft.address} onChange={(e) => setDraft({ ...draft, address: e.target.value })} className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 p-3 text-white" required /></label><div className="grid grid-cols-3 gap-3"><label className="text-sm text-zinc-300">Kategori<select value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 p-3 text-white"><option value="hub">Hub</option><option value="fuel_station">SPBU</option><option value="convenience_store">Minimarket</option></select></label><label className="text-sm text-zinc-300">Latitude<input type="number" step="any" value={draft.latitude} onChange={(e) => setDraft({ ...draft, latitude: Number(e.target.value) })} className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 p-3 text-white" required /></label><label className="text-sm text-zinc-300">Longitude<input type="number" step="any" value={draft.longitude} onChange={(e) => setDraft({ ...draft, longitude: Number(e.target.value) })} className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 p-3 text-white" required /></label></div><label className="flex items-center gap-2 text-sm text-zinc-300"><input type="checkbox" checked={draft.is_active} onChange={(e) => setDraft({ ...draft, is_active: e.target.checked })} /> Aktif untuk matching</label><div className="flex justify-end gap-3"><button type="button" onClick={() => setDraft(null)} className="rounded-xl border border-white/10 px-4 py-2 text-zinc-300">Batal</button><button disabled={save.isPending} className="rounded-xl bg-primary px-5 py-2 font-bold text-white">{save.isPending ? 'Menyimpan…' : 'Simpan'}</button></div></form></div>}
  </div>
}
