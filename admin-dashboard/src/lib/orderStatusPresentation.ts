import { CheckCircle2, CircleHelp, Clock, Truck, XCircle, type LucideIcon } from 'lucide-react'

export type OrderStatusPresentation = {
  label: string
  icon: LucideIcon
  className: string
}

const humanize = (status: string) =>
  status.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())

/** Admin order status keeps a readable label/icon; color is supplemental. */
export const getOrderStatusPresentation = (status?: unknown): OrderStatusPresentation => {
  const normalized = String(status || '').trim().toLowerCase()
  switch (normalized) {
    case 'created':
    case 'pending':
    case 'pending_payment':
      return { label: normalized === 'pending_payment' ? 'Menunggu pembayaran' : normalized === 'created' ? 'Dibuat' : 'Menunggu diproses', icon: Clock, className: 'text-warning' }
    case 'scheduled':
      return { label: 'Terjadwal', icon: Clock, className: 'text-info' }
    case 'picked_up':
      return { label: 'Sudah dijemput', icon: Truck, className: 'text-info' }
    case 'in_transit':
    case 'delivering':
    case 'out_for_delivery':
      return { label: 'Dalam perjalanan', icon: Truck, className: 'text-info' }
    case 'completed':
    case 'delivered':
      return { label: 'Selesai', icon: CheckCircle2, className: 'text-success' }
    case 'cancelled':
    case 'canceled':
      return { label: 'Dibatalkan', icon: XCircle, className: 'text-error' }
    case 'failed':
    case 'payment_failed':
      return { label: 'Gagal', icon: XCircle, className: 'text-error' }
    default:
      return { label: normalized ? humanize(normalized) : 'Status belum tersedia', icon: CircleHelp, className: 'text-foreground-muted' }
  }
}
