# Task: Customer Notification Center & Promo Engine

Tanggal: 2026-06-06
Area: Android Customer App, Backend Admin Service, Admin Dashboard, Customer Web Booking, Notification Infrastructure
Status: P0-P6 core implemented; build/test gate ulang hijau pada 2026-06-07, tersisa QA manual device/browser untuk skenario foreground/offline dan lifecycle klik end-to-end.

## Ringkasan

Halaman utama customer saat ini memakai tombol logout di area kanan atas. Secara UX dan bisnis, posisi ini lebih bernilai untuk notifikasi karena customer dan penerima perlu tahu pesan baru, perubahan status order, informasi layanan, bantuan, dan promo. Logout harus dipindahkan ke halaman Profil karena itu aksi jarang dipakai dan berisiko jika tidak sengaja ditekan.

Target task ini adalah membuat Notification Center customer yang enterprise-ready dan Promo Engine yang aman terhadap margin. Promo tidak boleh sekadar diskon bebas. Setiap promo wajib melewati guard profitabilitas, budget, eligibility, fraud control, approval, audit, dan observability.

## Prinsip Produk

- Header Beranda customer memakai tombol Notifikasi, bukan Logout.
- Logout hanya tersedia di Profil atau Pengaturan Akun.
- Notifikasi harus menjawab kebutuhan awareness customer: pesan, order activity, promo, support, dan informasi layanan.
- Pesan/chat order harus punya prioritas lebih tinggi daripada marketing.
- Promo harus meningkatkan order, retention, atau activation tanpa membakar margin tanpa kontrol.
- Promo tidak boleh bisa membuat contribution margin order negatif kecuali campaign eksplisit disetujui owner/finance sebagai burn campaign terbatas.
- Semua notifikasi harus punya deep link yang jelas.
- Customer harus bisa membedakan pesan penting dengan promo.
- Sistem harus menghormati consent marketing, quiet hours, frequency cap, dan unsubscribe marketing.
- Semua campaign promo harus bisa diaudit dari draft sampai publish, pause, expire, dan redeem.

## UX Decision

### Header Beranda

- Ganti icon logout menjadi icon bell/notifikasi.
- Bell menampilkan badge unread.
- Tap bell membuka Notification Center.
- Logout dipindahkan ke:
  - `Profil > Pengaturan Akun > Keluar`
  - dialog konfirmasi sebelum logout.

### Notification Center

Struktur target:

- `Pesan`
  - Chat order customer-kurir.
  - Chat group customer-kurir-penerima.
  - Support reply.
  - Missed in-app call.

- `Aktivitas`
  - Order dibuat.
  - Kurir ditemukan.
  - Kurir menuju pickup.
  - Paket diambil.
  - Dalam perjalanan.
  - Sampai tujuan.
  - POD tersedia.
  - Pembayaran, refund, reschedule, cancellation.

- `Promo`
  - Voucher.
  - Diskon layanan.
  - Referral.
  - Campaign musiman.
  - Info fitur baru dan announcement marketing.

Support/Bantuan tidak menjadi tab utama. Bantuan tetap menjadi shortcut di Notification Center dan halaman Profil agar tidak mencampur konteks pesan masuk dengan kebutuhan self-service.

## Current State

### Android Customer App

- Chat order sudah ada melalui `ChatScreen`.
- FCM service dan `NotificationHelper` sudah ada, tetapi masih generic.
- Belum ada Notification Center.
- Belum ada unread badge global.
- Belum ada deep link notifikasi langsung ke chat/order/promo.
- Belum ada in-app foreground banner untuk pesan masuk.
- Belum ada tab Promo.
- Logout masih berada di area utama Beranda.

### Backend

- `createNotification` sudah menyimpan notifikasi, emit websocket, dan mencoba FCM.
- Payload masih generic dan belum punya taxonomy kuat untuk `message`, `activity`, `promo`, dan `support`.
- Belum ada API customer mobile yang lengkap untuk notification inbox, read/unread, archive, preference, dan category count.
- Belum ada Promo Engine dengan rule, margin guard, budget guard, approval, dan redemption ledger.

