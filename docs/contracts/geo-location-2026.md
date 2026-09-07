# Canonical geo location contract — 2026

All transactional services use a provider-neutral location snapshot. Clients
may display provider results, but provider-native place IDs and carrier codes
remain metadata and are never business primary keys.

## Location snapshot

```json
{
  "display_address": "Jl. Sudirman No. 10, Jakarta Selatan",
  "normalized_address": {
    "address_line": "Jl. Sudirman No. 10",
    "city": "Jakarta Selatan",
    "district": "Setiabudi",
    "postal_code": "12910",
    "country_code": "ID"
  },
  "coordinate": { "latitude": -6.2, "longitude": 106.8 },
  "accuracy_meters": 15,
  "accuracy_source": "provider",
  "source": "server_geocode",
  "provider_place_id": "provider-native-id",
  "provider_location_codes": { "JNE": "JKS" },
  "timezone": "Asia/Jakarta",
  "market": "ID-JK",
  "address_version": "location-v3",
  "coordinate_version": "location-v3"
}
```

`display_address` is presentation text. Normalized components are independently
usable for matching, serviceability and compliance. `provider_place_id` and
`provider_location_codes` are optional metadata supplied by a server-side
adapter.

## Transactional invariants

- Coordinates must be finite and within latitude/longitude bounds; `0,0` is
  invalid for a transactional pickup or destination.
- `address_version` and `coordinate_version` are both required and must match.
  A quote or route snapshot must persist the resulting location `Revision` and
  revalidate it before reuse. Any address or coordinate change produces a new
  revision and invalidates the dependent snapshot.
- A legacy routing request may send only validated coordinates. New callers
  should send the canonical `pickup_location` and `dropoff_location` objects;
  when both forms are sent, coordinates must agree.
