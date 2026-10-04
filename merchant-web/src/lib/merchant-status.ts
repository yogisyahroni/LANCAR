import type { MerchantOnboardingStatus } from './types'

const CANONICAL_STATUSES = new Set<MerchantOnboardingStatus>([
  'DRAFT',
  'SUBMITTED',
  'VERIFYING',
  'ACTIVE',
  'REJECTED',
  'SUSPENDED',
])

/**
 * Convert the legacy verification projection only when a canonical lifecycle
 * value is absent. The canonical onboarding_status always wins.
 */
export function merchantOnboardingStatus(
  onboardingStatus?: string | null,
  verificationStatus?: string | null,
): MerchantOnboardingStatus | null {
  const canonical = String(onboardingStatus || '').trim().toUpperCase() as MerchantOnboardingStatus
  if (CANONICAL_STATUSES.has(canonical)) return canonical

  switch (String(verificationStatus || '').trim().toLowerCase()) {
    case 'approved':
      return 'ACTIVE'
    case 'rejected':
      return 'REJECTED'
    case 'pending':
      return 'SUBMITTED'
    default:
      return null
  }
}

export function merchantCanOperate(onboardingStatus?: string | null, verificationStatus?: string | null): boolean {
  return merchantOnboardingStatus(onboardingStatus, verificationStatus) === 'ACTIVE'
}

export function merchantStatusLabel(status: string | null): string {
  switch (status) {
    case 'DRAFT':
      return 'Pendaftaran belum dikirim'
    case 'SUBMITTED':
      return 'Pendaftaran sedang diproses'
    case 'VERIFYING':
      return 'Sedang diverifikasi'
    case 'ACTIVE':
      return 'Disetujui'
    case 'REJECTED':
      return 'Perlu diperbaiki'
    case 'SUSPENDED':
      return 'Akses ditangguhkan'
    default:
      return 'Status belum tersedia'
  }
}
