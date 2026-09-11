import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertOctagon, Ban, Check, CircleCheck, Clock, MapPin, MapPinned, MessageSquare, Package, RefreshCw, ShieldAlert, UserRound } from 'lucide-react'
import { api } from '../lib/api'
import { cn } from '../lib/utils'
import { toast } from 'sonner'
import { StatusBadge } from '../components/StatusBadge'

const severityStyles: Record<string, string> = {
  critical: 'border-error bg-error-surface text-error',
  high: 'border-accent bg-accent-surface text-accent',
  medium: 'border-warning bg-warning-surface text-warning',
  low: 'border-success bg-success-surface text-success',
}

const eventLabels: Record<string, string> = {
  sos: 'SOS',
  report_sender: 'Laporan Pengirim',
  report_recipient: 'Laporan Penerima',
  prohibited_goods: 'Barang Bermasalah',
  road_incident: 'Insiden Jalan',
  support_request: 'Bantuan Operasional',
}

const queueLabels: Record<string, string> = {
  safety_emergency: 'Safety emergency',
  safety_review: 'Safety review',
  active_job_operations: 'Active-job operations',
  general_operations: 'General operations',
}

const actionLabels: Record<string, string> = {
  reassign: 'Tugaskan ulang',
  cancel: 'Batalkan order',
  compensation: 'Kompensasi',
}

const idempotencyKey = (scope: string) => `courier-support-${scope}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`

