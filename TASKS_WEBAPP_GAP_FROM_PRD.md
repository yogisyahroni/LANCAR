# TASKS WEBAPP GAP FROM PRD

Audit date: 2026-05-07

Scope:
- Customer Web Portal: `frontend`
- Admin Dashboard: `admin-dashboard`
- Web-facing API: `backend/admin-service`
- PRD references: `PRD_FINAL_v1.1.md` and `Prd v1.3 customerwebportal.md`

Legend:
- `[ ]` Not implemented
- `[/]` Partially implemented, needs completion
- `[x]` Mostly implemented

---

## Summary

Customer Web Portal sudah punya fondasi kuat: auth, dashboard, order list/detail, create order, bulk order, resi, dispute/chat, wallet, push prompt, dan layout portal. Gap terbesar ada di landing/public pages, integrasi maps/geocoding nyata, address book backend, laporan/export nyata, voucher page, notifikasi page penuh, keamanan web, dan kesesuaian URL PRD.

Admin Dashboard sudah jauh lebih lengkap: dashboard, orders, couriers, finance, analytics, zones, feature flags, vouchers, notifications, audit logs, settings, SLA, disputes, warehouse. Gap terbesar ada di RBAC multi-role end-to-end, force cancel/refund flow, detail media/GPS evidence, geofence/GPS spoofing alerts, meeting point management, churn/retraining workflow, custom report builder, dan hardening session/security.

---

## Customer Web Portal Tasks

### P0 - Routing, Auth, and Public Surface

- [ ] Align route structure with PRD v1.3.
  - Current routes are `/dashboard`, `/orders/new`, `/orders/bulk`, etc.
  - PRD expects `/app/dashboard`, `/app/kirim`, `/app/kirim-massal`, `/app/orders`, `/app/resi`, `/app/alamat`, `/app/laporan`, `/app/profil`, `/app/voucher`.
  - Add redirects or route aliases without breaking current pages.

- [ ] Build public landing page at `/`.
  - Navbar: logo, Layanan, Harga, Untuk UMKM, Tentang.
  - CTA: Cek Resi, Masuk, Daftar Gratis.
  - Mobile hamburger menu.
  - Current `/` only redirects to `/dashboard`.

- [ ] Build public `/cek-resi`.
  - Public input for resi.
  - Show limited tracking: status, origin/destination city, ETA.
  - Add CTA to login for full detail.
  - Add rate-limited backend endpoint or proxy to existing order lookup.

- [/] Complete web auth flow.
  - Existing: `/login`, `/daftar`, `/forgot-pin`, web session API, refresh token.
  - Missing/unclear: Google Sign In, Apple Sign In, Remember me 30-day behavior, reset PIN production flow, session expiry UX.

- [ ] Add CSRF protection for all web session state-changing requests.
  - PRD requires CSRF token.
  - Current axios uses httpOnly cookie style, but no visible CSRF handling.

### P0 - Single Order Booking

- [x] Replace mock geocoding/address handling in order form.
  - Added OSM/Nominatim autocomplete with saved-address and Jakarta fallback suggestions.
  - Added browser geolocation.
  - Added clickable mini map pin adjustment.
  - Added saved-address selector integration from current local address book.

- [x] Complete real-time price estimate behavior.
  - Uses web order calculate endpoint with 500ms debounced recalculation.
  - Shows loading skeleton and coverage/error state.
  - Breakdown includes distance fee, volumetric fee, surge, insurance, total, ETA, and selected model.

- [x] Add webcam dimension scan modal.
  - Added browser camera permission flow and reference-card instruction UI.
  - Added scan simulation with editable/manual fallback through existing dimension fields.

- [x] Harden QRIS payment modal.
  - Added 15-minute countdown using backend expiry.
  - Added payment status polling.
  - Added fallback "Saya sudah bayar" manual check endpoint.
  - Added expired/error/paid states and QR copy action.

### P0 - Bulk Order

- [x] Complete bulk order review/edit step.
  - Added inline editable rows with per-row revalidation.
  - Added search/filter in review table.
  - Added delete row and delete all error rows.
  - Backend now validates standard columns and returns stable progress/result shape.

- [/] Complete bulk background processing.
  - Existing: process/status APIs.
  - Add background progress toast that survives page navigation.
  - Add final notification and "download ZIP resi" CTA.
  - Add resilient polling/WebSocket reconnect.

