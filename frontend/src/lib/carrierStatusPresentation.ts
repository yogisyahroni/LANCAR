export type CarrierStatusPresentation = {
  label: string;
  description: string;
  isUnknown: boolean;
};

const UNKNOWN_STATUSES = new Set(['', 'UNKNOWN', 'UNMAPPED']);

export function presentCarrierStatus(canonicalStatus?: string | null): CarrierStatusPresentation {
  const normalized = String(canonicalStatus || '').trim().toUpperCase();
  if (UNKNOWN_STATUSES.has(normalized)) {
    return {
      label: 'Status sedang diperbarui',
      description: 'Kurir mengirim pembaruan yang belum dikenali. Kami menyimpannya dan akan memperbarui pelacakan setelah statusnya terverifikasi.',
      isUnknown: true,
    };
  }

  return {
    label: normalized.replace(/_/g, ' '),
    description: 'Pembaruan status pengiriman dari kurir.',
    isUnknown: false,
  };
}

