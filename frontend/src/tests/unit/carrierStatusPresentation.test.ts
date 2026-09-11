import { describe, expect, it } from 'vitest';
import { presentCarrierStatus } from '@/lib/carrierStatusPresentation';

describe('presentCarrierStatus', () => {
  it('renders an explicit safe state for an unknown carrier status', () => {
    expect(presentCarrierStatus('UNKNOWN')).toEqual(expect.objectContaining({
      label: 'Status sedang diperbarui',
      description: expect.stringContaining('belum dikenali'),
      isUnknown: true,
      icon: expect.anything(),
      className: 'border-warning bg-warning-surface text-warning',
    }));
  });

  it('keeps known canonical statuses readable without guessing', () => {
    expect(presentCarrierStatus('AT_SORTING_CENTER')).toEqual(expect.objectContaining({
      label: 'AT SORTING CENTER',
      description: 'Pembaruan status pengiriman dari kurir.',
      isUnknown: false,
      icon: expect.anything(),
      className: 'border-border bg-surface-subtle text-primary',
    }));
  });
});
