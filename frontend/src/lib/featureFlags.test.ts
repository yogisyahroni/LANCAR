import { describe, expect, it } from 'vitest';
import { normalizeFlagsPayload } from './featureFlags';

describe('customer web feature flag payloads', () => {
  it('unwraps the public API envelope and keeps the server evaluation revision', () => {
    expect(normalizeFlagsPayload({
      success: true,
      data: {
        flags: {
          customer_food_entry: { enabled: true, evaluation_revision: 12 },
        },
      },
    })).toEqual({
      customer_food_entry: { enabled: true, variant: null, evaluation_revision: 12 },
    });
  });

  it('normalizes disabled and legacy primitive entries without enabling unknown values', () => {
    expect(normalizeFlagsPayload({
      flags: {
        disabled_banner: { enabled: false, evaluation_revision: 4 },
        legacy_banner: true,
        malformed: { enabled: 'not-a-boolean' },
      },
    })).toEqual({
      disabled_banner: { enabled: false, variant: null, evaluation_revision: 4 },
      legacy_banner: { enabled: true, variant: true, evaluation_revision: 1 },
      malformed: { enabled: false, variant: null, evaluation_revision: 1 },
    });
  });
});