### Admin Dashboard

- Halaman Notifications masih berfokus ke template komunikasi.
- Belum ada Promo Manager.
- Belum ada promo simulation/forecast sebelum publish.
- Belum ada approval workflow atau finance guard.
- Belum ada visibility burn rate, redemption, dan margin impact.

## Target Notification Taxonomy

Notification category:

- `message`
- `activity`
- `promo`
- `support`
- `system`

Notification type examples:

- `order_chat_message`
- `order_group_chat_message`
- `missed_in_app_call`
- `order_assigned`
- `courier_arriving_pickup`
- `pickup_completed`
- `order_in_transit`
- `delivery_completed`
- `pod_available`
- `payment_required`
- `payment_success`
- `promo_voucher_available`
- `promo_expiring_soon`
- `support_reply`
- `system_announcement`

Required payload:

- `id`
- `category`
- `type`
- `title`
- `body`
- `order_id`
- `conversation_id`
- `promo_id`
- `deep_link`
- `created_at`
- `read_at`
- `expires_at`
- `priority`
- `metadata`

Deep link examples:

- `tembus://orders/{orderId}/chat`
- `tembus://orders/{orderId}/tracking`
- `tembus://orders/{orderId}/pod`
- `tembus://promos/{promoId}`
- `tembus://support/tickets/{ticketId}`
- `tembus://notifications`

## Promo Business Rules

### Promo Mechanics

Supported promo types:

- Fixed discount: `Rp 10.000`.
- Percentage discount with cap: `10% maks Rp 15.000`.
- Shipping discount by service.
- New customer first order promo.
- Returning customer reactivation promo.
- Zone-based promo.
- Service-specific promo, for example motor only or regular only.
- Time-window promo.
- Referral reward.
- Free insurance promo if margin allows.

Do not implement unlimited "free shipping" without cap, budget, and margin guard.

### Eligibility Rules

Promo can be scoped by:

- Customer segment.
- Customer tier.
- New vs returning customer.
- Number of completed orders.
- Service code.
- Vehicle type.
- Zone pickup/dropoff.
- Distance range.
- Package count.
- Package size/weight category.
- Payment method.
- Minimum order value.
- Maximum order value.
- First order only.
- Per-user usage limit.
- Per-device usage limit.
- Per-phone usage limit.
- Per-campaign usage limit.
- Time window.

### Margin Guard

Promo must calculate projected contribution margin before publish and before redeem.

Formula baseline:

```text
gross_order_revenue
- courier_payout
- payment_fee
- insurance_cost
- platform_variable_cost
- promo_discount
- tax_or_required_reserve
= contribution_margin
```

Default guard:

- `contribution_margin >= min_margin_amount`
- `contribution_margin_percent >= min_margin_percent`
- discount cannot exceed configured max discount per service.
- promo cannot apply if route/service pricing is incomplete.
- promo cannot apply if fare is `Rp 0` unless internal test mode.

Risk campaign exception:

- Only finance/admin owner can approve a campaign that may reduce margin below default threshold.
- Exception must have:
  - max total budget.
  - daily budget.
  - max redemption.
  - start/end time.
  - business reason.
  - approver.
  - audit log.

### Budget Guard

Campaign must support:

- Total budget.
- Daily budget.
- Per-segment budget.
- Max redemption count.
- Max discount per redemption.
- Auto-pause when budget reaches threshold, for example 90%.
- Hard stop at 100% budget.
- Budget reservation during checkout.
- Budget release if payment/order fails.
- Idempotent redemption.

### Fraud & Abuse Guard

- One redemption per order.
- Idempotency key for redemption.
- Prevent repeated use by same phone/device/payment identity beyond limits.
- Detect abnormal redemption velocity.
- Block promo stacking unless explicitly allowed.
- Block promo on suspicious account/device.
- Audit manual override.
- Rate limit promo validation endpoint.
- No client-side trust for discount calculation.

