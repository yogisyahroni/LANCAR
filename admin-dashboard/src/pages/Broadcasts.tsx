import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  AlertCircle,
  BarChart3,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Copy,
  Loader2,
  Megaphone,
  Plus,
  RefreshCw,
  XCircle,
} from 'lucide-react'
import { cn } from '../lib/utils'
import type { BroadcastRow } from './broadcasts/hooks/useBroadcasts'
import { useBroadcasts, useCancelBroadcast } from './broadcasts/hooks/useBroadcasts'
import BroadcastComposer from './broadcasts/BroadcastComposer'
import BroadcastDeliveryReport from './broadcasts/BroadcastDeliveryReport'
import { Skeleton } from '../components/ui/Skeleton'

const STATUS_FILTERS = [
  { value: 'all', label: 'Semua' },
  { value: 'draft', label: 'Draft' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'sending', label: 'Sending' },
  { value: 'sent', label: 'Sent' },
  { value: 'failed', label: 'Failed' },
  { value: 'cancelled', label: 'Cancelled' },
]

const statusBadgeClass = (status: string) => {
  switch (status) {
    case 'draft':
      return 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20'
    case 'scheduled':
      return 'bg-amber-500/10 text-amber-400 border-amber-500/20'
    case 'sending':
      return 'bg-blue-500/10 text-blue-400 border-blue-500/20'
    case 'sent':
      return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
    case 'failed':
      return 'bg-red-500/10 text-red-400 border-red-500/20'
    default:
      return 'bg-zinc-800 text-zinc-500 border-white/10'
  }
}

const successRateOf = (row: BroadcastRow): number | null => {
  const attempted = (row.sent_count ?? 0) + (row.failed_count ?? 0)
  if (!attempted) return null
  return Math.round(((row.sent_count ?? 0) / attempted) * 100)
}

