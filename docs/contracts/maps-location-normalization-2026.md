# Maps location normalization contract — 2026

The browser and mobile clients call the authenticated LANCAR maps API. They do
not call TomTom, Nominatim, or another geocoding provider directly.

## Response shape

`GET /api/v1/maps/geocode?query=...` returns `{ results: [...] }` and
`GET /api/v1/maps/reverse-geocode?latitude=...&longitude=...` returns
`{ result: ... }`. Each result keeps the legacy `label` field for clients that
have not migrated, while the normalized contract is:

```json
{
  "display_label": "Jl. Sudirman No. 10, Jakarta Selatan, Indonesia",
  "address_line": "Jl. Sudirman No. 10",
  "city": "Jakarta Selatan",
  "district": "Setiabudi",
  "postal_code": "12910",
  "country_code": "ID",
  "provider_place_id": "provider-native-id",
  "provider_location_codes": { "JNE": "JKS" },
  "location_mapping_version": "locations-v3",
  "location_mapping_count": 1,
  "latitude": -6.2,
  "longitude": 106.8,
  "provider": "tomtom_search",
  "confidence": 0.95
}
```

`display_label` is presentation text. `city`, `district`, and `postal_code`
are independently usable normalized components. `provider_place_id` remains
provider metadata and is not a business primary key.

## Provider-location mapping

Mappings are supplied only through the server-side `maps_provider_config`
system configuration under `location_mappings`. A mapping has an explicit
`mapping_id`, logistics provider code, canonical city/district, and native
provider location code. No client-generated or guessed location code is
accepted as authoritative.

The mapping version is part of the geocode cache key. Updating mappings
therefore cannot serve an old code from cache. Every geocode/reverse-geocode
observation records the mapping version and match count for operational audit.
When no mapping is configured, `provider_location_codes` is empty and the
client must keep the location unresolved for any carrier that requires a
native code.
