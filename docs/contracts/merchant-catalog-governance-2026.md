# Merchant Catalog Governance Contract — MERCH-2026-003

`merchant-service` tetap menjadi source of truth untuk katalog merchant food.
Search tidak menulis balik ke katalog; ia menerima event katalog melalui
`event_outbox`.

## Canonical model

- `merchant_menu_categories` menyimpan kategori merchant, slug, urutan, status,
  dan versi.
- `merchant_menu_items` menyimpan item, harga, kategori, lifecycle status,
  moderation status, inventory, dan versi item.
- `merchant_menu_item_images` menyimpan seluruh gambar canonical; kolom `foto`
  dipertahankan sebagai kompatibilitas legacy.
- `menu_item_variants` dan `menu_item_variant_options` menyimpan variant serta
  modifier melalui `kind` (`variant` atau `modifier`) dan status aktif/arsip.
- `merchant_menu_item_schedules` menyimpan jadwal per weekday dalam timezone
  merchant runtime (`Asia/Jakarta` pada consumer food saat ini).

Item baru selalu `moderation_pending`/`pending` dan tidak tersedia untuk
customer. Item hanya dapat menjadi `active` atau `scheduled` setelah admin
menyetujui moderasi. Status `sold_out` tetap tersedia sebagai state katalog,
tetapi tidak dapat dipesan.

## Endpoints

| Capability | Endpoint | Authority |
| --- | --- | --- |
| Category CRUD | `GET/POST /api/v1/merchant/menu-categories`, `PATCH /api/v1/merchant/menu-categories/{id}` | Merchant owner/session |
| Item lifecycle | Existing menu CRUD plus inventory/availability endpoints | Merchant owner/session |
| Moderation | `POST /api/v1/merchant/menu/{id}/moderation` | Admin role + `X-TOTP-Verified: true` |
| Bulk import | `POST /api/v1/merchant/menu/import` with CSV body or multipart `file` | Approved merchant |

The moderation endpoint accepts only `approved` or `rejected` and stores the
actor, timestamp, and optional rejection reason. It is fail-closed for unknown
roles and missing step-up authentication.

## Inventory and schedule behavior

The existing FOOD-2026-012 inventory guards remain authoritative. The catalog
status trigger keeps `status` and legacy `is_available` consistent, while
order-service evaluates stock/sales limits and the canonical item schedule
before quoting. Overnight schedules are evaluated across midnight.

## Search feed

Every create/update/delete affecting a category, item, image, schedule, variant,
or option increments `merchant_catalog_versions`, writes a durable
`merchant_catalog_events` row, and appends `merchant.catalog.changed` to
`event_outbox` with `consumer=search-index` and
`source_of_truth=merchant-service`. The event payload includes merchant,
entity, action, catalog version, and a JSON snapshot.

## Bulk import safety

CSV import requires an `Idempotency-Key`, validates every row before mutation,
returns row/field errors, limits an import and a merchant catalog to 1,000
items, and caps payload size at 5 MiB. Valid rows, newly discovered categories,
images, inventory values, and the import completion state commit in one
transaction. A retry with the same key and request hash returns the stored
result; reusing the key with a different payload is rejected.
