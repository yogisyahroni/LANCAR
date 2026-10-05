import { useEffect, useState } from 'react'
import { MessageCircle, Star } from 'lucide-react'
import { toast } from 'sonner'
import { api, apiErrorMessage } from '../lib/api'
import { MerchantPageSkeleton } from '../components/Skeleton'
import type { MerchantReview, MerchantReviewsResponse } from '../lib/types'

export default function Reviews() {
  const [summary, setSummary] = useState<MerchantReviewsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<string | null>(null)

  const load = async () => {
    try {
      const response = await api.get<MerchantReviewsResponse>('/merchant/reviews?page=1&page_size=50')
      setSummary(response.data)
      setReplyDrafts(Object.fromEntries((response.data.reviews || []).map((review) => [review.id, review.reply?.body || ''])))
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Gagal memuat ulasan pelanggan'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const reply = async (review: MerchantReview) => {
    const body = (replyDrafts[review.id] || '').trim()
    if (!body) {
      toast.error('Tulis tanggapan terlebih dahulu')
      return
    }
    setSaving(review.id)
    try {
      const response = await api.post(`/merchant/reviews/${review.id}/reply`, { body })
      setSummary((current) => current ? {
        ...current,
        reviews: current.reviews.map((item) => item.id === review.id ? { ...item, reply: response.data } : item),
      } : current)
      toast.success('Tanggapan tersimpan')
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Gagal menyimpan tanggapan'))
    } finally {
      setSaving(null)
    }
  }

  if (loading) return <MerchantPageSkeleton />
  const reviews = summary?.reviews || []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black tracking-tight text-zinc-900">Ulasan pelanggan</h1>
        <p className="mt-1 text-sm text-zinc-500">Rating berasal dari pesanan yang selesai. Ulasan tidak dapat dihapus oleh merchant.</p>
      </div>

      <section className="grid gap-4 sm:grid-cols-[auto_1fr] rounded-[1.75rem] border border-zinc-100 bg-white p-6 shadow-sm">
        <div className="rounded-2xl bg-emerald-50 px-8 py-5 text-center">
          <p className="text-4xl font-black text-emerald-950">{summary?.avg_rating?.toFixed(1) || '0.0'}</p>
          <div className="mt-1 flex justify-center gap-0.5 text-orange-500" aria-label={`Rating ${summary?.avg_rating || 0} dari 5`}>
            {[1, 2, 3, 4, 5].map((star) => <Star key={star} className="h-4 w-4" fill={star <= Math.round(summary?.avg_rating || 0) ? 'currentColor' : 'none'} />)}
          </div>
          <p className="mt-1 text-xs font-bold text-zinc-500">{summary?.rating_count || 0} ulasan</p>
        </div>
        <div className="grid content-center gap-2">
          {[5, 4, 3, 2, 1].map((stars) => {
            const count = summary?.rating_distribution?.find((bucket) => bucket.stars === stars)?.count || 0
            const total = summary?.rating_count || 0
            const width = total ? `${Math.round((count / total) * 100)}%` : '0%'
            return <div key={stars} className="flex items-center gap-3 text-xs text-zinc-500"><span className="w-8">{stars} ★</span><div className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-100"><div className="h-full rounded-full bg-orange-400" style={{ width }} /></div><span className="w-8 text-right">{count}</span></div>
          })}
        </div>
      </section>

      <section className="space-y-3">
        {reviews.length === 0 ? <div className="rounded-2xl border border-zinc-100 bg-white p-10 text-center text-sm text-zinc-500">Belum ada ulasan dari pelanggan.</div> : reviews.map((review) => (
          <article key={review.id} className="rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><p className="font-black text-zinc-900">{review.reviewer_name || 'Pelanggan'}</p><p className="mt-1 text-xs text-zinc-400">{review.order_number ? `Order #${review.order_number} · ` : ''}{new Date(review.created_at).toLocaleDateString('id-ID')}</p></div>
              <div className="flex items-center gap-0.5 text-orange-500" aria-label={`Rating ${review.stars} dari 5`}>{[1, 2, 3, 4, 5].map((star) => <Star key={star} className="h-4 w-4" fill={star <= review.stars ? 'currentColor' : 'none'} />)}</div>
            </div>
            {review.comment && <p className="mt-4 text-sm leading-relaxed text-zinc-700">{review.comment}</p>}
            {review.tags?.length ? <div className="mt-3 flex flex-wrap gap-1.5">{review.tags.map((tag) => <span key={tag} className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs text-zinc-600">{tag}</span>)}</div> : null}
            <div className="mt-4 rounded-xl bg-zinc-50 p-3">
              <label className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-zinc-500"><MessageCircle className="h-4 w-4" /> Tanggapan merchant</label>
              <textarea value={replyDrafts[review.id] || ''} onChange={(event) => setReplyDrafts((current) => ({ ...current, [review.id]: event.target.value }))} maxLength={1000} rows={2} placeholder="Ucapkan terima kasih atau tanggapi dengan sopan…" className="mt-2 w-full resize-y rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-800" />
              <div className="mt-2 flex items-center justify-between gap-3"><span className="text-xs text-zinc-400">Tanggapan akan terlihat oleh pelanggan.</span><button onClick={() => void reply(review)} disabled={saving === review.id} className="rounded-lg bg-[#003A20] px-4 py-2 text-xs font-bold text-white disabled:opacity-60">{saving === review.id ? 'Menyimpan…' : review.reply ? 'Perbarui tanggapan' : 'Kirim tanggapan'}</button></div>
            </div>
          </article>
        ))}
      </section>
    </div>
  )
}
