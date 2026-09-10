import { CheckCircle2, CircleHelp, Clock, Truck, XCircle, type LucideIcon } from 'lucide-react';

export type CarrierStatusPresentation = {
  label: string;
  description: string;
  isUnknown: boolean;
  icon: LucideIcon;
  className: string;
};

const UNKNOWN_STATUSES = new Set(['', 'UNKNOWN', 'UNMAPPED']);

export function presentCarrierStatus(canonicalStatus?: string | null): CarrierStatusPresentation {
  const normalized = String(canonicalStatus || '').trim().toUpperCase();
  if (UNKNOWN_STATUSES.has(normalized)) {
    return {
      label: 'Status sedang diperbarui',
      description: 'Kurir mengirim pembaruan yang belum dikenali. Kami menyimpannya dan akan memperbarui pelacakan setelah statusnya terverifikasi.',
      isUnknown: true,
      icon: CircleHelp,
      className: 'border-warning bg-warning-surface text-warning',
    };
  }

  const icon = ['completed', 'delivered', 'pod_completed'].includes(normalized)
    ? CheckCircle2
    : ['cancelled', 'canceled', 'failed', 'payment_failed', 'expired'].includes(normalized)
      ? XCircle
      : ['created', 'pending', 'pending_payment'].includes(normalized)
        ? Clock
        : Truck;

  return {
    label: normalized.replace(/_/g, ' '),
    description: 'Pembaruan status pengiriman dari kurir.',
    isUnknown: false,
    icon,
    className: 'border-border bg-surface-subtle text-primary',
  };
}