- [x] Add downloadable Excel template.
  - Added standardized template download from upload step.
  - Template includes `Panduan`, `Orders`, and `Referensi` sheets.
  - Standard columns: recipient_name, recipient_phone, dropoff_address, category, weight_kg, length_cm, width_cm, height_cm, has_insurance, item_value, customer_notes, dropoff_lat, dropoff_lng.
  - Backend accepts these columns and Indonesian/legacy aliases.

- [ ] Add bulk ZIP resi backend + frontend flow.
  - `POST /orders/bulk-download`
  - `GET /orders/bulk-download/:job_id`
  - Max 100 resi per download, rate limit 10/hour/user.

### P1 - Order Management and Tracking

- [/] Complete order list filtering.
  - Existing: order list page and API.
  - Add URL-based filters for status, date range, delivery model, bulk/single.
  - Add full-text search by order number, recipient, address.
  - Add pagination state in URL.

- [/] Complete order detail live tracking.
  - Existing: order detail page, chat, some API calls.
  - Add full-height map with pickup/dropoff/courier markers and route polyline.
  - Add live courier location updates via WebSocket/polling.
  - Add per-leg ETA and relay timeline.
  - Add photo evidence links for pickup/handover/delivery.

- [/] Complete in-browser courier chat.
  - Existing: chat endpoints/components.
  - Add masked identity/number handling.
  - Add upload attachments where supported.
  - Add unread indicators and retry failed messages.

### P1 - Resi Management

- [/] Complete resi list filtering and bulk actions.
  - Existing: `resi` list page.
  - Add filter by date, bulk/single, status.
  - Add bulk select + ZIP download.

- [/] Complete resi detail export actions.
  - Existing: resi detail page and webcam-scan related UI.
  - Add real PDF generation/download.
  - Add PNG export.
  - Add print-friendly view.
  - Add shareable public link with limited info.
  - Add QR rotate/zoom and copy raw QR string.

- [ ] Add authenticated `/resi/scan` resolve flow.
  - PRD says leaked QR content must still require login to resolve.
  - Add backend endpoint and frontend scanner resolution state.

### P1 - Address Book

- [/] Replace localStorage-only address book with backend persistence.
  - Current address page stores data in localStorage.
  - Add CRUD API and database table usage.
  - Sync addresses across devices.

- [ ] Add Google Places autocomplete and interactive map pin for address modal.
  - Include label, recipient name, recipient phone, default pickup toggle.

- [ ] Add Excel import for address book.
  - Download template.
  - Upload, validate, preview, import.
  - Max 100 addresses per import.

### P1 - Dashboard, Reports, Voucher, Notifications

- [/] Complete dashboard data sources.
  - Existing dashboard page fetches orders and derives some stats.
  - Add dedicated dashboard summary API: active orders, completed this month, spending, loyalty tier, active promos.
  - Add 30-day bar chart with count/value toggle.
  - Add active order auto-refresh or WebSocket update every 30 seconds.

- [/] Replace laporan mock/local behavior with real analytics.
  - Current laporan page uses local storage and simulated delays.
  - Add backend analytics endpoint for monthly/quarter/custom range.
  - Add line chart, top destinations, model distribution, average weight, average cost, on-time rate.
  - Add Excel export and PDF export.

- [ ] Add customer voucher page at `/voucher` or `/app/voucher`.
  - List active vouchers.
  - Manual promo code input.
  - Used voucher history.
  - Auto-apply eligible voucher during checkout.

- [ ] Add full notification page at `/notifikasi` or `/app/notifikasi`.
  - Infinite scroll/pagination.
  - Filter by order update, promo, system.
  - Mark all as read.
  - Deep link to related page.

- [/] Complete browser push notification lifecycle.
  - Existing: prompt component, service worker, subscribe endpoint.
  - Add offline notification queue behavior.
  - Add handling when tab inactive.
  - Add unsubscribe and permission recovery UX.

### P1 - Profile and Security

- [/] Complete profile tabs.
  - Existing profile page has substantial UI.
  - Ensure tabs match PRD: Akun, Keamanan, Notifikasi, Referral.
  - Add profile photo upload + crop.
  - Add old PIN -> new PIN -> confirmation.
  - Add login history from backend.
  - Add logout all devices.
  - Add referral stats and reward history.

