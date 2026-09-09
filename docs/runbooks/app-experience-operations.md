# App Experience — GUI Operations Runbook

Runbook untuk Product, Marketing, dan Ops yang melakukan operasi presentation/exposure dari Admin Web. Semua perubahan harus dimulai dari App Experience GUI; jangan mengubah JSON, database, environment, atau endpoint secara manual.

## Guardrails sebelum mulai

1. Buka `Admin Web → App Experience → Overview` dan pastikan market, surface, locale, serta app version scope benar.
2. Pastikan akun memiliki `experience.read` dan capability mutasi yang sesuai. Perubahan broad/high-blast-radius wajib melalui maker-checker.
3. Gunakan `Preview` sebelum publish. Preview harus menunjukkan schema, targeting, schedule, rollout, diff, serta blast radius yang valid.
4. Promo banner hanya mengatur presentasi. Harga, diskon, eligibility finansial, order state, ledger, payment, dan refund tetap authoritative di domain masing-masing.
5. Setiap perubahan menyimpan actor, timestamp, reason, revision, approval state, dan audit event.

## Click path operasi rutin

| Operasi | Click path | Verifikasi GUI |
| --- | --- | --- |
| Replace hero/header banner | `App Experience → Banners & Promo Content → New campaign` → pilih `hero_banner` → Placement `Hero`/`Header` → edit title/body/CTA → `Save draft` | Preview menampilkan banner di placement yang dipilih; diff menunjukkan field berubah. |
| Change localized copy and CTA | `Banners & Promo Content` → component → `Localized copy references` → isi key locale → `Save draft` | Locale preview menampilkan copy ter-resolve; unresolved key tidak ditampilkan mentah. |
| Reorder Home sections | `App Experience → Home Layout` → gunakan `Move section up/down` → `Save draft` | Urutan sections pada editor dan preview berubah; publish tidak membutuhkan binary release untuk komponen yang sudah compiled. |
| Add/remove promo/info component | `Home Layout` atau `Banners & Promo Content` → `Add component` → pilih `promo_carousel`/`info_card`; hapus memakai ikon `Remove component` | Preview hanya menampilkan component schema yang terdaftar; publish gate menolak schema/asset invalid. |
| Launch/schedule/pause campaign intro | `App Experience → Campaign Intro` → pilih `campaign_intro` → atur start/end/timezone → `Save draft`; setelah publish gunakan `Pause`/`Resume` | Preview matching/non-matching dan status schedule menunjukkan sebelum start, active, expired, atau paused. `campaign_intro` adalah post-native-splash, bukan OS launch splash. |
| Target by market/city/locale/version/cohort | `App Experience → Audience & Targeting` → isi targeting fields → `Simulate matching` dan `Simulate non-matching` | Kedua case menunjukkan hasil resolver dan revision yang dipilih. |
| Change service badge/subtitle/order | `App Experience → Service Visibility` → pilih `service_grid` → edit service entries, badge/subtitle, order, enabled | Preview dan diff menunjukkan perubahan presentation; pricing/order authority tidak berubah. |
| Marketing-hide service | `Service Visibility` → matikan `Enabled` untuk entry yang dipilih → `Save draft` | UI menandai item hidden/disabled; gunakan `new_order_gate` hanya untuk operational admission control, bukan marketing hide. |
| Execute `new_order_gate` / provider kill switch | `App Experience → Kill Switches` → pilih scope → pilih gate/provider → isi reason dan blast-radius acknowledgement → `Execute` | UI menampilkan affected scope, preserves active orders/tracking/support, dan audit event. |
| Staged rollout 1/5/25/100% | Editor → `Rollout stage` `Canary / internal` → isi cohort → set `Percentage rollout` → preview → approval → publish | Release summary menampilkan stage, cohort, percentage, audience, dan blast radius. |
| Soft/minimum-version policy | `App Experience → App Version Policy` → `New policy`/`Edit` → update mode `Soft` atau minimum version → `Save policy` | Policy matrix menunjukkan revision/effective window. Native capability baru wajib diberi label `Requires App Release`. |
| Upload/select/version asset | `App Experience → Asset Library` → upload/validate asset → pilih asset reference dari editor | Asset menampilkan checksum/version/lifecycle/usages; upload/validation tidak langsung publish dan live reference tidak boleh dihapus. |
| Select/test typed deep link | `App Experience → Deep Links` → pilih route registry → isi typed params → `Test route`; untuk external URL gunakan validator | Hanya allowlisted typed route/first-party HTTPS yang lulus; arbitrary code/unsafe URL ditolak. |
| Preview exact candidate | Scope bar → set market/surface/locale/app version → `Preview resolver` → isi city/cohort/schema/device/theme | `Live vs candidate resolver result` menampilkan validation, schedule, targeting, rollout, diff, and no impression recorded. |
| Submit/approve/reject | Preview valid → `Submit approval`; checker buka `Approval Queue` → `Approve` atau `Reject` dengan reason | Approval state, actor, reason, and revision change in GUI/audit. |
| Publish/schedule production revision | Setelah approval dan preview valid → `Publish`; schedule memakai start/end/timezone pada editor | Publish button hanya aktif setelah valid preview; live revision and audit appear in history. |
| Inspect diff/audit | `App Experience → Revisions & Rollback` atau `Overview → Audit history` → pilih manifest/revision/filter actor/action/date | Field-level diff, immutable revision, actor, timestamp, reason, and release health are visible. |
| Roll back known-good | `Revisions & Rollback` → pilih compatible known-good revision → `Roll back` → isi reason/confirm | Active pointer returns to selected revision; client refresh/re-fetch recovers; historical payload is not edited. |
| Release health/analytics by revision | `App Experience → Overview` / `Analytics` → filter market/surface/manifest/revision | Exposure, actions, dismissals, reliability failures, rollout and rollback recommendation are visible. |

## `Requires App Release` boundary

Remote configuration may change only registered presentation/exposure schema and release metadata. A new native component, native capability, incompatible schema, or binary safety update is not represented as a silently publishable remote-config action. The Admin release-policy boundary visibly labels this as `Requires App Release`; operators must then use the mobile release process and store review path.

## Safe rollback procedure

1. Stop or pause the affected campaign/rollout from `Overview` or the selected manifest.
2. Open `Revisions & Rollback` and choose only a compatible known-good revision.
3. Record the incident/reason in the rollback confirmation and execute the GUI action.
4. Verify the active revision, client re-fetch, customer presentation, and active-order/tracking/support recovery.
5. Inspect the audit event and release-health panel before resuming any staged rollout.

## Staging drill record

This runbook is the click-path source for the required staging drill. The drill is not marked complete until a non-engineer performs:

1. banner change in Admin GUI;
2. targeted preview and publish;
3. app verification against the deployed staging revision;
4. GUI rollback to the known-good revision;
5. evidence capture with actor, revision, timestamps, audit rows, runtime screenshots/log references, and no secrets.

The current repository session has local Playwright GUI evidence, but no authorized staging operator/session has been recorded. That external drill remains under `GLOB-2026-014`.
