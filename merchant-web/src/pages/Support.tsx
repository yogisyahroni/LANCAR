import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { AlertCircle, CheckCircle2, Clock3, Download, ExternalLink, FileText, LifeBuoy, Loader2, MessageSquareText, Paperclip, Plus, RefreshCw, X } from 'lucide-react'
import { toast } from 'sonner'
import { api, apiErrorMessage } from '../lib/api'
import type { MerchantSupportCase, MerchantSupportCaseAttachment, MerchantSupportCaseListResponse } from '../lib/types'

const categories = [
  ['order_issue', 'Masalah pesanan'],
  ['item_unavailable', 'Item tidak tersedia / salah'],
  ['courier_issue', 'Masalah kurir'],
  ['payment_mismatch', 'Pembayaran tidak sesuai'],
  ['refund_request', 'Permintaan refund'],
  ['quality_safety', 'Kualitas atau keamanan makanan'],
  ['technical', 'Kendala teknis portal'],
] as const

const statusLabels: Record<string, string> = {
  open: 'Terbuka',
  investigating: 'Sedang ditangani',
  pending_customer: 'Menunggu informasi',
  pending_internal: 'Menunggu tim internal',
  resolved: 'Selesai',
  closed: 'Ditutup',
}

const priorityLabels: Record<string, string> = {
  low: 'Rendah',
  normal: 'Normal',
  high: 'Tinggi',
  urgent: 'Mendesak',
}

const statusClass = (status: string) => {
  if (status === 'resolved' || status === 'closed') return 'bg-emerald-50 text-emerald-800'
  if (status === 'urgent' || status === 'open') return 'bg-orange-50 text-orange-800'
  return 'bg-sky-50 text-sky-800'
}

const formatDate = (value?: string | null) => value ? new Date(value).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : '—'

