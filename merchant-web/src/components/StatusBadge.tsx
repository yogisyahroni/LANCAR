const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  pending_merchant: { label: 'Order Baru', cls: 'bg-orange-100 text-orange-800' },
  scheduled: { label: 'Terjadwal', cls: 'bg-violet-100 text-violet-800' },
  preparing: { label: 'Diproses', cls: 'bg-amber-100 text-amber-800' },
  searching: { label: 'Cari Kurir', cls: 'bg-sky-100 text-sky-800' },
  accepted: { label: 'Kurir Menuju', cls: 'bg-sky-100 text-sky-800' },
  picking_up: { label: 'Kurir Tiba', cls: 'bg-sky-100 text-sky-800' },
  picked_up: { label: 'Diambil', cls: 'bg-blue-100 text-blue-800' },
  delivering: { label: 'Diantar', cls: 'bg-blue-100 text-blue-800' },
  delivered: { label: 'Selesai', cls: 'bg-emerald-100 text-emerald-800' },
  cancelled_by_merchant: { label: 'Ditolak Merchant', cls: 'bg-red-100 text-red-700' },
  cancelled_by_customer: { label: 'Dibatalkan Customer', cls: 'bg-red-100 text-red-700' },
  cancelled_by_system: { label: 'Dibatalkan Sistem', cls: 'bg-red-100 text-red-700' },
}

export default function StatusBadge({ status }: { status: string }) {
  const s = STATUS_MAP[status] || { label: status.replace(/_/g, ' '), cls: 'bg-zinc-100 text-zinc-600' }
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${s.cls}`}>
      {s.label}
    </span>
  )
}
