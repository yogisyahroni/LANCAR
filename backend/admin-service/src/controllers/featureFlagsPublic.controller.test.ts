jest.mock('../db', () => ({ readDb: { query: jest.fn() } }));
jest.mock('../redis', () => ({ redis: { get: jest.fn(), set: jest.fn() } }));

import { shapeEnabledFlags } from './featureFlagsPublic.controller';
import { readClientCompatibility } from '../services/clientCompatibility';

describe('public dynamic feature compatibility filtering', () => {
  it('returns only features supported by the requesting client contract', () => {
    const compatibility = readClientCompatibility({
      'x-app-type': 'merchant',
      'x-app-version-code': '2',
      'x-app-schema-version': '1',
      'x-app-capabilities': 'orders,menu',
    });

    expect(shapeEnabledFlags([
      { key: 'safe_banner', config: { variant: 'a' } },
      { key: 'new_checkout', config: { min_app_version_code: 3 } },
      { key: 'menu_editor', config: { required_capabilities: ['menu'] } },
      { key: 'payments_v2', config: { required_capabilities: ['payments'] } },
    ], compatibility)).toEqual({
      safe_banner: { enabled: true, variant: 'a', evaluation_revision: 1 },
      menu_editor: { enabled: true, evaluation_revision: 1 },
    });
  });

  it('fails closed when a legacy client has no version/schema headers', () => {
    const compatibility = readClientCompatibility({ 'x-app-type': 'customer' });
    expect(shapeEnabledFlags([{ key: 'safe_banner', config: {} }], compatibility)).toEqual({});
  });

  it('does not expose server-authoritative payment or pricing controls to clients', () => {
    const compatibility = readClientCompatibility({
      'x-app-type': 'customer',
      'x-app-version-code': '2',
      'x-app-schema-version': '1',
    });
    expect(shapeEnabledFlags([
      { key: 'require_payment_gateway', category: 'system', is_enabled: true, config: {} },
      { key: 'marketing_banner', category: 'feature', is_enabled: true, config: { mode: 'on' } },
    ], compatibility)).toEqual({
      marketing_banner: { enabled: true, evaluation_revision: 1 },
    });
  });

  it('evaluates market and percentage targeting before exposing a flag', () => {
    const compatibility = readClientCompatibility({
      'x-app-type': 'customer',
      'x-app-version-code': '2',
      'x-app-schema-version': '1',
    });
    const rows = [{
      key: 'targeted_banner',
      is_enabled: true,
      evaluation_revision: 9,
      config: { mode: 'on', market_codes: ['id-jk'] },
    }];
    expect(shapeEnabledFlags(rows, compatibility, { actorId: 'actor-1', marketCode: 'id-jk' })).toEqual({
      targeted_banner: { enabled: true, evaluation_revision: 9 },
    });
    expect(shapeEnabledFlags(rows, compatibility, { actorId: 'actor-1', marketCode: 'id-bali' })).toEqual({});
  });
});
