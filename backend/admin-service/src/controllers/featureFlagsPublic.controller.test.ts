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
      safe_banner: { enabled: true, variant: 'a' },
      menu_editor: { enabled: true },
    });
  });

  it('fails closed when a legacy client has no version/schema headers', () => {
    const compatibility = readClientCompatibility({ 'x-app-type': 'customer' });
    expect(shapeEnabledFlags([{ key: 'safe_banner', config: {} }], compatibility)).toEqual({});
  });
});