## P0 - Notification Foundation

- [x] Create or extend DB migration for notification inbox:
  - `notifications.category`
  - `notifications.priority`
  - `notifications.read_at`
  - `notifications.archived_at`
  - `notifications.expires_at`
  - `notifications.deep_link`
  - `notifications.metadata`
  - indexes by `user_id`, `category`, `read_at`, `created_at`, `expires_at`.
- [x] Add mobile customer notification API:
  - `GET /api/v1/mobile/notifications`
  - `GET /api/v1/mobile/notifications/unread-count`
  - `PATCH /api/v1/mobile/notifications/:id/read`
  - `PATCH /api/v1/mobile/notifications/read-all`
  - `PATCH /api/v1/mobile/notifications/:id/archive`
- [x] Add notification preference API:
  - transactional always enabled.
  - marketing can be disabled.
  - support/message always enabled unless blocked by system policy.
- [x] Normalize `createNotification` payload to include category and deep link.
- [x] Ensure chat notification uses:
  - category `message`
  - type `order_chat_message` or `order_group_chat_message`
  - deep link `tembus://orders/{orderId}/chat`
- [x] Add websocket event `new_notification` handling contract for mobile.
- [x] Add FCM data payload fields for deep-link navigation.
- [x] Ensure no PII raw phone/address is logged inside notification payload logs.

## P1 - Android Customer Notification UX

- [x] Replace Beranda logout icon with notification bell.
- [x] Add unread badge to notification bell.
- [x] Move logout to Profile screen with confirmation dialog.
- [x] Add Notification Center screen with tabs:
  - `Pesan`
  - `Aktivitas`
  - `Promo`
- [x] Add empty, loading skeleton, error, offline, and retry states.
- [x] Add foreground in-app banner for `message` and high-priority `activity`.
- [x] Add deep link handler in `MainActivity`/navigation:
  - open chat by order id.
  - open tracking by order id.
  - open promo detail by promo id.
  - open support ticket if supported.
- [x] Add unread dot on:
  - active order card.
  - Paket Masuk card.
  - Tracking chat CTA.
  - bottom nav or header if needed.
- [x] Mark notification/read receipt when chat is opened.
- [x] Add Android notification channels:
  - `Pesan Order`
  - `Aktivitas Pengiriman`
  - `Promo TEMBUS`
  - `Bantuan & Support`
- [x] Request Android 13+ notification permission with clean UX copy.
- [x] Ensure marketing notifications respect user preference.

## P2 - Promo Engine Backend

- [x] Create DB migration:
  - `promo_campaigns`
  - `promo_campaign_rules`
  - `promo_budget_ledger`
  - `promo_redemptions`
  - `promo_approvals`
  - `promo_audit_events`
  - `promo_segments`
- [x] Add promo lifecycle:
  - draft.
  - pending_approval.
  - scheduled.
  - active.
  - paused.
  - expired.
  - archived.
- [x] Add promo validation service:
  - input: customer, order draft, route, service, vehicle, payment method.
  - output: eligible promos, discount amount, reason if rejected.
- [x] Add margin simulation service.
- [x] Add budget reservation and release.
- [x] Add redemption idempotency.
- [x] Add promo stacking policy.
- [x] Add fraud and velocity checks.
- [x] Add audit logs for create/update/approve/publish/pause/redeem.
- [x] Add admin APIs:
  - `GET /admin/promos`
  - `POST /admin/promos`
  - `GET /admin/promos/:id`
  - `PATCH /admin/promos/:id`
  - `POST /admin/promos/:id/simulate`
  - `POST /admin/promos/:id/submit-approval`
  - `POST /admin/promos/:id/approve`
  - `POST /admin/promos/:id/publish`
  - `POST /admin/promos/:id/pause`
  - `GET /admin/promos/:id/analytics`
