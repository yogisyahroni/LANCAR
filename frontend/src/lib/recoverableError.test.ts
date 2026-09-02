import { describe, expect, it } from 'vitest';
import { presentRecoverableError } from './recoverableError';

describe('presentRecoverableError', () => {
  it('returns the server next action and retry policy', () => {
    expect(presentRecoverableError({ recoverable: {
      code: 'REQUOTE_REQUIRED', message: 'Tarif berubah', action: 'Tinjau tarif', retryable: false,
    } }, 'Gagal')).toEqual({
      message: 'Tarif berubah', action: 'Tinjau tarif', retryable: false, reference: undefined,
    });
  });

  it('uses a safe fallback when no typed response exists', () => {
    expect(presentRecoverableError({}, 'Coba lagi')).toEqual({ message: 'Coba lagi', retryable: false });
  });
});
