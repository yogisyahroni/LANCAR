# Onboard Logistics Provider

Dokumen ini adalah runbook operasional untuk menambahkan provider logistik ke
`integration-gateway`. Provider baru wajib masuk melalui adapter dan registry;
`customer UI`, payment core, dan order core tidak boleh mengandung switch khusus
provider.

## 1. Konfigurasi server-only

- Simpan credential di secret manager/environment service integration-gateway.
- Jangan commit API key, private key, webhook secret, atau contoh credential.
- Catat `BASE_URL` sandbox dan production secara terpisah.
- Atur timeout, retry, dan circuit breaker per provider. Retry hanya untuk
  request idempotent atau request dengan idempotency key provider.
- Pastikan log hanya memuat provider code, operation, request id, latency, dan
  error class; redact credential, signature, payload PII, dan nomor telepon.

## 2. Capability dan adapter

1. Tambahkan adapter untuk capability yang benar-benar didukung: tariff,
   shipment/AWB, tracking pull, webhook, pickup, cancellation, label, POD,
   insurance, COD, return, atau claim.
2. Pertahankan native service code/name dan native status fields; jangan
   menggantinya dengan nilai generik.
3. Daftarkan provider dengan canonical `code`, `name`, dan capability list.
4. Jalankan `registry.Validate()` saat startup. Service harus gagal readiness
   bila capability yang dideklarasikan belum memiliki adapter.
5. Pastikan `GET /ready` menampilkan provider, capability, dan missing
   capability. Endpoint ini membuktikan wiring lokal, bukan konektivitas sandbox.

## 3. Location dan service mapping

- Import area code provider ke `provider_area_mappings` melalui migration/seed
  yang dapat diulang; simpan provider code, canonical label, region, dan active
  flag.
- Map service berdasarkan lane dan native service code. Tarif dari provider
  tetap menjadi sumber harga dan ETA; customer tidak boleh melihat service
  statis yang tidak dikembalikan provider.
- Verifikasi origin/destination code, weight unit, rounding, volumetric rule,
  surcharge, insurance, COD, dan return rule dengan kontrak tertulis provider.

## 4. Shipment/AWB dan idempotency

- Kirim reference order yang stabil dan idempotency key.
- Simpan request/response hash yang sudah disensor, native AWB, booking code,
  service code/name, dan provider reference.
- Uji retry, timeout, HTTP 4xx/5xx, duplicate request, dan respons tanpa AWB.
- Duplicate event/request harus menjadi no-op yang dapat diaudit.

## 5. Webhook dan tracking pull

- Konfirmasi dari provider apakah webhook tersedia, event types, delivery
  retry policy, source IP (bila ada), dan signature algorithm.
- Route provider ke adapter: `POST /api/v1/logistics/webhook/{provider}`.
- Signature verification, native parsing, status mapping, dan raw-field capture
  wajib berada di adapter boundary.
- Simpan `provider_status`, code, description, location, timestamp, payload
  hash, dan canonical LANCAR status. Status yang tidak dikenal harus `UNKNOWN`.
- Jika provider hanya mendukung pull, daftarkan capability tracking dan
  gunakan worker polling dengan target AWB durable, backoff, rate limit, dan
  dead-letter/retry observability.
- Jika provider mendukung keduanya, webhook menjadi sumber utama dan polling
  hanya untuk reconciliation yang disepakati.

## 6. External contract verification

Sebelum mengaktifkan production:

- Jalankan fixture contract suite untuk rate, create/AWB, tracking, error,
  timeout, duplicate event, dan unknown status.
- Jalankan sandbox test untuk credential, base URL, location mapping, service
  mapping, webhook signature, POD, COD, insurance, return, dan claim.
- Simpan link/version dokumen SLA dan escalation contact provider.
- Catat rate limit, timeout SLA, expected retry behavior, maintenance window,
  dan alert threshold.
- Lakukan staging E2E: create order → payment → AWB → event/poll → customer
  detail → settlement/reconciliation.

## 7. Release gate dan rollback

- `go test ./...` di integration-gateway.
- `go test ./...` di order-service bila kontrak event atau lifecycle berubah.
- `registry.Validate()` PASS dan `/ready` menunjukkan provider ready.
- Migration sudah dijalankan dan diverifikasi di staging.
- Dashboard/alert delivery, latency, error rate, duplicate, unknown status,
  dan reconciliation lag sudah diuji.
- Rollback deployment tidak menghapus raw event inbox. Jika mapping salah,
  rollback adapter/mapping, replay event idempotently setelah perbaikan, dan
  audit perubahan status.