- [x] Add customer APIs:
  - `GET /api/v1/customer/promos/eligible`
  - `POST /api/v1/customer/promos/validate`
  - `POST /api/v1/customer/promos/reserve`
  - `POST /api/v1/customer/promos/release`
  - `POST /api/v1/customer/promos/redeem`

## P3 - Admin Promo Manager

- [x] Add sidebar page `Promo`.
- [x] Add campaign list with status, budget, redemption, burn rate, margin impact.
- [x] Add campaign builder:
  - promo type.
  - discount value and cap.
  - service/vehicle/zone scope.
  - customer segment.
  - date/time window.
  - total/daily budget.
  - usage limits.
  - stacking policy.
  - notification copy.
- [x] Add simulation panel:
  - sample order value.
  - distance.
  - service.
  - projected courier payout.
  - projected discount.
  - projected contribution margin.
  - pass/fail guard.
- [x] Block publish when margin guard fails.
- [x] Add approval workflow:
  - maker-checker.
  - finance approval for risky campaigns.
  - forced reason for override.
- [x] Add analytics:
  - impressions.
  - opens.
  - redemptions.
  - conversion rate.
  - incremental revenue estimate.
  - promo burn.
  - margin impact.
  - fraud rejection count.
- [x] Add audit event view.
- [x] Add skeleton/error states and toasts for mutations.

## P4 - Customer Booking Promo Integration

- [x] Show eligible promos in booking checkout.
- [x] Allow customer to select one promo or enter promo code.
- [x] Show discount transparently in Ringkasan Biaya.
- [x] Recalculate total using backend response only.
- [x] Disable pay button if promo validation is stale.
- [x] Revalidate promo before payment.
- [x] Release reserved budget if customer abandons checkout or payment fails.
- [x] Persist applied promo on order.
- [x] Add payment/order idempotency around promo redemption.

## P5 - Promo Notification & Marketing Delivery

- [x] Admin can choose campaign notification:
  - none.
  - in-app only.
  - push + in-app.
  - scheduled push.
- [x] Add frequency cap:
  - max marketing push per day.
  - max marketing push per week.
  - quiet hours.
- [x] Add segment preview count before sending.
- [x] Add delivery throttling.
- [x] Add unsubscribe/marketing preference enforcement.
- [x] Promo notifications appear in `Promo` tab.
- [x] Expired promo notifications become disabled but remain readable.
- [x] Deep link promo notification to promo detail or booking with promo preselected.

## P6 - Support/Bantuan Entry

- [x] Add support shortcut in Notification Center.
- [x] Add support reply notification category `support`.
- [x] If support ticket feature exists, deep link to ticket.
  - Saat ini modul support ticket mobile belum ada; notifikasi support memakai fallback aman ke Pusat Bantuan/Profile sampai modul ticket resmi dibuat.
- [x] If support ticket feature does not exist, link to existing Pusat Bantuan.
- [x] Do not mix support replies inside marketing promo list.

## Security Requirements

- Admin promo endpoints require admin auth and role permission.
- Risky campaign approval requires elevated role or TOTP if available.
- Never trust client-calculated discount.
- Promo validation and redemption must be server-side.
- Use parameterized SQL only.
- Add rate limit for promo validation/redeem endpoints.
- Add idempotency key for promo reservation/redemption.
- Do not expose customer segment raw query logic to mobile.
- Do not log PII, full address, phone, or raw device token.
- FCM payload must avoid sensitive detail; body should be short and non-sensitive.
- Notification deep links must validate current user access before opening data.
- Archived/read status update must verify notification owner.

## Observability

Metrics:

- `notification_created_total`
- `notification_push_sent_total`
- `notification_push_failed_total`
- `notification_opened_total`
- `notification_unread_count`
- `promo_campaign_active_total`
- `promo_redemption_total`
- `promo_rejection_total`
- `promo_budget_burn_amount`
- `promo_margin_guard_block_total`
- `promo_fraud_guard_block_total`

Alerts:

