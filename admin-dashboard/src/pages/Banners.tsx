import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Megaphone, Plus, Trash2, Pencil, X } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '../lib/api'
import { cn } from '../lib/utils'

type Banner = {
  id: string
  title: string
  message: string
  image_url?: string | null
  action_url?: string | null
  action_label?: string | null
  priority: number
  status: 'active' | 'inactive'
  created_at: string
}

export default function Banners() {
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Banner | null>(null)
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [actionUrl, setActionUrl] = useState('')
  const [actionLabel, setActionLabel] = useState('')
  const [priority, setPriority] = useState(0)
  const [status, setStatus] = useState<'active' | 'inactive'>('active')

  const { data, isLoading } = useQuery({
    queryKey: ['admin-banners'],
    queryFn: async () => {
      const res = await api.get('/admin/banners')
      return (res.data.banners || []) as Banner[]
    }
  })

  const resetForm = () => {
    setEditing(null)
    setTitle('')
    setMessage('')
    setImageUrl('')
    setActionUrl('')
    setActionLabel('')
    setPriority(0)
    setStatus('active')
    setShowForm(false)
  }

  const openCreate = () => {
    resetForm()
    setShowForm(true)
  }

  const openEdit = (b: Banner) => {
    setEditing(b)
    setTitle(b.title)
    setMessage(b.message)
    setImageUrl(b.image_url || '')
    setActionUrl(b.action_url || '')
    setActionLabel(b.action_label || '')
    setPriority(b.priority)
    setStatus(b.status)
    setShowForm(true)
  }

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        title,
        message,
        image_url: imageUrl.trim() || null,
        action_url: actionUrl.trim() || null,
        action_label: actionLabel.trim() || null,
        priority: Number(priority) || 0,
        status,
      }
      if (editing) {
        const res = await api.patch(`/admin/banners/${editing.id}`, payload)
        return res.data
      }
      const res = await api.post('/admin/banners', payload)
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-banners'] })
      toast.success(editing ? 'Banner diperbarui' : 'Banner dibuat')
      resetForm()
    },
    onError: (error: any) => toast.error(error.response?.data?.error || error.message)
  })

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.delete(`/admin/banners/${id}`)
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-banners'] })
      toast.success('Banner dihapus')
    },
    onError: (error: any) => toast.error(error.response?.data?.error || error.message)
  })

  const banners = data || []

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-100">Global Banner</h1>
          <p className="mt-2 text-sm text-zinc-500">
            Pengumuman in-app platform-wide yang tampil di beranda customer app.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white transition hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" /> Banner Baru
        </button>
      </div>

      {isLoading ? (
        <p className="text-sm text-zinc-500">Loading...</p>
      ) : banners.length === 0 ? (
        <p className="text-sm text-zinc-500">Belum ada banner. Klik "Banner Baru" untuk membuat.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {banners.map((b) => (
            <div key={b.id} className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Megaphone className="h-4 w-4 text-primary" />
                  <p className="font-bold text-zinc-100">{b.title}</p>
                </div>
                <div className="flex gap-1">
                  <button type="button" onClick={() => openEdit(b)} className="rounded-lg border border-white/10 p-1.5 text-zinc-400 hover:text-white" aria-label="Edit">
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button type="button" onClick={() => remove.mutate(b.id)} className="rounded-lg border border-white/10 p-1.5 text-red-300 hover:bg-red-500/10" aria-label="Hapus">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <p className="mt-2 text-sm text-zinc-400">{b.message}</p>
              <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-bold uppercase">
                <span className={cn('rounded-full px-2 py-1', b.status === 'active' ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border border-white/10 text-zinc-500')}>
                  {b.status}
                </span>
                <span className="rounded-full border border-white/10 px-2 py-1 text-zinc-400">priority {b.priority}</span>
                {b.action_label && (
                  <span className="rounded-full border border-white/10 px-2 py-1 text-zinc-400">{b.action_label}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-zinc-950 p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-zinc-100">{editing ? 'Edit Banner' : 'Banner Baru'}</h2>
              <button type="button" onClick={resetForm} className="text-zinc-500 hover:text-zinc-300" aria-label="Tutup">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-3">
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Judul"
                className="w-full rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none" />
              <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} placeholder="Pesan"
                className="w-full rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none" />
              <div className="grid grid-cols-2 gap-3">
                <input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="Image URL (opsional)"
                  className="rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none" />
                <input value={actionUrl} onChange={(e) => setActionUrl(e.target.value)} placeholder="Action URL (opsional)"
                  className="rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <input value={actionLabel} onChange={(e) => setActionLabel(e.target.value)} placeholder="Label tombol"
                  className="rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none" />
                <input type="number" value={priority} onChange={(e) => setPriority(Number(e.target.value))} placeholder="Priority"
                  className="rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none" />
                <select value={status} onChange={(e) => setStatus(e.target.value as 'active' | 'inactive')}
                  className="rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:outline-none">
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={resetForm} className="rounded-xl border border-white/10 px-4 py-2 text-sm font-bold text-zinc-400 hover:text-white">Batal</button>
              <button type="button" onClick={() => save.mutate()} disabled={save.isPending || !title.trim() || !message.trim()}
                className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white transition hover:bg-primary/90 disabled:opacity-50">
                {save.isPending ? 'Menyimpan...' : 'Simpan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
