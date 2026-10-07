import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bike, CheckCircle2, Clock3, ExternalLink, PackageCheck, Wrench, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '../lib/api'
import { cn } from '../lib/utils'
import { AdminPageSkeleton } from '../components/ui/Skeleton'
import { StatusBadge } from '../components/StatusBadge'

const statuses = ['pending_review', 'enabled', 'rejected', 'all'] as const

const resolveUploadUrl = (fileUrl?: string) => {
  if (!fileUrl) return ''
  if (/^https?:\/\//i.test(fileUrl)) return fileUrl
  try {
    const base = new URL(api.defaults.baseURL || window.location.origin)
    return `${base.origin}${fileUrl}`
  } catch {
    return fileUrl
  }
}

const formatIdr = (value: number | string | undefined) =>
  `Rp ${new Intl.NumberFormat('id-ID').format(Number(value || 0))}`

const statusLabel: Record<string, string> = {
  pending_review: 'Menunggu review',
  enabled: 'Disetujui',
  rejected: 'Ditolak',
  all: 'Semua',
}

export default function CourierCapabilityApplications() {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<(typeof statuses)[number]>('pending_review')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['courier-capability-applications', status],
    queryFn: async () => {
      const response = await api.get('/admin/courier-capability-applications', { params: { status } })
      return response.data.data || []
    },
  })

  const review = useMutation({
    mutationFn: async ({ item, nextStatus }: { item: any; nextStatus: 'enabled' | 'rejected' }) => {
      const response = await api.patch(`/admin/couriers/${item.courier_profile_id}/service-capabilities`, {
        capabilities: [{
          service_code: item.service_code,
          status: nextStatus,
          eligibility_reason: nextStatus === 'enabled'
            ? 'Bukti alat, stok, tarif jasa, dan kendaraan disetujui admin.'
            : 'Pengajuan capability ditolak setelah review admin.',
        }],
      })
      return response.data
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['courier-capability-applications'] })
      setSelectedId(null)
      toast.success(variables.nextStatus === 'enabled' ? 'Capability Tambal Ban disetujui.' : 'Pengajuan capability ditolak.')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || error.response?.data?.error || error.message)
    },
  })

  const applications = data || []
  const selected = applications.find((item: any) => item.id === selectedId) || applications[0]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground-muted">Review Capability Tambal Ban</h1>
          <p className="mt-2 max-w-3xl text-sm text-foreground-muted">
            Review foto kamera, alat, stok, harga jasa mitra, dan tarif perjalanan admin sebelum layanan dibuka ke customer.
          </p>
        </div>
        <div className="flex rounded-2xl border border-border bg-surface/[0.03] p-1">
          {statuses.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => { setStatus(item); setSelectedId(null) }}
              className={cn(
                'rounded-xl px-4 py-2 text-sm font-bold transition',
                status === item ? 'bg-primary text-on-primary' : 'text-foreground-muted hover:text-foreground',
              )}
            >
              {statusLabel[item]}
            </button>
          ))}
        </div>
      </div>

      {isError && <div className="rounded-2xl border border-error/40 bg-error/10 p-4 text-sm text-error">Data review capability gagal dimuat.</div>}
      {isLoading ? <AdminPageSkeleton /> : (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[420px_1fr]">
          <div className="rounded-3xl border border-border bg-surface/[0.03]">
            <div className="border-b border-border p-5">
              <p className="text-sm font-bold text-foreground-muted">{applications.length} pengajuan</p>
              <p className="mt-1 text-xs text-foreground-muted">Pengajuan ditampilkan dari status capability, bukan status onboarding kurir.</p>
            </div>
            <div className="max-h-[720px] overflow-y-auto p-3">
              {applications.length === 0 ? (
                <div className="p-6 text-sm text-foreground-muted">Belum ada pengajuan pada status ini.</div>
              ) : applications.map((item: any) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedId(item.id)}
                  className={cn(
                    'mb-2 w-full rounded-2xl border p-4 text-left transition',
                    selected?.id === item.id ? 'border-primary bg-primary/10' : 'border-border bg-surface-subtle hover:bg-surface/[0.06]',
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-bold text-foreground-muted">{item.full_name || 'Mitra tanpa nama'}</p>
                      <p className="mt-1 text-xs text-foreground-muted">{item.service_name} • {item.vehicle_plate || 'Tanpa plat'}</p>
                    </div>
                    <StatusBadge status={item.status} labelPrefix="Capability status" />
                  </div>
                  <p className="mt-3 text-xs text-foreground-muted">Diperbarui {new Date(item.updated_at).toLocaleString('id-ID')}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-border bg-surface/[0.03] p-6">
            {!selected ? (
              <div className="flex min-h-[520px] items-center justify-center text-foreground-muted">Pilih pengajuan untuk direview.</div>
            ) : (
              <div className="space-y-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-foreground-muted">Pengajuan capability</p>
                    <h2 className="mt-2 text-3xl font-black text-foreground-muted">{selected.full_name}</h2>
                    <p className="mt-1 text-sm text-foreground-muted">{selected.email || 'No email'} • {selected.phone_number || '-'}</p>
                  </div>
                  <StatusBadge status={selected.status} labelPrefix="Capability status" />
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <InfoCard icon={Bike} label="Kendaraan" value={`${selected.vehicle_brand || '-'} ${selected.vehicle_model || ''} • ${selected.vehicle_plate || '-'}`} />
                  <InfoCard icon={Wrench} label="Tipe layanan" value={selected.service_name || selected.service_code} />
                  <InfoCard icon={Clock3} label="Status kurir" value={selected.courier_verification_status || '-'} />
                </div>

                <section className="rounded-2xl border border-border bg-surface-subtle p-5">
                  <div className="flex items-center gap-2 text-sm font-bold text-foreground-muted"><PackageCheck className="h-5 w-5 text-primary-light" />Data alat dan stok</div>
                  <div className="mt-4 grid gap-3 text-sm md:grid-cols-2">
                    <Meta label="Tipe ban" value={[selected.supports_tubeless && 'Tubeless', selected.supports_tube && 'Ban dalam'].filter(Boolean).join(' + ') || '-'} />
                    <Meta label="Peralatan" value={[selected.has_tire_repair_kit && 'Kit tambal', selected.has_electric_pump && 'Pompa elektrik'].filter(Boolean).join(' + ') || '-'} />
                    <Meta label="Stok material" value={formatInventory(selected.material_inventory)} />
                    <Meta label="Harga jasa mitra" value={formatIdr(selected.courier_price_per_hole_idr) + ' / lubang'} />
                  </div>
                </section>

                <section className="rounded-2xl border border-primary/30 bg-primary/5 p-5">
                  <p className="text-sm font-bold text-foreground-muted">Tarif perjalanan dari admin</p>
                  <div className="mt-4 grid gap-3 text-sm md:grid-cols-3">
                    <Meta label={`Base sampai ${selected.admin_included_distance_km || 0} km`} value={formatIdr(selected.admin_base_fare_idr)} />
                    <Meta label="Per km berikutnya" value={formatIdr(selected.admin_per_km_idr)} />
                    <Meta label="Potongan" value={selected.courier_keeps_service_fee ? 'Jasa mitra 100%; komisi dari perjalanan' : 'Mengikuti konfigurasi server'} />
                  </div>
                  <p className="mt-4 text-xs text-foreground-muted">Tarif ini tidak dapat diubah oleh mitra. Sumbernya adalah katalog layanan dan konfigurasi settlement server.</p>
                </section>

                <section className="rounded-2xl border border-border bg-surface-subtle p-5">
                  <p className="text-sm font-bold text-foreground-muted">Bukti foto kamera</p>
                  {resolveUploadUrl(selected.evidence_file_url) ? (
                    <div className="mt-4 space-y-3">
                      <img src={resolveUploadUrl(selected.evidence_file_url)} alt="Bukti alat tambal ban mitra" className="max-h-[440px] w-full rounded-2xl border border-border object-contain" />
                      <a href={resolveUploadUrl(selected.evidence_file_url)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm font-bold text-primary-light hover:text-foreground">
                        Buka bukti ukuran penuh <ExternalLink className="h-4 w-4" aria-hidden="true" />
                      </a>
                    </div>
                  ) : <p className="mt-3 text-sm text-error">Bukti foto belum tersedia.</p>}
                </section>

                {selected.status === 'pending_review' && (
                  <div className="flex flex-wrap gap-3">
                    <button type="button" onClick={() => review.mutate({ item: selected, nextStatus: 'enabled' })} disabled={review.isPending} className="inline-flex items-center gap-2 rounded-xl bg-success px-5 py-3 text-sm font-bold text-on-success disabled:opacity-60">
                      <CheckCircle2 className="h-4 w-4" /> Setujui capability
                    </button>
                    <button type="button" onClick={() => review.mutate({ item: selected, nextStatus: 'rejected' })} disabled={review.isPending} className="inline-flex items-center gap-2 rounded-xl bg-error px-5 py-3 text-sm font-bold text-on-error disabled:opacity-60">
                      <XCircle className="h-4 w-4" /> Tolak pengajuan
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function InfoCard({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return <div className="rounded-2xl border border-border bg-surface-subtle p-4"><Icon className="h-5 w-5 text-primary-light" aria-hidden="true" /><p className="mt-3 text-xs font-bold uppercase text-foreground-muted">{label}</p><p className="mt-1 text-sm font-bold text-foreground-muted">{value}</p></div>
}

function Meta({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs font-bold uppercase text-foreground-muted">{label}</p><p className="mt-1 font-bold text-foreground-muted">{value || '-'}</p></div>
}

function formatInventory(inventory: Record<string, number> | null | undefined) {
  if (!inventory || Object.keys(inventory).length === 0) return '-'
  return Object.entries(inventory).map(([key, value]) => `${key.replaceAll('_', ' ')}: ${value}`).join(' • ')
}
