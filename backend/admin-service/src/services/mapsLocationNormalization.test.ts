import { normalizeLocation } from './mapsLocationNormalization';

describe('mapsLocationNormalization', () => {
  it('keeps display text separate from canonical address components', () => {
    const result = normalizeLocation({
      label: 'Jl. Sudirman No. 10, Jakarta Selatan, Indonesia',
      address_line: 'Jl. Sudirman No. 10',
      city: 'Jakarta Selatan',
      district: 'Setiabudi',
      postal_code: '12910',
      country_code: 'id',
      provider_place_id: 'tomtom:place-1',
    });

    expect(result).toEqual(expect.objectContaining({
      display_label: 'Jl. Sudirman No. 10, Jakarta Selatan, Indonesia',
      address_line: 'Jl. Sudirman No. 10',
      city: 'Jakarta Selatan',
      district: 'Setiabudi',
      postal_code: '12910',
      country_code: 'ID',
      provider_place_id: 'tomtom:place-1',
      location_mapping_version: 'unconfigured',
      location_mapping_count: 0,
    }));
  });

  it('only returns provider codes from server-controlled mappings', () => {
    const result = normalizeLocation(
      {
        label: 'Bandung, Indonesia',
        city: 'Bandung',
        district: 'Coblong',
      },
      [
        {
          mapping_id: 'jne-bandung',
          logistics_provider_code: 'jne',
          provider_location_code: 'BDO',
          canonical_city: 'Kota Bandung',
          canonical_district: 'Coblong',
          aliases: ['Bandung'],
        },
        {
          mapping_id: 'jnt-disabled',
          logistics_provider_code: 'jnt',
          provider_location_code: 'BDG',
          canonical_city: 'Bandung',
          enabled: false,
        },
      ],
      'locations-v3'
    );

    expect(result.provider_location_codes).toEqual({ JNE: 'BDO' });
    expect(result.location_mapping_version).toBe('locations-v3');
    expect(result.location_mapping_count).toBe(1);
  });

  it('does not map a city when a configured district does not match', () => {
    const result = normalizeLocation(
      { label: 'Bandung, Indonesia', city: 'Bandung', district: 'Sukajadi' },
      [{
        mapping_id: 'jne-bandung-coblong',
        logistics_provider_code: 'JNE',
        provider_location_code: 'BDO',
        canonical_city: 'Bandung',
        canonical_district: 'Coblong',
      }],
      'locations-v1'
    );

    expect(result.provider_location_codes).toEqual({});
    expect(result.location_mapping_count).toBe(0);
  });
});
