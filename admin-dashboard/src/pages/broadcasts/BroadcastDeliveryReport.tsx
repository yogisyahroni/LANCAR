import { useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  AlertCircle,
  CheckCircle2,
  Download,
  Eye,
  Loader2,
  Send,
  X,
} from 'lucide-react'
import { cn } from '../../lib/utils'
import { api } from '../../lib/api'
import { FocusTrap } from '../../components/a11y/FocusTrap'
import { Skeleton } from '../../components/ui/Skeleton'

interface DeliveryReportData {
  broadcast_id: string
  status?: string
  scheduled_at?: string | null
  sent_at?: string | null
  totals: {
    total_targets: number
    sent_count: number
    failed_count: number
    opened_count: number
  }
  per_channel: Array<{
    channel: string
    pending: number
    sent: number
    failed: number
    opened: number
  }>
}

interface ReportModalProps {
  broadcastId: string | null
  title?: string
  onClose: () => void
}

const channelLabel = (channel: string) =>
  channel === 'push' ? 'Push (FCM)' : channel === 'in_app' ? 'In-app' : channel

export default function BroadcastDeliveryReport({ broadcastId, title, onClose }: ReportModalProps) {
  useEffect(() => {
    if (!broadcastId) return undefined

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }

    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [broadcastId, onClose])

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['broadcast-report', broadcastId],
    queryFn: async (): Promise<DeliveryReportData> => {
      const res = await api.get(`/admin/broadcasts/${broadcastId}/report`)
      return res.data?.data ?? res.data
    },
    enabled: Boolean(broadcastId),
    refetchInterval: (query) => {
      const status = query.state.data?.status
      return status === 'sending' || !status ? 5000 : false
    },
  })

  const successRate = useMemo(() => {
    const totals = data?.totals
    if (!totals) return null
    const attempted = totals.sent_count + totals.failed_count
    if (attempted === 0) return null
    return Math.round((totals.sent_count / attempted) * 100)
  }, [data?.totals])

  // Backend belum menyediakan daftar alasan gagal per penerima;
  // render jika endpoint mulai mengembalikan field ini.
  const failedReasons = (data as any)?.failed_reasons as
    | Array<{ reason: string; count: number }>
    | undefined

  const exportCsv = () => {
    if (!data) return
    const rows: string[][] = [
      ['Broadcast ID', data.broadcast_id],
      ['Status', data.status ?? ''],
      ['Total Targets', String(data.totals.total_targets)],
      ['Sent', String(data.totals.sent_count)],
      ['Failed', String(data.totals.failed_count)],
      ['Opened', String(data.totals.opened_count)],
      ['Success Rate (%)', successRate !== null ? String(successRate) : 'n/a'],
      [],
      ['Channel', 'Pending', 'Sent', 'Failed', 'Opened'],
      ...data.per_channel.map((c) => [
        c.channel,
        String(c.pending),
        String(c.sent),
        String(c.failed),
        String(c.opened),
      ]),
    ]
    const csv = rows
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\r\n')
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute(
      'download',
      `broadcast_report_${data.broadcast_id.slice(0, 8)}_${new Date().toISOString().split('T')[0]}.csv`,
    )
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.URL.revokeObjectURL(url)
  }

  if (!broadcastId) return null

  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center p-4 md:p-6">
      <div className="absolute inset-0 bg-scrim/80 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <FocusTrap className="relative z-10 outline-none w-full max-w-2xl">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="bc-report-title"
          className="glass-card w-full max-h-[90vh] overflow-y-auto rounded-[36px] border-border shadow-2xl shadow-scrim p-8 space-y-8"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id="bc-report-title" className="text-xl font-black text-foreground-muted tracking-tight">
                Delivery Report
              </h2>
              <p className="text-xs text-foreground-muted mt-1 truncate max-w-sm" title={title || 'Detail pengiriman broadcast'}>
                {title || 'Detail pengiriman broadcast'}
              </p>
              {data && (
                <p className="text-[10px] text-foreground-muted font-mono mt-1">{data.broadcast_id}</p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Tutup laporan"
              title="Tutup laporan"
              className="p-3 rounded-2xl bg-surface-subtle text-foreground-muted hover:text-foreground transition-all shrink-0"
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>

          {isLoading ? (
            <div className="space-y-6" aria-hidden="true">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-24 rounded-[28px]" />
                ))}
              </div>
              <Skeleton className="h-40 rounded-[28px]" />
            </div>
          ) : isError ? (
            <div className="rounded-3xl border border-error bg-error-surface p-8 text-center space-y-3">
              <AlertCircle size={32} className="mx-auto text-error"  aria-hidden="true"/>
              <p className="text-xs font-black uppercase tracking-widest text-foreground-muted">
                Laporan gagal dimuat
              </p>
              <p className="text-xs text-foreground-muted">
                {(error as any)?.response?.data?.message || (error as Error)?.message || 'Coba lagi nanti.'}
              </p>
              <button
                type="button"
                onClick={() => refetch()}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-error-surface border border-error text-error text-[10px] font-black uppercase tracking-widest hover:bg-error-surface transition-all"
              >
                Retry
              </button>
            </div>
          ) : data ? (
            <>
              {/* Totals */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  {
                    label: 'Total Target',
                    value: data.totals.total_targets,
                    icon: Send,
                    color: 'text-foreground-muted',
                  },
                  {
                    label: 'Berhasil',
                    value: data.totals.sent_count,
                    icon: CheckCircle2,
                    color: 'text-success',
                  },
                  {
                    label: 'Gagal',
                    value: data.totals.failed_count,
                    icon: AlertCircle,
                    color: 'text-error',
                  },
                  {
                    label: 'Dibuka',
                    value: data.totals.opened_count,
                    icon: Eye,
                    color: 'text-primary-light',
                  },
                ].map((stat) => (
                  <div key={stat.label} className="rounded-[28px] bg-surface/[0.03] border border-border p-5">
                    <stat.icon size={16} className={cn(stat.color)} aria-hidden="true" />
                    <p className="mt-3 text-2xl font-black text-foreground-muted tabular-nums">
                      {stat.value.toLocaleString('id-ID')}
                    </p>
                    <p className="text-[9px] font-black uppercase tracking-widest text-foreground-muted mt-1">
                      {stat.label}
                    </p>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-black uppercase tracking-widest text-foreground-muted">Success Rate</span>
                  {successRate === null ? (
                    <span className="text-xs font-bold text-foreground-muted italic">Belum ada percobaan kirim</span>
                  ) : (
                    <>
                      <div className="w-40 h-2 rounded-full bg-surface-subtle overflow-hidden" role="presentation">
                        <div
                          className={cn(
                            'h-full rounded-full transition-all duration-500',
                            successRate >= 90 ? 'bg-success' : successRate >= 70 ? 'bg-warning' : 'bg-error',
                          )}
                          style={{ width: `${successRate}%` }}
                        />
                      </div>
                      <span className="text-sm font-black text-foreground-muted tabular-nums">{successRate}%</span>
                    </>
                  )}
                </div>
                <button
                  type="button"
                  onClick={exportCsv}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-surface-subtle border border-border text-foreground-muted text-[10px] font-black uppercase tracking-widest hover:bg-surface-subtle transition-all"
                >
                  <Download size={14} aria-hidden="true" />
                  Export CSV
                </button>
              </div>

              {/* Per-channel breakdown */}
              <section aria-labelledby="bc-report-channels" className="space-y-3">
                <h3 id="bc-report-channels" className="text-[10px] font-black uppercase tracking-[0.22em] text-foreground-muted">
                  Breakdown per Channel
                </h3>
                {data.per_channel.length === 0 ? (
                  <p className="text-xs text-foreground-muted italic rounded-2xl border border-dashed border-border p-6 text-center">
                    Belum ada baris penerima untuk broadcast ini.
                  </p>
                ) : (
                  <div className="overflow-x-auto rounded-[28px] border border-border">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="border-b border-border bg-surface/[0.01]">
                          {['Channel', 'Pending', 'Sent', 'Failed', 'Opened'].map((head) => (
                            <th
                              key={head}
                              scope="col"
                              className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-foreground-muted"
                            >
                              {head}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {data.per_channel.map((row) => (
                          <tr key={row.channel} className="hover:bg-surface/[0.02] transition-colors">
                            <td className="px-6 py-4 text-xs font-black text-foreground-muted">{channelLabel(row.channel)}</td>
                            <td className="px-6 py-4 text-xs font-bold text-foreground-muted tabular-nums">{row.pending}</td>
                            <td className="px-6 py-4 text-xs font-bold text-success tabular-nums">{row.sent}</td>
                            <td className="px-6 py-4 text-xs font-bold text-error tabular-nums">{row.failed}</td>
                            <td className="px-6 py-4 text-xs font-bold text-primary-light tabular-nums">{row.opened}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              {/* Failed reasons (opsional dari backend) */}
              {failedReasons && failedReasons.length > 0 && (
                <section aria-labelledby="bc-report-failed" className="space-y-3">
                  <h3 id="bc-report-failed" className="text-[10px] font-black uppercase tracking-[0.22em] text-foreground-muted">
                    Alasan Kegagalan
                  </h3>
                  <ul className="space-y-2">
                    {failedReasons.map((item, i) => (
                      <li
                        key={`${item.reason}-${i}`}
                        className="flex items-center justify-between rounded-2xl bg-error-surface border border-error px-4 py-3"
                      >
                        <span className="text-xs font-bold text-error truncate" title={item.reason}>{item.reason}</span>
                        <span className="text-xs font-black text-foreground-muted tabular-nums ml-4 shrink-0">
                          {item.count.toLocaleString('id-ID')}x
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {data.status === 'sending' && (
                <p className="flex items-center gap-2 text-[11px] font-bold text-info">
                  <Loader2 size={12} className="animate-spin" aria-hidden="true" />
                  Broadcast sedang diproses — laporan akan diperbarui otomatis.
                </p>
              )}
            </>
          ) : null}
        </div>
      </FocusTrap>
    </div>
  )
}
