export type MapsLocationMapping = {
  mapping_id: string;
  logistics_provider_code: string;
  provider_location_code: string;
  canonical_city: string;
  canonical_district?: string | null;
  aliases?: string[];
  enabled?: boolean;
};

export type NormalizedLocationInput = {
  label: string;
  address_line?: string | null;
  city?: string | null;
  district?: string | null;
  postal_code?: string | null;
  country_code?: string | null;
  provider_place_id?: string | null;
};

export type NormalizedLocationFields = {
  display_label: string;
  address_line: string | null;
  city: string | null;
  district: string | null;
  postal_code: string | null;
  country_code: string | null;
  provider_place_id: string | null;
  provider_location_codes: Record<string, string>;
  location_mapping_version: string;
  location_mapping_count: number;
};

export const LOCATION_NORMALIZATION_VERSION = '2026-09-01';

const clean = (value?: string | null): string | null => {
  const normalized = String(value || '').trim();
  return normalized ? normalized : null;
};

const comparable = (value?: string | null): string => (
  String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(kota|kabupaten|kab\.?|city|regency)\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
);

const mappingMatches = (mapping: MapsLocationMapping, input: NormalizedLocationInput): boolean => {
  if (mapping.enabled === false || !mapping.mapping_id || !mapping.logistics_provider_code || !mapping.provider_location_code) {
    return false;
  }

  const city = comparable(input.city);
  const district = comparable(input.district);
  const cityCandidates = [mapping.canonical_city, ...(mapping.aliases || [])].map(comparable).filter(Boolean);
  if (!city || !cityCandidates.includes(city)) return false;

  const configuredDistrict = comparable(mapping.canonical_district);
  return !configuredDistrict || configuredDistrict === district;
};

export const normalizeLocation = (
  input: NormalizedLocationInput,
  mappings: MapsLocationMapping[] = [],
  mappingVersion = 'unconfigured'
): NormalizedLocationFields => {
  const providerLocationCodes: Record<string, string> = {};
  let mappingCount = 0;

  for (const mapping of mappings) {
    if (!mappingMatches(mapping, input)) continue;
    const provider = mapping.logistics_provider_code.trim().toUpperCase();
    if (!providerLocationCodes[provider]) {
      providerLocationCodes[provider] = mapping.provider_location_code.trim();
      mappingCount += 1;
    }
  }

  return {
    display_label: clean(input.label) || [input.address_line, input.city].filter(Boolean).join(', '),
    address_line: clean(input.address_line),
    city: clean(input.city),
    district: clean(input.district),
    postal_code: clean(input.postal_code),
    country_code: clean(input.country_code)?.toUpperCase() || null,
    provider_place_id: clean(input.provider_place_id),
    provider_location_codes: providerLocationCodes,
    location_mapping_version: mappingVersion,
    location_mapping_count: mappingCount,
  };
};
