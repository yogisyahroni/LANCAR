import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertOctagon, Clock, MapPin, Package, ShieldAlert, UserRound, MapPinned, Check } from 'lucide-react'
import { api } from '../lib/api'
import { cn } from '../lib/utils'
import { toast } from 'sonner'

const severityStyles: Record<string, string> = {
  critical: 'border-red-500/40 bg-red-500/10 text-red-200',
  high: 'border-orange-500/40 bg-orange-500/10 text-orange-200',
  medium: 'border-amber-500/40 bg-amber-500/10 text-amber-200',
  low: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200',
}

const eventLabels: Record<string, string> = {
  sos: 'SOS',
  report_sender: 'Laporan Pengirim',
  report_recipient: 'Laporan Penerima',
  prohibited_goods: 'Barang Bermasalah',
  road_incident: 'Insiden Jalan',
  support_request: 'Bantuan Operasional',
}

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
  const { data, isLoading } = useQuery({
    queryKey: ['courier-safety-events'],
    queryFn: async () => {
      const res = await api.get('/admin/courier-safety-events')
      return res.data.data || []
    },
    refetchInterval: 30_000,
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
          <p className="text-xs font-black uppercase tracking-[0.32em] text-primary-light">Courier Safety Command</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-zinc-100">Safety Events</h1>
          <p className="mt-2 text-sm text-zinc-500">
            Pantau SOS, laporan barang, dan kebutuhan bantuan operasional kurir on-demand.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4">
            <p className="text-xs font-bold uppercase tracking-widest text-zinc-500">Open</p>
            <p className="mt-1 text-2xl font-black text-white">{openEvents}</p>
          </div>
          <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-5 py-4">
            <p className="text-xs font-bold uppercase tracking-widest text-red-300/70">Critical</p>
            <p className="mt-1 text-2xl font-black text-red-100">{criticalEvents}</p>
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-white/10 bg-zinc-900/60">
        {isLoading ? (
          <div className="flex h-56 items-center justify-center text-zinc-500">Memuat safety events...</div>
        ) : events.length === 0 ? (
          <div className="flex h-56 flex-col items-center justify-center gap-3 text-zinc-500">
            <ShieldAlert className="h-9 w-9" />
            <p className="font-bold">Belum ada safety event aktif</p>
          </div>
        ) : (
          <div className="divide-y divide-white/10">
            {events.map((event: any) => (
              <div key={event.id} className="grid gap-4 p-5 lg:grid-cols-[1.1fr_1.4fr_0.8fr]">
                <div className="flex gap-3">
                  <div className={cn('flex h-11 w-11 items-center justify-center rounded-2xl border', severityStyles[event.severity] || severityStyles.medium)}>
                    <AlertOctagon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-black text-zinc-100">{eventLabels[event.event_type] || event.event_type}</h3>
                      <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-widest', severityStyles[event.severity] || severityStyles.medium)}>
                        {event.severity}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm text-zinc-400">{event.message || 'Tidak ada catatan tambahan.'}</p>
                  </div>
                </div>

                <div className="grid gap-2 text-sm text-zinc-400 sm:grid-cols-2">
                  <div className="flex items-center gap-2">
                    <UserRound className="h-4 w-4 text-primary-light" />
                    <span className="truncate">{event.courier_name || 'Courier'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Package className="h-4 w-4 text-primary-light" />
                    <span className="truncate">{event.order_id || 'Tanpa order'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-primary-light" />
                    <span>{event.latitude && event.longitude ? `${Number(event.latitude).toFixed(5)}, ${Number(event.longitude).toFixed(5)}` : 'Lokasi tidak dikirim'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-primary-light" />
                    <span>{formatDate(event.created_at)}</span>
                  </div>
                </div>

                <div className="flex items-center justify-end">
                  <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-bold uppercase tracking-widest text-zinc-300">
                    {event.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <section className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.28em] text-orange-300">Evidence control</p>
            <h2 className="mt-1 text-xl font-black text-zinc-100">GPS / Geofence Risk</h2>
            <p className="mt-1 text-sm text-zinc-500">Bukti tetap immutable; operator mengelola tindak lanjutnya di sini.</p>
          </div>
          <span className="rounded-full border border-orange-500/30 bg-orange-500/10 px-3 py-1 text-xs font-black text-orange-200">
            {(gpsRiskData || []).filter((item: any) => item.action_status !== 'resolved').length} open
          </span>
        </div>
        <div className="rounded-3xl border border-orange-500/20 bg-orange-500/[0.04]">
          {isGpsRiskLoading ? (
            <div className="p-8 text-center text-zinc-500">Memuat GPS risk...</div>
          ) : (gpsRiskData || []).length === 0 ? (
            <div className="flex flex-col items-center gap-2 p-8 text-zinc-500"><MapPinned className="h-8 w-8" /><p className="font-bold">Belum ada GPS risk alert</p></div>
          ) : (
            <div className="divide-y divide-white/10">
              {(gpsRiskData || []).map((item: any) => (
                <div key={item.id} className="grid gap-4 p-5 lg:grid-cols-[1.4fr_1fr_auto] lg:items-center">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-black text-zinc-100">{item.courier_name || 'Courier'} · {item.proof_step}</p>
                      <span className="rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-red-200">{item.spoof_risk || item.rejection_reason}</span>
                    </div>
                    <p className="mt-1 text-xs text-zinc-500">Order {item.order_number || item.order_id} · {item.distance_m ?? '-'}m / radius {item.radius_m ?? '-'}m · akurasi {item.accuracy_m ?? '-'}m</p>
                  </div>
                  <p className="text-xs text-zinc-400">Status tindak lanjut: <strong className="text-zinc-200">{item.action_status}</strong></p>
                  <div className="flex justify-end gap-2">
                    {item.action_status === 'open' && <button type="button" onClick={() => gpsRiskMutation.mutate({ id: item.id, status: 'acknowledged' })} disabled={gpsRiskMutation.isPending} className="rounded-xl border border-white/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-zinc-300 hover:bg-white/10 disabled:opacity-50">Acknowledge</button>}
                    {item.action_status !== 'resolved' && <button type="button" onClick={() => gpsRiskMutation.mutate({ id: item.id, status: 'resolved' })} disabled={gpsRiskMutation.isPending} className="inline-flex items-center gap-1 rounded-xl bg-orange-500 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-zinc-950 hover:bg-orange-400 disabled:opacity-50"><Check className="h-3 w-3" /> Resolve</button>}
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