export default function Broadcasts() {
  const [view, setView] = useState<'list' | 'composer'>('list')
  const [duplicateSource, setDuplicateSource] = useState<BroadcastRow | null>(null)
  const [statusFilter, setStatusFilter] = useState('all')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [page, setPage] = useState(1)
  const [reportId, setReportId] = useState<string | null>(null)
  const cancelMutation = useCancelBroadcast()

  // Backend list endpoint belum mendukung filter tanggal (hanya status+category);
  // filter from/to diterapkan di sisi klien atas halaman yang dimuat.
  const listQuery = useBroadcasts({ status: statusFilter, page, limit: 20 })

  const rows = useMemo(() => {
    const data = listQuery.data?.data ?? []
    if (!fromDate && !toDate) return data
    return data.filter((row) => {
      const created = new Date(row.created_at)
      if (fromDate) {
        const from = new Date(`${fromDate}T00:00:00`)
        if (created < from) return false
      }
      if (toDate) {
        const to = new Date(`${toDate}T23:59:59`)
        if (created > to) return false
      }
      return true
    })
  }, [listQuery.data, fromDate, toDate])

  const totalPages = Math.max(1, Math.ceil((listQuery.data?.total ?? 0) / 20))

  const openComposer = () => {
    setDuplicateSource(null)
    setView('composer')
  }

  const duplicate = (row: BroadcastRow) => {
    setDuplicateSource(row)
    setView('composer')
  }

  const handleCancel = (row: BroadcastRow) => {
    if (confirm(`Batalkan broadcast "${row.title}"? Penerima tidak akan menerima notifikasi ini.`)) {
      cancelMutation.mutate(row.id)
    }
  }

  if (view === 'composer') {
    return (
      <BroadcastComposer
        key={duplicateSource?.id ?? 'new'}
        initial={duplicateSource}
        onBack={() => {
          setView('list')
          setDuplicateSource(null)
        }}
      />
    )
  }

  return (
    <div className="space-y-8 animate-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black text-zinc-100 tracking-tight italic uppercase flex items-center gap-3">
            <Megaphone size={26} />
            Broadcast Center
          </h1>
          <p className="text-zinc-500 mt-1">Kirim pengumuman massal ke kurir &amp; pelanggan lewat push dan in-app.</p>
        </div>
        <button
          type="button"
          onClick={openComposer}
          className="px-6 py-3 rounded-2xl bg-primary text-white font-black text-sm uppercase tracking-widest hover:bg-primary-light shadow-lg shadow-primary/20 transition-all flex items-center gap-2 hover:scale-[1.02] active:scale-[0.98]"
        >
          <Plus size={18} />
          Buat Broadcast Baru
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between bg-white/[0.02] p-4 rounded-[28px] border border-white/5">
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter status broadcast">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => {
                setStatusFilter(f.value)
                setPage(1)
              }}
              aria-pressed={statusFilter === f.value}
              className={cn(
                'px-4 py-2 rounded-xl text-xs font-black transition-all',
                statusFilter === f.value
                  ? 'bg-primary/20 text-primary-light border border-primary/20'
                  : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5 border border-transparent',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label htmlFor="bc-from-date" className="text-[9px] font-black uppercase tracking-widest text-zinc-600 block">Dari</label>
            <input
              id="bc-from-date"
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs font-bold text-zinc-200 focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="bc-to-date" className="text-[9px] font-black uppercase tracking-widest text-zinc-600 block">Sampai</label>
            <input
              id="bc-to-date"
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs font-bold text-zinc-200 focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
          {(fromDate || toDate) && (
            <button
              type="button"
              onClick={() => {
                setFromDate('')
                setToDate('')
              }}
              className="pb-2 text-[10px] font-black uppercase tracking-widest text-zinc-500 hover:text-red-400 transition-colors"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="glass-card rounded-[40px] border-white/5 overflow-hidden shadow-2xl shadow-black/40">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/5 bg-white/[0.01]">
                {['Judul', 'Status', 'Targets', 'Success Rate', 'Dibuat Oleh', 'Waktu', 'Aksi'].map((head) => (
                  <th
                    key={head}
                    scope="col"
                    className="px-6 py-6 text-xs font-black text-zinc-500 uppercase tracking-[0.2em]"
                  >
                    {head}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {listQuery.isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={7} className="px-6 py-4">
                      <Skeleton className="h-12 w-full rounded-2xl" />
                    </td>
                  </tr>
                ))
              ) : listQuery.isError ? (
                <tr>
                  <td colSpan={7} className="px-8 py-16 text-center space-y-4">
                    <AlertCircle className="w-10 h-10 mx-auto text-red-400" />
                    <p className="text-zinc-100 font-black uppercase tracking-widest text-xs">Daftar broadcast gagal dimuat</p>
                    <p className="text-zinc-600 text-xs">
                      {(listQuery.error as any)?.response?.data?.message || 'Coba muat ulang.'}
                    </p>
                    <button
                      type="button"
                      onClick={() => listQuery.refetch()}
                      className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-300 text-[10px] font-black uppercase tracking-widest hover:bg-red-500/20 transition-all"
                    >
                      <RefreshCw size={14} />
                      Retry
                    </button>
                  </td>
                </tr>
              ) : rows.length > 0 ? (
                rows.map((row, i) => {
                  const rate = successRateOf(row)
                  const cancellable = ['draft', 'scheduled'].includes(row.status)
                  return (
                    <motion.tr
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.04 }}
                      key={row.id}
                      className="hover:bg-white/[0.02] transition-colors group"
                    >
                      <td className="px-6 py-6 max-w-xs">
                        <p className="font-bold text-zinc-100 truncate">{row.title}</p>
                        <p className="text-[11px] text-zinc-600 mt-1 line-clamp-1">{row.body}</p>
                        <div className="flex gap-1.5 mt-2">
                          <span className="px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-500 border border-white/5 text-[9px] uppercase font-bold">
                            {row.category}
                          </span>
                          <span className="px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-500 border border-white/5 text-[9px] uppercase font-bold">
                            {row.target_type}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-6">
                        <span className={cn(
                          'inline-flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border',
                          statusBadgeClass(row.status),
                        )}>
                          {row.status === 'sending' && (
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                          )}
                          {row.status}
                        </span>
                        {row.scheduled_at && row.status === 'scheduled' && (
                          <p className="text-[10px] text-amber-300/70 mt-2 flex items-center gap-1">
                            <Calendar size={10} /> {new Date(row.scheduled_at).toLocaleString('id-ID')}
                          </p>
                        )}
                      </td>
                      <td className="px-6 py-6">
                        <p className="text-sm font-black text-zinc-100 tabular-nums">
                          {(row.total_targets ?? 0).toLocaleString('id-ID')}
                        </p>
                        <p className="text-[10px] text-zinc-600 tabular-nums mt-0.5">
                          {row.sent_count ?? 0} terkirim • {row.opened_count ?? 0} dibuka
                        </p>
                      </td>
                      <td className="px-6 py-6">
                        {rate === null ? (
                          <span className="text-xs text-zinc-600 font-bold italic">—</span>
                        ) : (
                          <>
                            <span
                              className={cn(
                                'text-sm font-black tabular-nums',
                                rate >= 90 ? 'text-emerald-400' : rate >= 70 ? 'text-amber-400' : 'text-red-400',
                              )}
                            >
                              {rate}%
                            </span>
                            <div className="w-20 h-1.5 bg-white/5 rounded-full overflow-hidden mt-2">
                              <div
                                className={cn(
                                  'h-full rounded-full',
                                  rate >= 90 ? 'bg-emerald-500' : rate >= 70 ? 'bg-amber-500' : 'bg-red-500',
                                )}
                                style={{ width: `${rate}%` }}
                              />
                            </div>
                          </>
                        )}
                      </td>
                      <td className="px-6 py-6">
                        <p className="text-xs font-bold text-zinc-300">{row.created_by_name || 'Sistem'}</p>
                      </td>
                      <td className="px-6 py-6">
                        <p className="text-xs text-zinc-400">{new Date(row.created_at).toLocaleDateString('id-ID')}</p>
                        <p className="text-[10px] text-zinc-600 mt-0.5">
                          {new Date(row.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </td>
                      <td className="px-6 py-6">
                        <div className="flex items-center gap-2 opacity-100 md:opacity-60 md:group-hover:opacity-100 transition-opacity">
                          <button
                            type="button"
                            onClick={() => setReportId(row.id)}
                            title="Lihat report"
                            aria-label={`Lihat report ${row.title}`}
                            className="p-2.5 rounded-xl bg-white/5 text-zinc-500 hover:text-primary-light hover:bg-white/10 transition-all"
                          >
                            <BarChart3 size={16} />
                          </button>
                          <button
                            type="button"
                            onClick={() => duplicate(row)}
                            title="Duplikat sebagai draft baru"
                            aria-label={`Duplikat ${row.title}`}
                            className="p-2.5 rounded-xl bg-white/5 text-zinc-500 hover:text-white hover:bg-white/10 transition-all"
                          >
                            <Copy size={16} />
                          </button>
                          {cancellable && (
                            <button
                              type="button"
                              onClick={() => handleCancel(row)}
                              disabled={cancelMutation.isPending}
                              title={row.status === 'scheduled' ? 'Batalkan jadwal' : 'Hapus draft'}
                              aria-label={`Batalkan ${row.title}`}
                              className="p-2.5 rounded-xl bg-white/5 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-all disabled:opacity-50"
                            >
                              {cancelMutation.isPending && cancelMutation.variables === row.id ? (
                                <Loader2 size={16} className="animate-spin" />
                              ) : (
                                <XCircle size={16} />
                              )}
                            </button>
                          )}
                        </div>
                      </td>
                    </motion.tr>
                  )
                })
              ) : (
                <tr>
                  <td colSpan={7} className="px-8 py-20 text-center space-y-4">
                    <Megaphone className="w-10 h-10 mx-auto text-zinc-800" />
                    <p className="text-zinc-500 font-black uppercase tracking-widest text-xs">
                      Belum ada broadcast untuk filter ini.
                    </p>
                    <button
                      type="button"
                      onClick={openComposer}
                      className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-white/5 border border-white/10 text-zinc-400 text-[10px] font-black uppercase tracking-widest hover:text-white transition-all"
                    >
                      <Plus size={14} />
                      Buat broadcast pertama
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {!listQuery.isLoading && !listQuery.isError && (listQuery.data?.total ?? 0) > 0 && (
          <div className="px-8 py-6 border-t border-white/5 flex items-center justify-between bg-white/[0.01]">
            <p className="text-xs text-zinc-600 font-bold uppercase tracking-widest">
              Halaman {page} dari {totalPages} • {(listQuery.data?.total ?? 0).toLocaleString('id-ID')} broadcast
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page === 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                aria-label="Halaman sebelumnya"
                className="p-2.5 rounded-xl bg-white/5 text-zinc-500 hover:text-white disabled:opacity-30 transition-all"
              >
                <ChevronLeft size={18} />
              </button>
              <span className="text-sm font-black text-zinc-300 px-2 tabular-nums">{page}</span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                aria-label="Halaman berikutnya"
                className="p-2.5 rounded-xl bg-white/5 text-zinc-500 hover:text-white disabled:opacity-30 transition-all"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        )}
      </div>

      <BroadcastDeliveryReport
        broadcastId={reportId}
        title={rows.find((r) => r.id === reportId)?.title}
        onClose={() => setReportId(null)}
      />
    </div>
  )
}
