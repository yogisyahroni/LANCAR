export const activePayoutStatuses = [
  'requested',
  'risk_screening',
  'approved_auto',
  'risk_hold',
  'manual_review',
  'under_review',
  'approved',
  'processing',
];

export const terminalPayoutStatuses = ['paid', 'failed', 'rejected', 'blocked', 'cancelled'];

export const payoutStatusLabel = (status: string) => {
  switch (status) {
    case 'requested':
    case 'risk_screening':
      return 'Dalam pemeriksaan otomatis';
    case 'approved_auto':
    case 'approved':
    case 'processing':
      return 'Diproses';
    case 'risk_hold':
    case 'manual_review':
    case 'under_review':
      return 'Butuh review';
    case 'paid':
      return 'Berhasil';
    case 'blocked':
    case 'rejected':
      return 'Ditolak';
    case 'failed':
      return 'Gagal';
    case 'cancelled':
      return 'Dibatalkan';
    default:
      return status.replace(/_/g, ' ');
  }
};

export const payoutRiskAction = (status: string, decision?: string | null) => {
  if (status === 'approved_auto' || decision === 'auto_approved') return 'auto_approved';
  if (status === 'blocked' || decision === 'blocked') return 'blocked_by_risk';
  if (['risk_hold', 'manual_review', 'under_review'].includes(status) || decision === 'manual_review') return 'needs_review';
  if (['processing', 'approved'].includes(status)) return 'processing';
  if (terminalPayoutStatuses.includes(status)) return 'terminal';
  return 'screening';
};

export const payoutMobileMessage = (status: string) => {
  switch (status) {
    case 'requested':
    case 'risk_screening':
      return 'Pengajuan sedang dicek otomatis. Kamu bisa memantau statusnya di sini.';
    case 'approved_auto':
    case 'approved':
    case 'processing':
      return 'Pengajuan sedang diproses ke rekening pencairan.';
    case 'risk_hold':
    case 'manual_review':
    case 'under_review':
      return 'Sedang diverifikasi oleh tim operasional.';
    case 'paid':
      return 'Pencairan berhasil diproses.';
    case 'rejected':
    case 'blocked':
      return 'Pengajuan belum dapat diproses. Cek detail atau hubungi operasional jika perlu.';
    case 'failed':
      return 'Pencairan belum berhasil. Saldo tetap tercatat dan akan ditinjau.';
    case 'cancelled':
      return 'Pengajuan dibatalkan.';
    default:
      return 'Pengajuan pencairan saldo berhasil dibuat.';
  }
};

export const decoratePayoutRequest = <T extends { status: string; risk_decision?: string | null }>(row: T) => ({
  ...row,
  status_label: payoutStatusLabel(row.status),
  status_message: payoutMobileMessage(row.status),
  risk_action: payoutRiskAction(row.status, row.risk_decision),
  auto_approved: row.status === 'approved_auto' || row.risk_decision === 'auto_approved',
  requires_manual_review: ['risk_hold', 'manual_review', 'under_review'].includes(row.status) || row.risk_decision === 'manual_review',
});