- promo burn above daily threshold.
- promo margin guard repeatedly failing.
- promo redemption velocity anomaly.
- FCM failure rate high.
- notification websocket failure rate high.

## Test Plan

### Backend

- [x] Migration up/down.
- [x] Unit test notification category/read/unread/deep-link.
- [x] Unit test chat notification creates `message` notification.
- [x] Unit test promo eligibility.
- [x] Unit test margin guard.
- [x] Unit test budget reservation/release.
- [x] Unit test promo redemption idempotency.
- [x] Unit test fraud/velocity guard.
- [ ] Integration test admin promo lifecycle.
- [ ] Integration test customer promo validation during checkout.
- [x] `npm run build`.
- [x] service test suite.

### Admin Dashboard

- [x] Build succeeds.
- [ ] Promo list loads.
- [ ] Campaign draft can be created.
- [ ] Margin simulation blocks negative margin.
- [ ] Approval workflow works.
- [ ] Publish/pause works.
- [x] Analytics panel renders.
- [x] No dangerous console logging of campaign/customer data.

### Android Customer

- [x] `.\gradlew.bat :app:assembleDebug`.
- [x] `.\gradlew.bat :app:testDebugUnitTest`.
- [x] Beranda shows notification bell, not logout.
- [x] Profile contains logout.
- [x] Notification Center loads Pesan/Aktivitas/Promo tabs.
- [x] Chat push opens exact order chat.
- [x] Activity push opens tracking.
- [x] Promo push opens promo detail.
- [x] Badge unread updates and clears on read.
- [ ] Foreground chat banner appears outside chat screen.
- [x] Marketing preference disables promo push.
- [ ] Offline state does not crash.

### Customer Web

- [x] Eligible promo appears in booking.
- [x] Applying promo updates Ringkasan Biaya from backend calculation.
- [x] Expired/ineligible promo shows clear reason.
- [x] Promo cannot reduce total below backend minimum rules.

## Verification Notes

- 2026-06-07: `backend/admin-service` `npm run build` sukses.
- 2026-06-07: `backend/admin-service` `npx jest --forceExit --detectOpenHandles src/services/orderCommunication.test.ts src/services/promoEngine.test.ts` sukses, 2 suites / 11 tests.
- 2026-06-07: `android-app-customer` `.\gradlew.bat :app:assembleDebug` sukses.
- 2026-06-07: `android-app-customer` `.\gradlew.bat :app:testDebugUnitTest` sukses.
- 2026-06-07: Foreground notification banner, dismiss action, promo deep link prefill, Android 13 notification permission prompt, and tracking chat unread dot implemented and compile-verified.
- 2026-06-07: `backend/admin-service` targeted notification/promo/communication tests ulang sukses: `npx jest --forceExit --detectOpenHandles src/services/orderCommunication.test.ts src/services/promoEngine.test.ts src/userNotifications.controller.test.ts` = 3 suites / 18 tests.
- 2026-06-07: `backend/admin-service` `npm run build` ulang sukses.
- 2026-06-07: `admin-dashboard` build ulang sukses dengan `VITE_API_URL=https://api.bawain.my.id/api/v1` dan `VITE_SOCKET_URL=https://api.bawain.my.id`.
- 2026-06-07: `frontend` customer web `npm run build` ulang sukses dengan env staging API/WS.
- 2026-06-07: `android-app-customer` `.\gradlew.bat :app:assembleDebug` dan `.\gradlew.bat :app:testDebugUnitTest` ulang sukses setelah patch banner/promo/tracking.
- 2026-06-07: Regression mobile courier juga dicek: `android-app` `.\gradlew.bat :app:assembleDebug` dan `.\gradlew.bat :app:testDebugUnitTest` sukses.
- 2026-06-07: `git diff --check` tidak menemukan whitespace error; warning hanya line-ending CRLF Windows.
- 2026-06-07: migration SQL up/down divalidasi pada temporary Postgres DB di Docker network lokal.
- 2026-06-07: `frontend` build customer web dan `admin-dashboard` build sudah pernah hijau pada implementasi promo/notifikasi ini; belum diulang setelah patch backend analytics karena frontend/admin file tidak berubah di patch terakhir.
- Warning tersisa: Gradle deprecation menuju Gradle 9.0 dan bundle admin dashboard besar. Keduanya bukan security blocker saat ini, tetapi masuk tech debt performa/upgrade.
- QA manual tersisa: foreground in-app banner di device/customer app, offline-mode visual state, admin Promo Manager klik lifecycle penuh, dan support-ticket deep link jika modul ticket support dibuat.

