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
import { StatusBadge } from '../components/StatusBadge'

const STATUS_FILTERS = [
  { value: 'all', label: 'Semua' },
  { value: 'draft', label: 'Draft' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'sending', label: 'Sending' },
  { value: 'sent', label: 'Sent' },
  { value: 'failed', label: 'Failed' },
  { value: 'cancelled', label: 'Cancelled' },
]

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
          <h1 className="text-3xl font-black text-foreground-muted tracking-tight italic uppercase flex items-center gap-3">
            <Megaphone size={26} aria-hidden="true" />
            Broadcast Center
          </h1>
          <p className="text-foreground-muted mt-1">Kirim pengumuman massal ke kurir &amp; pelanggan lewat push dan in-app.</p>
        </div>
        <button
          type="button"
          onClick={openComposer}
          className="px-6 py-3 rounded-2xl bg-primary text-on-primary font-black text-sm uppercase tracking-widest hover:bg-primary-light shadow-lg shadow-primary/20 transition-all flex items-center gap-2 hover:scale-[1.02] active:scale-[0.98]"
        >
          <Plus size={18} aria-hidden="true" />
          Buat Broadcast Baru
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between bg-surface/[0.02] p-4 rounded-[28px] border border-border">
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
                    ? 'bg-primary-soft text-foreground border border-primary/20'
                  : 'text-foreground-muted hover:text-foreground-muted hover:bg-surface-subtle border border-transparent',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label htmlFor="bc-from-date" className="text-[9px] font-black uppercase tracking-widest text-foreground-muted block">Dari</label>
            <input
              id="bc-from-date"
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="bg-surface-subtle border border-border rounded-xl px-3 py-2 text-xs font-bold text-foreground-muted focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="bc-to-date" className="text-[9px] font-black uppercase tracking-widest text-foreground-muted block">Sampai</label>
            <input
              id="bc-to-date"
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="bg-surface-subtle border border-border rounded-xl px-3 py-2 text-xs font-bold text-foreground-muted focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
          {(fromDate || toDate) && (
            <button
              type="button"
              onClick={() => {
                setFromDate('')
                setToDate('')
              }}
              className="pb-2 text-[10px] font-black uppercase tracking-widest text-foreground-muted hover:text-error transition-colors"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="glass-card rounded-[40px] border-border overflow-hidden shadow-2xl shadow-scrim">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-border bg-surface/[0.01]">
                {['Judul', 'Status', 'Targets', 'Success Rate', 'Dibuat Oleh', 'Waktu', 'Aksi'].map((head) => (
                  <th
                    key={head}
                    scope="col"
                    className="px-6 py-6 text-xs font-black text-foreground-muted uppercase tracking-[0.2em]"
                  >
                    {head}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
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
                    <AlertCircle className="w-10 h-10 mx-auto text-error"  aria-hidden="true"/>
                    <p className="text-foreground-muted font-black uppercase tracking-widest text-xs">Daftar broadcast gagal dimuat</p>
                    <p className="text-foreground-muted text-xs">
                      {(listQuery.error as any)?.response?.data?.message || 'Coba muat ulang.'}
                    </p>
                    <button
                      type="button"
                      onClick={() => listQuery.refetch()}
                      className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-error-surface border border-error text-error text-[10px] font-black uppercase tracking-widest hover:bg-error-surface transition-all"
                    >
                      <RefreshCw size={14} aria-hidden="true" />
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
                      className="hover:bg-surface/[0.02] transition-colors group"
                    >
                      <td className="px-6 py-6 max-w-xs">
                        <p className="font-bold text-foreground-muted truncate">{row.title}</p>
                        <p className="text-[11px] text-foreground-muted mt-1 line-clamp-1">{row.body}</p>
                        <div className="flex gap-1.5 mt-2">
                          <span className="px-2 py-0.5 rounded-md bg-surface-raised text-foreground-muted border border-border text-[9px] uppercase font-bold">
                            {row.category}
                          </span>
                          <span className="px-2 py-0.5 rounded-md bg-surface-raised text-foreground-muted border border-border text-[9px] uppercase font-bold">
                            {row.target_type}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-6">
                        <StatusBadge status={row.status} labelPrefix="Broadcast status" className="text-[10px] uppercase tracking-widest" />
                        {row.scheduled_at && row.status === 'scheduled' && (
                          <p className="text-[10px] text-warning mt-2 flex items-center gap-1">
                            <Calendar size={10} aria-hidden="true" /> {new Date(row.scheduled_at).toLocaleString('id-ID')}
                          </p>
                        )}
                      </td>
                      <td className="px-6 py-6">
                        <p className="text-sm font-black text-foreground-muted tabular-nums">
                          {(row.total_targets ?? 0).toLocaleString('id-ID')}
                        </p>
                        <p className="text-[10px] text-foreground-muted tabular-nums mt-0.5">
                          {row.sent_count ?? 0} terkirim • {row.opened_count ?? 0} dibuka
                        </p>
                      </td>
                      <td className="px-6 py-6">
                        {rate === null ? (
                          <span className="text-xs text-foreground-muted font-bold italic">—</span>
                        ) : (
                          <>
                            <span
                              className={cn(
                                'text-sm font-black tabular-nums',
                                rate >= 90 ? 'text-success' : rate >= 70 ? 'text-warning' : 'text-error',
                              )}
                            >
                              {rate}%
                            </span>
                            <div className="w-20 h-1.5 bg-surface-subtle rounded-full overflow-hidden mt-2">
                              <div
                                className={cn(
                                  'h-full rounded-full',
                                  rate >= 90 ? 'bg-success' : rate >= 70 ? 'bg-warning' : 'bg-error',
                                )}
                                style={{ width: `${rate}%` }}
                              />
                            </div>
                          </>
                        )}
                      </td>
                      <td className="px-6 py-6">
                        <p className="text-xs font-bold text-foreground-muted">{row.created_by_name || 'Sistem'}</p>
                      </td>
                      <td className="px-6 py-6">
                        <p className="text-xs text-foreground-muted">{new Date(row.created_at).toLocaleDateString('id-ID')}</p>
                        <p className="text-[10px] text-foreground-muted mt-0.5">
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
                            className="p-2.5 rounded-xl bg-surface-subtle text-foreground-muted hover:text-primary-light hover:bg-surface-subtle transition-all"
                          >
                            <BarChart3 size={16} aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() => duplicate(row)}
                            title="Duplikat sebagai draft baru"
                            aria-label={`Duplikat ${row.title}`}
                            className="p-2.5 rounded-xl bg-surface-subtle text-foreground-muted hover:text-foreground hover:bg-surface-subtle transition-all"
                          >
                            <Copy size={16} aria-hidden="true" />
                          </button>
                          {cancellable && (
                            <button
                              type="button"
                              onClick={() => handleCancel(row)}
                              disabled={cancelMutation.isPending}
                              title={row.status === 'scheduled' ? 'Batalkan jadwal' : 'Hapus draft'}
                              aria-label={`Batalkan ${row.title}`}
                              className="p-2.5 rounded-xl bg-surface-subtle text-foreground-muted hover:text-error hover:bg-error-surface transition-all disabled:opacity-60"
                            >
                              {cancelMutation.isPending && cancelMutation.variables === row.id ? (
                                <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                              ) : (
                                <XCircle size={16} aria-hidden="true" />
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
                    <Megaphone className="w-10 h-10 mx-auto text-foreground-muted" aria-hidden="true" />
                    <p className="text-foreground-muted font-black uppercase tracking-widest text-xs">
                      Belum ada broadcast untuk filter ini.
                    </p>
                    <button
                      type="button"
                      onClick={openComposer}
                      className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-surface-subtle border border-border text-foreground-muted text-[10px] font-black uppercase tracking-widest hover:text-foreground transition-all"
                    >
                      <Plus size={14} aria-hidden="true" />
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
          <div className="px-8 py-6 border-t border-border flex items-center justify-between bg-surface/[0.01]">
            <p className="text-xs text-foreground-muted font-bold uppercase tracking-widest">
              Halaman {page} dari {totalPages} • {(listQuery.data?.total ?? 0).toLocaleString('id-ID')} broadcast
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page === 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                aria-label="Halaman sebelumnya"
                className="p-2.5 rounded-xl bg-surface-subtle text-foreground-muted hover:text-foreground disabled:opacity-60 transition-all"
              >
                <ChevronLeft size={18} aria-hidden="true" />
              </button>
              <span className="text-sm font-black text-foreground-muted px-2 tabular-nums">{page}</span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                aria-label="Halaman berikutnya"
                className="p-2.5 rounded-xl bg-surface-subtle text-foreground-muted hover:text-foreground disabled:opacity-60 transition-all"
              >
                <ChevronRight size={18} aria-hidden="true" />
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