- [ ] Add auto-logout after 8 hours inactive.
  - Preserve in-progress form state where possible.
  - Show re-login modal on session expiry.

- [ ] Add web-specific rate limits.
  - Pricing estimate: 20 req/min/IP.
  - Create order: 5 req/min/user.
  - Bulk upload: 3/day/user.
  - Bulk download ZIP: 10/hour/user.

### P2 - UX, Accessibility, and Tech Stack Alignment

- [/] Complete keyboard shortcuts.
  - Existing: Ctrl/Cmd+K command palette.
  - Add `N` new order, `M` massal, `O` orders, `R` resi.
  - Add focus visible and keyboard navigation audits.

- [/] Complete responsive navigation.
  - Existing: collapsible/sidebar/mobile menu.
  - Add PRD-specified bottom navigation for 5 main mobile menu items or verify hamburger overlay coverage.

- [ ] Add explicit offline banner and offline-safe retry states.

- [ ] Add custom 404 and 500 pages for frontend.

- [ ] Align frontend dependencies with PRD or update PRD.
  - Missing from current `frontend/package.json`: `@vis.gl/react-google-maps`, `recharts`, `jsQR`, `react-pdf`, shadcn/ui setup.
  - Existing: Next, Zustand, React Query, xlsx, qrcode.react, socket.io-client.

---

## Admin Dashboard Tasks

### P0 - Authentication, RBAC, and Session Security

- [/] Implement full PRD RBAC end-to-end.
  - PRD roles: `super_admin`, `ops_manager`, `finance`, `cs_agent`, `zone_manager`.
  - Current admin routes are broadly protected as `super_admin` in `backend/admin-service/src/routes.ts`.
  - Add per-route permission checks in backend.
  - Add UI route guards and menu visibility by role.

- [/] Complete 2FA coverage.
  - Existing: TOTP is used for feature flag toggle/config and some settings actions.
  - Add mandatory 2FA for `super_admin` and `finance` login/session.
  - Add 2FA setup, recovery, enforcement states, and tests.

- [ ] Add admin session timeout and force logout from other devices.
  - PRD requires 8-hour timeout and force logout.
  - Add session list, revoke endpoint, UI action, and audit logs.

### P0 - Live Operations Dashboard

- [/] Complete real-time courier map.
  - Existing: dashboard and `LiveMap`.
  - Add courier marker status colors: available, on-delivery, on-relay, offline/suspended.
  - Add 10-second live update contract and stale-location state.
  - Add map filters by zone/status/model.

- [/] Complete active order panel filters.
  - Existing: active orders table.
  - Add filters for pending, assigned, picked_up, in_relay, delivered, failed.
  - Add model filters for P2P, 2-Kaki, 3-Kaki.
  - Add zone filters.

- [ ] Add real-time alert center for operational risk.
  - SLA breach >5 minutes.
  - Courier exits geofence.
  - GPS spoofing detected.
  - Server error rate >1%.
  - Persist alerts and expose acknowledge/resolve workflow.

- [/] Complete heatmap by order volume per hour.
  - Existing analytics has heat-data endpoint/UI references.
  - Verify map visualization, hourly filter, and backend aggregation accuracy.

### P0 - Order Management

- [/] Complete order detail evidence view.
  - Existing: order list/detail routes and reassign/flag.
  - Add package dimensions: actual vs volumetric.
  - Add timeline per leg with timestamp + GPS coordinates.
  - Add pickup/handover/delivery photo/video evidence.
  - Add courier GPS trail.
  - Add sent notification history.

- [/] Complete manual override.
  - Existing: reassign route/action.
  - Add courier selection UX with availability/zone constraints.
  - Add required reason and audit log.

- [ ] Add force-cancel order flow.
  - Admin reason modal.
  - Refund trigger.
  - Customer/courier notification.
  - Audit log.

- [/] Complete bulk export.
  - Existing: export orders route.
  - Add date range, status, zone filters.
  - Support CSV and Excel if PRD requires both.

### P0 - Courier Management