## Acceptance Criteria

- Customer can see notification bell on Beranda with unread badge.
- Customer can open Notification Center and see Pesan, Aktivitas, Promo.
- Chat messages create notification records and push payload with deep link.
- Tapping chat notification opens the correct order chat.
- Logout is no longer on Beranda and exists in Profile.
- Admin can create promo campaign draft.
- Admin cannot publish promo that fails margin guard unless approved as risk campaign.
- Promo budget cannot be overspent through normal redemption flow.
- Customer checkout applies promo only from backend-validated discount.
- Promo analytics shows burn, redemption, and margin impact.
- Security logs do not leak raw PII or secret values.

## Rollout Plan

1. Ship notification foundation and mobile bell with inbox read-only.
2. Enable chat/activity notifications.
3. Add Promo Engine backend with admin draft and simulation only.
4. Enable promo publish for internal/test segment.
5. Enable booking promo validation for staging.
6. Enable production promo with strict budget and margin guard.
7. Expand marketing automation after analytics are trustworthy.

## Business Decisions

- Default minimum contribution margin per service must be dynamic, not hardcoded.
  - Source of truth should come from service pricing/admin finance configuration.
  - Promo Engine must read the active margin policy by service, vehicle type, zone, and order context.
  - If no margin policy exists for a service, promo validation must fail closed.

- Risk campaigns can be approved by the current `superadmin`.
  - Superadmin approval is required when a campaign can go below the default margin guard.
  - Approval must require a business reason, max budget, campaign window, and audit log.

- Promo stacking is allowed only when promotions apply to different services.
  - Example: a shipping discount for motor service can coexist with a separate insurance promo if those are configured as different service components.
  - Two promos discounting the same service component cannot stack unless explicitly allowed by superadmin policy.

- Promotions apply after insurance/tax calculations.
  - Pricing order: base fare + service fees + insurance/tax/mandatory fees, then promo discount.
  - Promo discount must never reduce protected tax/insurance reserves below required values.

## Policy Recommendations To Confirm

- Maximum marketing push frequency per user:
  - Recommended default: max 1 marketing push per day and max 3 marketing pushes per week.
  - Transactional notifications like chat, order status, payment, POD, and support replies must not count against marketing frequency cap.
  - Add quiet hours, recommended 21:00-08:00 local time, except urgent transactional notifications.
  - Admin can lower or raise caps later, but initial production should be conservative to avoid uninstall/spam risk.

- Promo budget allocation timing:
  - Recommended flow: soft quote during checkout, reserve budget only when customer proceeds to payment or order confirmation.
  - Reservation should have short TTL, for example 10-15 minutes.
  - Release reservation automatically if payment fails, user abandons checkout, order is cancelled, or TTL expires.
  - Final redemption happens only after payment/order is successfully accepted.
  - This prevents budget overspend while avoiding budget being locked too early by users who only browse pricing.

- Recipient app users and marketing promo:
  - Recommended default: recipient app users receive transactional notifications only until they explicitly become a customer or opt in to marketing.
  - Transactional recipient notifications include Paket Masuk, courier chat/call, delivery status, location request, and POD.
  - Promo can be shown softly inside app surfaces after opt-in or after the recipient creates/places their own order.
  - Do not push marketing promos to recipient-only users by default because their relationship to TEMBUS starts as a delivery recipient, not a marketing subscriber.