export default function Support() {
  const [searchParams] = useSearchParams()
  const linkedOrderId = searchParams.get('order') || ''
  const [cases, setCases] = useState<MerchantSupportCase[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [selected, setSelected] = useState<MerchantSupportCase | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [form, setForm] = useState({ category: 'order_issue', priority: 'normal', subject: '', description: '', orderId: '' })

  const load = useCallback(async (showSpinner = false) => {
    if (showSpinner) setRefreshing(true)
    try {
      const response = await api.get<MerchantSupportCaseListResponse>('/support/cases?limit=50&offset=0')
      setCases(response.data?.data || [])
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Gagal memuat bantuan dan laporan'))
    } finally {
      setLoading(false)
      if (showSpinner) setRefreshing(false)
    }
  }, [])

  useEffect(() => { void load(true) }, [load])

  useEffect(() => {
    if (!linkedOrderId) return
    setForm((current) => ({
      ...current,
      orderId: linkedOrderId,
      subject: current.subject || `Kendala order ${linkedOrderId.slice(0, 8)}`,
    }))
    setShowForm(true)
  }, [linkedOrderId])

  const openCase = async (id: string) => {
    try {
      const response = await api.get<{ data: MerchantSupportCase }>(`/support/cases/${id}`)
      setSelected(response.data.data)
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Detail laporan belum dapat dimuat'))
    }
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    const subject = form.subject.trim()
    const description = form.description.trim()
    if (subject.length < 3) return toast.error('Judul laporan minimal 3 karakter')
    if (description.length < 10) return toast.error('Jelaskan kendala minimal 10 karakter')
    setSaving(true)
    try {
      const links = form.orderId.trim() ? [{ reference_type: 'order', reference_id: form.orderId.trim(), label: `Order ${form.orderId.trim()}` }] : []
      const response = await api.post<{ data: MerchantSupportCase }>('/support/cases', {
        category: form.category,
        priority: form.priority,
        subject,
        description,
        service_code: 'food_delivery',
        market_code: 'id-jk',
        links,
      }, { headers: { 'Idempotency-Key': crypto.randomUUID() } })
      let createdCase = response.data.data
      let attachmentUploaded = true
      if (selectedFile) {
        try {
          const body = new FormData()
          body.append('file', selectedFile)
          const attachmentResponse = await api.post<{ data: { attachment: MerchantSupportCaseAttachment } }>(
            `/support/cases/${createdCase.id}/attachments`,
            body,
            {
              headers: {
                'Content-Type': 'multipart/form-data',
                'Idempotency-Key': crypto.randomUUID(),
              },
            },
          )
          createdCase = {
            ...createdCase,
            attachments: [...(createdCase.attachments || []), attachmentResponse.data.data.attachment],
          }
        } catch (attachmentError) {
          attachmentUploaded = false
          toast.error(apiErrorMessage(attachmentError, 'Laporan tersimpan, tetapi lampiran belum berhasil diunggah'))
        }
      }
      setCases((current) => [createdCase, ...current])
      setSelected(createdCase)
      setForm({ category: 'order_issue', priority: 'normal', subject: '', description: '', orderId: '' })
      setSelectedFile(null)
      setShowForm(false)
      if (attachmentUploaded) toast.success(`Laporan ${createdCase.case_number} sudah diteruskan ke tim bantuan`)
      else toast.warning(`Laporan ${createdCase.case_number} tersimpan. Unggah ulang lampiran dari detail laporan.`)
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Laporan belum dapat dibuat'))
    } finally {
      setSaving(false)
    }
  }

  const downloadAttachment = async (attachment: MerchantSupportCaseAttachment) => {
    if (!selected) return
    try {
      const response = await api.get(`/support/cases/${selected.id}/attachments/${attachment.id}`, { responseType: 'blob' })
      const url = URL.createObjectURL(response.data as Blob)
      const link = document.createElement('a')
      link.href = url
      link.download = attachment.original_name
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Lampiran belum dapat diunduh'))
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700">Bantuan & kualitas</p>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-zinc-900">Laporan dan dukungan</h1>
          <p className="mt-1 max-w-2xl text-sm text-zinc-500">Laporkan kendala pesanan, pembayaran, kurir, atau operasional. Setiap laporan memiliki nomor, status, SLA, dan riwayat penanganan.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => load(true)} disabled={refreshing} className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-4 py-2.5 text-sm font-bold text-zinc-600 hover:border-emerald-900/30 hover:text-emerald-900 disabled:opacity-60">
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /> Muat ulang
          </button>
          <button type="button" onClick={() => setShowForm(true)} className="inline-flex items-center gap-2 rounded-full bg-[#003A20] px-4 py-2.5 text-sm font-bold text-white shadow-md shadow-emerald-900/20 hover:bg-emerald-950">
            <Plus className="h-4 w-4" /> Buat laporan
          </button>
        </div>
      </div>

      <section className="grid gap-3 sm:grid-cols-3">
        {[
          ['Terbuka', cases.filter((item) => ['open', 'investigating', 'pending_internal'].includes(item.status)).length, 'text-orange-700'],
          ['Menunggu informasi', cases.filter((item) => item.status === 'pending_customer').length, 'text-sky-700'],
          ['Selesai', cases.filter((item) => ['resolved', 'closed'].includes(item.status)).length, 'text-emerald-700'],
        ].map(([label, value, color]) => <div key={String(label)} className="rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm"><p className="text-xs font-bold text-zinc-500">{label}</p><p className={`mt-1 text-2xl font-black ${color}`}>{value}</p></div>)}
      </section>

      {loading ? <div className="rounded-3xl border border-zinc-100 bg-white p-12 text-center text-sm text-zinc-500"><Loader2 className="mx-auto h-6 w-6 animate-spin text-emerald-800" /></div> : cases.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-zinc-200 bg-white p-12 text-center shadow-sm"><LifeBuoy className="mx-auto h-10 w-10 text-emerald-800" /><p className="mt-4 font-black text-zinc-800">Belum ada laporan</p><p className="mt-1 text-sm text-zinc-500">Buat laporan jika ada kendala yang perlu dibantu tim Tembus.</p></div>
      ) : (
        <section className="overflow-hidden rounded-3xl border border-zinc-100 bg-white shadow-sm">
          <div className="border-b border-zinc-100 px-5 py-4"><h2 className="font-black text-zinc-900">Riwayat laporan</h2><p className="mt-1 text-xs text-zinc-500">Data diambil dari pusat bantuan dan tetap terhubung ke order/keuangan yang dirujuk.</p></div>
          <div className="divide-y divide-zinc-100">
            {cases.map((item) => <button key={item.id} type="button" onClick={() => openCase(item.id)} className="flex w-full flex-wrap items-center gap-4 px-5 py-4 text-left transition hover:bg-emerald-50/50">
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${statusClass(item.status)}`}>{item.status === 'resolved' || item.status === 'closed' ? <CheckCircle2 className="h-5 w-5" /> : <MessageSquareText className="h-5 w-5" />}</span>
              <span className="min-w-0 flex-1"><span className="flex flex-wrap items-center gap-2"><span className="text-xs font-black text-zinc-400">{item.case_number}</span><span className={`rounded-full px-2 py-0.5 text-[11px] font-black ${statusClass(item.status)}`}>{statusLabels[item.status] || item.status}</span><span className="text-[11px] font-bold text-zinc-400">{priorityLabels[item.priority] || item.priority}</span></span><span className="mt-1 block truncate font-bold text-zinc-800">{item.subject}</span><span className="mt-1 block truncate text-xs text-zinc-500">{item.category} · dibuat {formatDate(item.created_at)}</span></span>
              <span className="hidden text-right text-xs text-zinc-400 md:block"><span className="flex items-center justify-end gap-1"><Clock3 className="h-3.5 w-3.5" /> SLA {formatDate(item.sla_due_at)}</span>{item.sla_breached && <span className="mt-1 block font-bold text-red-600">Melewati SLA</span>}</span><ExternalLink className="h-4 w-4 shrink-0 text-zinc-300" />
            </button>)}
          </div>
        </section>
      )}

      {showForm && <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-6"><form onSubmit={submit} className="max-h-[94vh] w-full max-w-xl overflow-y-auto rounded-t-3xl bg-white p-6 shadow-2xl sm:rounded-3xl"><div className="flex items-center justify-between"><div><p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-700">Laporan baru</p><h2 className="mt-1 text-xl font-black text-zinc-900">Apa yang perlu dibantu?</h2></div><button type="button" onClick={() => setShowForm(false)} className="rounded-xl p-2 text-zinc-400 hover:bg-zinc-100"><X className="h-5 w-5" /></button></div><div className="mt-5 space-y-4"><label className="block"><span className="text-sm font-bold text-zinc-700">Jenis kendala</span><select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} className="mt-1.5 w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 outline-none focus:border-emerald-900">{categories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><div className="grid gap-4 sm:grid-cols-2"><label className="block"><span className="text-sm font-bold text-zinc-700">Prioritas</span><select value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })} className="mt-1.5 w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 outline-none focus:border-emerald-900"><option value="low">Rendah</option><option value="normal">Normal</option><option value="high">Tinggi</option><option value="urgent">Mendesak</option></select></label><label className="block"><span className="text-sm font-bold text-zinc-700">ID order (opsional)</span><input value={form.orderId} onChange={(event) => setForm({ ...form, orderId: event.target.value })} placeholder="Tempel ID order" className="mt-1.5 w-full rounded-xl border border-zinc-200 px-4 py-3 outline-none focus:border-emerald-900" /></label></div><label className="block"><span className="text-sm font-bold text-zinc-700">Judul laporan</span><input required value={form.subject} onChange={(event) => setForm({ ...form, subject: event.target.value })} placeholder="Contoh: Pesanan sudah siap tetapi kurir belum datang" className="mt-1.5 w-full rounded-xl border border-zinc-200 px-4 py-3 outline-none focus:border-emerald-900" /></label><label className="block"><span className="text-sm font-bold text-zinc-700">Detail kendala</span><textarea required rows={5} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Jelaskan kronologi dan tindakan yang sudah dilakukan. Jangan masukkan password atau data pembayaran sensitif." className="mt-1.5 w-full resize-y rounded-xl border border-zinc-200 px-4 py-3 outline-none focus:border-emerald-900" /></label><label className="block"><span className="text-sm font-bold text-zinc-700">Bukti lampiran (opsional)</span><span className="mt-1.5 flex items-center gap-3 rounded-xl border border-dashed border-zinc-300 px-4 py-3"><Paperclip className="h-4 w-4 shrink-0 text-emerald-800" /><input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp" onChange={(event) => setSelectedFile(event.target.files?.[0] || null)} className="min-w-0 flex-1 text-sm text-zinc-600 file:mr-3 file:rounded-lg file:border-0 file:bg-emerald-50 file:px-3 file:py-2 file:font-bold file:text-emerald-900" /></span><span className="mt-1 block text-xs text-zinc-500">PDF, JPG, PNG, atau WEBP · maksimal 10 MB. Jangan unggah kartu, PIN, OTP, atau password.</span>{selectedFile && <span className="mt-1 block truncate text-xs font-bold text-emerald-800">Terpilih: {selectedFile.name}</span>}</label><div className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-xs leading-relaxed text-amber-900"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> Tim bantuan akan melihat referensi order dari sistem. Jangan tulis nomor kartu, PIN, OTP, atau password.</div></div><div className="mt-6 flex justify-end gap-3"><button type="button" onClick={() => setShowForm(false)} className="rounded-xl border border-zinc-200 px-5 py-3 font-bold text-zinc-600">Batal</button><button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-[#003A20] px-5 py-3 font-bold text-white disabled:opacity-60">{saving && <Loader2 className="h-4 w-4 animate-spin" />} Kirim laporan</button></div></form></div>}

      {selected && <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-6"><div className="max-h-[94vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-white p-6 shadow-2xl sm:rounded-3xl"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-black text-zinc-400">{selected.case_number}</p><h2 className="mt-1 text-xl font-black text-zinc-900">{selected.subject}</h2><div className="mt-2 flex flex-wrap items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-xs font-black ${statusClass(selected.status)}`}>{statusLabels[selected.status] || selected.status}</span><span className="text-xs text-zinc-500">SLA sampai {formatDate(selected.sla_due_at)}</span></div></div><button type="button" onClick={() => setSelected(null)} className="rounded-xl p-2 text-zinc-400 hover:bg-zinc-100"><X className="h-5 w-5" /></button></div><p className="mt-5 whitespace-pre-wrap rounded-2xl bg-zinc-50 p-4 text-sm leading-relaxed text-zinc-700">{selected.description}</p>{selected.authoritative && <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4 text-sm"><p className="font-black text-emerald-950">Status sistem terkait</p><div className="mt-2 grid gap-2 sm:grid-cols-3"><span><b className="block text-xs text-emerald-700">Order</b>{selected.authoritative.order_status || '—'}</span><span><b className="block text-xs text-emerald-700">Pembayaran</b>{selected.authoritative.payment_status || '—'}</span><span><b className="block text-xs text-emerald-700">Referensi</b>{selected.authoritative.order_id || '—'}</span></div></div>}<div className="mt-6"><div className="flex items-center justify-between gap-3"><h3 className="font-black text-zinc-900">Bukti lampiran</h3><span className="text-xs text-zinc-400">Kadaluarsa 30 hari</span></div><div className="mt-3 space-y-2">{(selected.attachments || []).map((attachment) => <button key={attachment.id} type="button" onClick={() => void downloadAttachment(attachment)} className="flex w-full items-center gap-3 rounded-xl border border-zinc-200 px-3 py-3 text-left hover:border-emerald-700 hover:bg-emerald-50"><FileText className="h-5 w-5 shrink-0 text-emerald-800" /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold text-zinc-800">{attachment.original_name}</span><span className="block text-xs text-zinc-500">{Math.max(1, Math.round(attachment.size_bytes / 1024))} KB · sampai {formatDate(attachment.expires_at)}</span></span><Download className="h-4 w-4 shrink-0 text-emerald-800" /></button>)}{!selected.attachments?.length && <p className="text-sm text-zinc-500">Belum ada bukti lampiran.</p>}</div></div><div className="mt-6"><h3 className="font-black text-zinc-900">Riwayat penanganan</h3><div className="mt-3 space-y-3">{(selected.events || []).map((event) => <div key={event.id} className="flex gap-3"><span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-700" /><div><p className="text-sm font-bold text-zinc-800">{event.note || event.event_type}</p><p className="mt-0.5 text-xs text-zinc-400">{formatDate(event.created_at)}{event.actor_role ? ` · ${event.actor_role}` : ''}</p></div></div>)}{!selected.events?.length && <p className="text-sm text-zinc-500">Belum ada pembaruan tambahan.</p>}</div></div><div className="mt-6 flex justify-end"><button type="button" onClick={() => setSelected(null)} className="rounded-xl bg-[#003A20] px-5 py-3 font-bold text-white">Tutup</button></div></div></div>}
    </div>
  )
}