const formatDate = (value?: string) => {
  if (!value) return '-'
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

export default function CourierSafetyEvents() {
  const queryClient = useQueryClient()
  const [queueFilter, setQueueFilter] = useState('all')
  const { data, isLoading } = useQuery({
    queryKey: ['courier-support-queue', queueFilter],
    queryFn: async () => {
      const res = await api.get('/admin/courier-support/queue', {
        params: queueFilter === 'all' ? undefined : { queue_code: queueFilter },
      })
      return res.data.data || []
    },
    refetchInterval: 30_000,
  })

  const supportStatusMutation = useMutation({
    mutationFn: ({ eventId, status }: { eventId: string; status: 'acknowledged' | 'resolved' | 'dismissed' }) =>
      api.patch(`/admin/courier-safety-events/${eventId}`, { status }, {
        headers: { 'X-Idempotency-Key': idempotencyKey(`status-${eventId}`) },
      }),
    onSuccess: () => {
      toast.success('Status support diperbarui')
      queryClient.invalidateQueries({ queryKey: ['courier-support-queue'] })
    },
    onError: (error: any) => toast.error(error.response?.data?.message || 'Status support gagal diperbarui'),
  })

  const supportActionMutation = useMutation({
    mutationFn: async ({ event, action }: { event: any; action: any }) => {
      if (!action?.available) throw new Error(`Action ${action?.action || 'support'} belum memiliki referensi lengkap`)
      if (action.action === 'reassign') {
        return api.post(action.endpoint, {
          courier_id: 'pending',
          reason: `Courier support: ${event.issue?.issue_code || event.event_type}`,
        }, { headers: { 'X-Idempotency-Key': idempotencyKey(`reassign-${event.id}`) } })
      }
      if (action.action === 'cancel') {
        const totpCode = window.prompt('Masukkan kode TOTP untuk membatalkan order:')?.trim()
        if (!totpCode) throw new Error('TOTP wajib untuk cancel order')
        return api.post(action.endpoint, {
          reason: `Courier support: ${event.issue?.issue_code || event.event_type}`,
          refund_mode: 'none',
          restock: true,
        }, {
          headers: {
            'X-Idempotency-Key': idempotencyKey(`cancel-${event.id}`),
            'x-totp-code': totpCode,
          },
        })
      }
      if (action.action === 'compensation') {
        const note = window.prompt('Catatan kompensasi customer:')?.trim()
        if (!note) throw new Error('Catatan kompensasi wajib diisi')
        const totpCode = window.prompt('Masukkan kode TOTP untuk kompensasi:')?.trim()
        if (!totpCode) throw new Error('TOTP wajib untuk kompensasi')
        return api.patch(action.endpoint, {
          status: 'resolved',
          resolution: 'customer',
          resolution_note: note,
          include_delivery_fee: true,
        }, {
          headers: {
            'X-Idempotency-Key': idempotencyKey(`compensation-${event.id}`),
            'x-totp-code': totpCode,
          },
        })
      }
      throw new Error('Action support tidak dikenali')
    },
    onSuccess: () => {
      toast.success('Action support diteruskan ke domain API')
      queryClient.invalidateQueries({ queryKey: ['courier-support-queue'] })
      queryClient.invalidateQueries({ queryKey: ['admin-orders'] })
    },
    onError: (error: any) => toast.error(error.response?.data?.message || error.response?.data?.error || error.message || 'Action support gagal'),
  })

  const { data: gpsRiskData, isLoading: isGpsRiskLoading } = useQuery({
    queryKey: ['courier-gps-risk-alerts'],
    queryFn: async () => (await api.get('/admin/gps-risk-alerts')).data.data || [],
    refetchInterval: 30_000,
  })
  const gpsRiskMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'acknowledged' | 'resolved' }) =>
      api.patch(`/admin/gps-risk-alerts/${id}`, { status }),
    onSuccess: (_, variables) => {
      toast.success(variables.status === 'resolved' ? 'GPS risk diselesaikan' : 'GPS risk di-acknowledge')
      queryClient.invalidateQueries({ queryKey: ['courier-gps-risk-alerts'] })
    },
    onError: () => toast.error('Status GPS risk gagal diperbarui'),
  })

  const events = data || []
  const openEvents = events.filter((event: any) => ['open', 'acknowledged'].includes(event.status)).length
  const criticalEvents = events.filter((event: any) => event.severity === 'critical').length

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-primary-light">Courier Safety Command</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-foreground-muted">Safety Events</h1>
          <p className="mt-2 text-sm text-foreground-muted">
            Pantau SOS, laporan barang, dan kebutuhan bantuan operasional kurir on-demand.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-border bg-surface/[0.04] px-5 py-4">
            <p className="text-xs font-bold uppercase tracking-wide text-foreground-muted">Open</p>
            <p className="mt-1 text-2xl font-black text-foreground">{openEvents}</p>
          </div>
          <div className="rounded-2xl border border-error bg-error-surface px-5 py-4">
            <p className="text-xs font-bold uppercase tracking-wide text-error">Critical</p>
            <p className="mt-1 text-2xl font-black text-error">{criticalEvents}</p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2" aria-label="Support queue filter">
        {['all', 'safety_emergency', 'safety_review', 'active_job_operations', 'general_operations'].map((queue) => (
          <button
            key={queue}
            type="button"
            onClick={() => setQueueFilter(queue)}
            className={cn(
              'rounded-xl border px-3 py-2 text-xs font-bold tracking-wide transition-colors',
              queueFilter === queue
                ? 'border-primary/50 bg-primary/15 text-foreground'
                : 'border-border bg-surface/[0.04] text-foreground-muted hover:bg-surface-subtle',
            )}
          >
            {queue === 'all' ? 'Semua queue' : queueLabels[queue]}
          </button>
        ))}
      </div>

      <div className="rounded-3xl border border-border bg-surface-subtle">
        {isLoading ? (
          <div className="flex h-56 items-center justify-center text-foreground-muted">Memuat safety events...</div>
        ) : events.length === 0 ? (
          <div className="flex h-56 flex-col items-center justify-center gap-3 text-foreground-muted">
            <ShieldAlert className="h-9 w-9" aria-hidden="true" />
            <p className="font-bold">Belum ada safety event aktif</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {events.map((event: any) => (
              <div key={event.id} className="grid gap-4 p-5 lg:grid-cols-[1.1fr_1.4fr_0.8fr]">
                <div className="flex gap-3">
                  <div className={cn('flex h-11 w-11 items-center justify-center rounded-2xl border', severityStyles[event.severity] || severityStyles.medium)}>
                    <AlertOctagon className="h-5 w-5"  aria-hidden="true"/>
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-black text-foreground-muted">{eventLabels[event.event_type] || event.event_type}</h3>
                      <StatusBadge
                        status={event.severity || 'medium'}
                        labelPrefix="Safety severity"
                        className={cn('rounded-full', severityStyles[event.severity] || severityStyles.medium)}
                      />
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm text-foreground-muted" title={event.message || 'Tidak ada catatan tambahan.'}>{event.message || 'Tidak ada catatan tambahan.'}</p>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs font-bold tracking-wide">
                      <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-1 text-primary-light">
                        {queueLabels[event.routing?.queueCode] || event.routing?.queueCode || 'Queue belum dipetakan'}
                      </span>
                      <span className="rounded-full border border-border bg-surface/[0.04] px-2 py-1 text-foreground-muted">
                        target: {event.issue?.reported_party || 'other'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="grid gap-2 text-sm text-foreground-muted sm:grid-cols-2">
                  <div className="flex items-center gap-2">
                    <UserRound className="h-4 w-4 text-primary-light" aria-hidden="true" />
                    <span className="truncate" title={event.courier_name || 'Courier'}>{event.courier_name || 'Courier'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Package className="h-4 w-4 text-primary-light" aria-hidden="true" />
                    <span className="truncate" title={event.order_id || 'Tanpa order'}>{event.order_id || 'Tanpa order'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-primary-light" aria-hidden="true" />
                    <span>{event.references?.location ? `${Number(event.references.location.latitude).toFixed(3)}, ${Number(event.references.location.longitude).toFixed(3)}` : event.references?.location_captured ? 'Lokasi tersedia sesuai role' : 'Lokasi tidak dikirim'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 text-primary-light" aria-hidden="true" />
                    <span>{event.references?.conversation_id ? 'Chat terhubung' : 'Tidak ada chat'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-primary-light" aria-hidden="true" />
                    <span>{formatDate(event.created_at)}</span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2">
                  <StatusBadge status={event.status} labelPrefix="Safety event status" className="text-xs uppercase tracking-wide" />
                  {event.status === 'open' && event.supported_actions?.some((action: any) => ['safety_escalation', 'safety_review'].includes(action.action)) && (
                    <button
                      type="button"
                      onClick={() => supportStatusMutation.mutate({ eventId: event.id, status: 'acknowledged' })}
                      disabled={supportStatusMutation.isPending}
                      className="inline-flex items-center gap-1 rounded-xl border border-accent bg-accent-surface px-3 py-2 text-xs font-bold tracking-wide text-accent hover:bg-accent-surface disabled:opacity-60"
                    >
                      <ShieldAlert className="h-3 w-3" aria-hidden="true" /> Acknowledge
                    </button>
                  )}
                  {event.status !== 'resolved' && event.status !== 'dismissed' && event.supported_actions?.some((action: any) => action.action === 'safety_escalation') && (
                    <button
                      type="button"
                      onClick={() => supportStatusMutation.mutate({ eventId: event.id, status: 'resolved' })}
                      disabled={supportStatusMutation.isPending}
                      className="inline-flex items-center gap-1 rounded-xl bg-success px-3 py-2 text-xs font-bold tracking-wide text-on-success hover:bg-success disabled:opacity-60"
                    >
                      <CircleCheck className="h-3 w-3" aria-hidden="true" /> Resolve
                    </button>
                  )}
                  {(event.supported_actions || []).filter((action: any) => action.available && ['reassign', 'cancel', 'compensation'].includes(action.action)).map((action: any) => (
                    <button
                      key={action.action}
                      type="button"
                      onClick={() => {
                        if (action.action === 'cancel' && !window.confirm('Batalkan order melalui domain API?')) return
                        if (action.action === 'reassign' && !window.confirm('Kirim order kembali ke matching melalui domain API?')) return
                        supportActionMutation.mutate({ event, action })
                      }}
                      disabled={supportActionMutation.isPending}
                      className="inline-flex items-center gap-1 rounded-xl border border-border bg-surface/[0.04] px-3 py-2 text-xs font-bold tracking-wide text-foreground-muted hover:bg-surface-subtle disabled:opacity-60"
                    >
                      {action.action === 'reassign' ? <RefreshCw className="h-3 w-3" aria-hidden="true" /> : action.action === 'cancel' ? <Ban className="h-3 w-3" aria-hidden="true" /> : <Check className="h-3 w-3" aria-hidden="true" />}
                      {actionLabels[action.action] || action.action}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <section className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-wide text-accent">Evidence control</p>
            <h2 className="mt-1 text-xl font-black text-foreground-muted">GPS / Geofence Risk</h2>
            <p className="mt-1 text-sm text-foreground-muted">Bukti tetap immutable; operator mengelola tindak lanjutnya di sini.</p>
          </div>
          <span className="rounded-full border border-accent bg-accent-surface px-3 py-1 text-xs font-black text-accent">
            {(gpsRiskData || []).filter((item: any) => item.action_status !== 'resolved').length} open
          </span>
        </div>
        <div className="rounded-3xl border border-accent bg-accent/[0.04]">
          {isGpsRiskLoading ? (
            <div className="p-8 text-center text-foreground-muted">Memuat GPS risk...</div>
          ) : (gpsRiskData || []).length === 0 ? (
            <div className="flex flex-col items-center gap-2 p-8 text-foreground-muted"><MapPinned className="h-8 w-8" aria-hidden="true" /><p className="font-bold">Belum ada GPS risk alert</p></div>
          ) : (
            <div className="divide-y divide-border">
              {(gpsRiskData || []).map((item: any) => (
                <div key={item.id} className="grid gap-4 p-5 lg:grid-cols-[1.4fr_1fr_auto] lg:items-center">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-black text-foreground-muted">{item.courier_name || 'Courier'} · {item.proof_step}</p>
                      <StatusBadge
                        status={item.spoof_risk || 'critical'}
                        labelPrefix="GPS spoof risk"
                        label={item.spoof_risk || item.rejection_reason || 'Risk terdeteksi'}
                        className="border-error bg-error-surface text-error"
                      />
                    </div>
                    <p className="mt-1 text-xs text-foreground-muted">Order {item.order_number || item.order_id} · {item.distance_m ?? '-'}m / radius {item.radius_m ?? '-'}m · akurasi {item.accuracy_m ?? '-'}m</p>
                  </div>
                  <p className="flex flex-wrap items-center gap-2 text-xs text-foreground-muted">Status tindak lanjut: <StatusBadge status={item.action_status} labelPrefix="GPS risk action" /></p>
                  <div className="flex justify-end gap-2">
                    {item.action_status === 'open' && <button type="button" onClick={() => gpsRiskMutation.mutate({ id: item.id, status: 'acknowledged' })} disabled={gpsRiskMutation.isPending} className="rounded-xl border border-border px-3 py-2 text-xs font-bold tracking-wide text-foreground-muted hover:bg-surface-subtle disabled:opacity-60">Acknowledge</button>}
                    {item.action_status !== 'resolved' && <button type="button" onClick={() => gpsRiskMutation.mutate({ id: item.id, status: 'resolved' })} disabled={gpsRiskMutation.isPending} className="inline-flex items-center gap-1 rounded-xl bg-accent px-3 py-2 text-xs font-bold tracking-wide text-on-accent hover:bg-accent disabled:opacity-60"><Check className="h-3 w-3" aria-hidden="true" /> Resolve</button>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
