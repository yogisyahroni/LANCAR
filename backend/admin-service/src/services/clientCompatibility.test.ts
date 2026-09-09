import {
  compatibilityResponse,
  getClientCompatibilityPolicy,
  isDynamicFeatureSupported,
  readClientCompatibility,
} from './clientCompatibility';

describe('client compatibility contract', () => {
  it('accepts all current app types and reports a compatible client', () => {
    for (const appType of ['customer', 'courier', 'merchant', 'web']) {
      const compatibility = readClientCompatibility({
        'x-app-type': appType,
        'x-app-version': '1.0.1',
        'x-app-version-code': '2',
        'x-app-schema-version': '1',
        'x-app-capabilities': 'orders,food',
      });

      expect(compatibility.status).toBe('compatible');
      expect(compatibility.dynamicFeaturesEnabled).toBe(true);
    }
  });

  it('fails closed for a missing or unsupported client contract', () => {
    expect(readClientCompatibility({ 'x-app-type': 'customer' })).toEqual(expect.objectContaining({
      status: 'unknown',
      dynamicFeaturesEnabled: false,
    }));

    expect(readClientCompatibility({
      'x-app-type': 'customer',
      'x-app-version-code': '1',
      'x-app-schema-version': '99',
    })).toEqual(expect.objectContaining({
      status: 'upgrade_required',
      upgradeRequired: true,
      dynamicFeaturesEnabled: false,
      reason: 'unsupported_api_schema',
    }));
  });

  it('filters a dynamic feature by version, schema and declared capability', () => {
    const compatibility = readClientCompatibility({
      'x-app-type': 'customer',
      'x-app-version-code': '2',
      'x-app-schema-version': '1',
      'x-app-capabilities': 'orders,food',
    });

    expect(isDynamicFeatureSupported({ min_app_version_code: 2, required_schema_version: 1, required_capabilities: ['food'] }, compatibility)).toBe(true);
    expect(isDynamicFeatureSupported({ min_app_version_code: 3 }, compatibility)).toBe(false);
    expect(isDynamicFeatureSupported({ required_schema_version: 2 }, compatibility)).toBe(false);
    expect(isDynamicFeatureSupported({ required_capabilities: ['payments'] }, compatibility)).toBe(false);
  });

  it('exposes a stable policy payload for the latest-version response', () => {
    const policy = getClientCompatibilityPolicy('merchant');
    const compatibility = readClientCompatibility({
      'x-app-type': 'merchant',
      'x-app-version-code': '1',
      'x-app-schema-version': '1',
    }, 'merchant');

    expect(compatibilityResponse(compatibility, policy)).toEqual(expect.objectContaining({
      minimum_supported_version_code: 1,
      current_api_schema_version: 1,
      supported_api_schema_versions: [1],
    }));
  });
});