- [/] Complete courier detail profile.
  - Existing: couriers page, stats, detail/history APIs.
  - Add document previews for KTP, SIM, STNK.
  - Add verification status and approve/reject with notes.
  - Add vehicle details.
  - Add relay score history chart.
  - Add BPJS and micro-insurance status.

- [/] Complete suspend/unsuspend flow.
  - Existing: status update route.
  - Add required reason, duration, audit log, and notification.

- [/] Complete zone assignment workflow.
  - Existing: zones module and courier detail/history.
  - Add assign/move/multi-zone from courier profile.

- [ ] Add churn risk report.
  - Detect couriers with activity down >50% in 7 days.
  - Add list, filters, and export.

- [ ] Add retraining queue.
  - Auto-flag couriers with relay score <3.5.
  - Track retraining status and notes.

### P1 - Zone, Meeting Point, and Pricing

- [x] Zone polygon management appears present.
  - Existing: `Zones.tsx` uses Leaflet/Geoman and zone CRUD.

- [ ] Add meeting point management page.
  - PRD requires add/edit/delete meeting point per zone pair.
  - Include radius buffer by traffic condition and alternatives 1/2.
  - Backend order-service has meeting point admin APIs, but admin UI route is not visible.

- [/] Complete pricing configuration.
  - Existing: `PricingConfig.tsx` and backend pricing routes.
  - Verify P2P bracket, 2-leg/3-leg fee, surge time range, weather multiplier, demand/supply multiplier, loyalty discount.
  - Add volumetric divisor and bracket controls if missing.
  - Add preview simulation before save.

### P1 - Finance

- [/] Complete finance dashboard exports.
  - Existing: stats, payouts, emergency fund, MASA report routes.
  - Add PDF and Excel export for net profit report.
  - Add explicit period controls: daily, weekly, monthly, yearly.

- [/] Complete settlement management.
  - Existing: payout list, batch release, status update.
  - Add auto-failure recovery state.
  - Add per-courier payout history drilldown.

- [ ] Add MDR cost tracking.

- [ ] Add unit economics dashboard.
  - CAC, LTV, margin per order per model.

### P1 - Analytics and Reporting

- [/] Complete analytics dashboard coverage.
  - Existing: KPI, SLA, surge, scan accuracy, retention, heat data, export.
  - Add relay efficiency: handover success rate and courier idle time.
  - Add courier utilization, zone coverage, relay score distribution if not already complete.
  - Add dynamic pricing revenue impact validation.

- [ ] Add custom report builder.
  - Select metrics, dimensions, filters.
  - Save report presets.
  - Export generated report.
  - Current scheduled reports are not the same as a full custom builder.

### P1 - System Configuration

- [x] Feature flag management is substantially present.
  - Existing: feature flag page, readiness page, logs, TOTP-protected toggle/config.

- [/] Complete SLA configuration.
  - Existing: `SLAConfig.tsx` and `/admin/sla-configs`.
  - Verify per model/leg minutes, penalty %, idle compensation, and audit trail.

- [x] Voucher management appears present.
  - Existing: `Vouchers.tsx` and voucher CRUD/stats routes.

- [/] Complete notification template management.
  - Existing: `Notifications.tsx` and template CRUD routes.
  - Add channel-specific previews for push, WhatsApp, SMS.
  - Add test-send action.

- [/] Complete external API key management.
  - Existing: large settings page and system config APIs.
  - Verify Google Maps, BMKG, payment gateway keys have masked display, TOTP update, validation, and audit logs.

### P2 - Web Quality and Verification

- [ ] Add admin E2E coverage for critical flows.
  - Login + 2FA.
  - Feature flag toggle with TOTP.
  - Order reassign.
  - Courier suspend.
  - Payout batch release.
  - Zone polygon create/edit.

- [ ] Add customer portal E2E coverage for critical flows.
  - Login/register.
  - Create single order and payment modal.
  - Bulk upload/review/process.
  - Order detail chat.
  - Resi export.
  - Address CRUD.

- [ ] Add API contract tests for web-specific endpoints.
  - `/auth/web/*`
  - `/auth/web/orders/*`
  - `/auth/web/orders/bulk/*`
  - `/admin/*`

- [ ] Remove production debug logs and mock fallbacks from web UI.
  - Several frontend/admin files contain `console.log`, mock fallback comments, or simulated delays.
  - Keep structured logging only where needed.
