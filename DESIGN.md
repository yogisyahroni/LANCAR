# TEMBUS — UI/UX Design System & Stitch Direction

> **Purpose:** master design brief untuk membuat ulang UI/UX TEMBUS di Google Stitch lalu dipindahkan/dirapikan ke Figma dan implementasi.
>
> **Brand:** **TEMBUS** — jangan gunakan nama “Tembus Logistic” sebagai product name.  
> **Tagline:** **Lebih Dekat, Lebih Cepat**  
> **Reference mood:** premium logistics, dark forest green, white surfaces, orange action accent, strong map/tracking experience, rounded cards, dense-but-clean operational information.

---

# 1. Design Vision

TEMBUS harus terasa seperti platform logistics & local-service Indonesia kelas 2026: **cepat, tepercaya, matang, modern, dan operasional**, bukan sekadar clone aplikasi delivery.

Visual yang dituju dari reference:

- Dark forest green sebagai brand foundation.
- Bright orange hanya untuk high-priority action/status emphasis.
- White/off-white cards untuk readability.
- Map menjadi bagian penting dari transaction experience.
- Large rounded cards dan bottom sheet untuk contextual information.
- Status timeline dibuat sangat terbaca.
- Typography tegas dan modern.
- Photography/illustration boleh premium, tetapi functional UI harus tetap dominan.

TEMBUS harus punya satu design DNA untuk Customer, Courier, Merchant, dan Admin, tetapi density dan interaction model menyesuaikan role.

---

# 2. Brand Rules

## 2.1 Naming

Use:

- **TEMBUS**
- **Lebih Dekat, Lebih Cepat**

Avoid:

- TEMBUS Logistic
- TEMBUS Logistics
- nama brand lain di reference

Service labels boleh memakai descriptor seperti `TEMBUS Food`, `TEMBUS Paket`, `TEMBUS Towing` hanya bila benar-benar dibutuhkan sebagai navigation label. Logo utama tetap **TEMBUS**.

---

# 3. Color System

## 3.1 Core Brand Tokens

```css
--tembus-green-950: #001F12;
--tembus-green-900: #002B18;
--tembus-green-800: #003A20; /* Primary brand */
--tembus-green-700: #07522F;
--tembus-green-600: #0B6A3B;
--tembus-green-500: #17814B;

--tembus-orange-600: #E95700;
--tembus-orange-500: #FF6A00; /* Primary accent */
--tembus-orange-400: #FF7F26;
--tembus-orange-100: #FFF0E6;

--neutral-0: #FFFFFF;
--neutral-25: #FCFCFA;
--neutral-50: #F7F8F6;
--neutral-100: #EEF1EE;
--neutral-200: #DDE3DE;
--neutral-300: #C7CEC8;
--neutral-500: #69736C;
--neutral-700: #354039;
--neutral-900: #111713;

--success: #16834A;
--warning: #C97A00;
--danger: #C9362B;
--info: #2166C2;
```

## 3.2 Usage Ratio

Suggested visual balance:

- 55–65% white / neutral surface
- 20–30% dark green
- 5–10% mid green
- ≤ 8% orange on a typical functional screen

Orange is an **action color**, not a wallpaper.

---

# 4. Light & Dark Theme

## 4.1 Light Theme

- App background: `#F7F8F6`
- Card: `#FFFFFF`
- Main text: `#111713`
- Secondary text: `#69736C`
- Brand header: `#003A20`
- Primary CTA: `#FF6A00`

## 4.2 Dark Theme

- App background: `#08110C`
- Elevated surface: `#0E1C14`
- Card: `#122219`
- Border: `#203329`
- Main text: `#F5F7F4`
- Secondary text: `#AAB6AE`
- Brand green should still be visually distinguishable from background.

Dark mode must not simply invert colors. Orange CTA remains controlled and readable.

---

# 5. Typography

Recommended feel: geometric humanist sans, high legibility on small screens.

Preferred hierarchy:

```text
Display XL   40 / 46, Semibold
Display L    32 / 38, Semibold
H1           28 / 34, Semibold
H2           24 / 30, Semibold
H3           20 / 26, Semibold
Title        18 / 24, Semibold
Body L       16 / 24, Regular
Body M       14 / 21, Regular
Body S       12 / 18, Regular
Label        12 / 16, Medium
Micro        10 / 14, Medium
```

Rules:

- Do not use ultra-light fonts for transactional information.
- Order ID may use semibold/bold.
- Currency/price must have strong visual hierarchy.
- Avoid ALL CAPS except micro labels and tags.

---

# 6. Spacing & Grid

Use 4pt base system.

```text
4  = micro
8  = xs
12 = sm
16 = md
20 = lg
24 = xl
32 = 2xl
40 = 3xl
48 = 4xl
```

Mobile horizontal page padding: **16–20 px**.  
Tablet/web uses 24–32 px minimum.

Never pack primary CTAs within <12 px vertical separation.

---

# 7. Shape Language

Reference-inspired but cleaner:

- Small control radius: 10–12 px
- Input: 12–14 px
- Standard card: 16 px
- Large card: 20 px
- Bottom sheet: 24 px top radius
- Modal: 20–24 px
- Pills/status chips: full radius

Avoid making every element pill-shaped.

---

# 8. Elevation

Use subtle shadow, not floating toy cards.

### Level 0
Flat section/background.

### Level 1
Standard card, subtle border/shadow.

### Level 2
Sticky bar, active bottom sheet.

### Level 3
Modal/navigation overlay.

For dark theme, use surface tonal elevation rather than heavy black shadow.

---

# 9. Iconography

Style:

- Rounded linear icons
- 1.8–2.0 px optical stroke
- Filled variant only for active nav/status emphasis
- Consistent corner radius

Service icons should be recognizable without label:

- Paket: parcel/box
- Pickup: box + upward/collection arrow
- Food: fork/spoon or food bag
- Tambal Ban: wheel/tire + repair cue
- Towing: tow truck
- Aggregator/More: grid or compare icon

No unnecessary brand logo inside every icon.

---

# 10. Illustration & Photography

Use for:

- Landing/onboarding
- Empty states
- Hero promo
- Campaign

Avoid large decorative imagery on:

- Checkout
- Active tracking
- Payment failure
- Emergency Tambal Ban/Towing
- Courier active job
- Admin Control Tower

These are task screens; clarity wins.

---

# 11. Core Components

## 11.1 App Bar

Variants:

- Brand app bar
- Back + title
- Search-focused
- Map overlay
- Transparent hero overlay
- Admin desktop header

---

## 11.2 Buttons

### Primary
Orange fill, dark/white text depending contrast audit.

### Secondary
White/neutral fill + green border/text.

### Tertiary
Text-only.

### Destructive
Danger color, never orange.

States:

- default
- pressed
- loading
- disabled
- success transition where needed

---

## 11.3 Service Tile

Contains:

- Icon/3D-lite illustration
- Service name
- Optional small badge

Primary home services should be 2×3 or 3×2 responsive grid, not 10 tiny icons.

---

## 11.4 Promo Hero / Banner Carousel

Inspired by reference but adapted to TEMBUS:

- 16–20 px radius
- Landscape image/illustration
- Dark-to-transparent gradient overlay when text sits on image
- Small category eyebrow
- 1 short headline
- 1 CTA max
- Pagination dots
- Manual swipe
- Admin-configurable deep link

Do not block Home loading if banner content fails.

---

## 11.5 Order Card

Shared skeleton across verticals:

```text
[Service Icon]  ORDER ID                 [Status Chip]
Title / merchant / route context
-----------------------------------------------
Pickup/origin        →       Destination
Date/ETA/status context
-----------------------------------------------
Timeline or compact progress
[Primary CTA] [Secondary CTA optional]
```

Variants:

- Compact active
- History
- Food
- Emergency service
- Courier offer
- Merchant processing

---

## 11.6 Status Chip

Examples:

- Menunggu Pembayaran
- Mencari Kurir
- Diproses Merchant
- Menuju Pickup
- Dalam Perjalanan
- Selesai
- Dibatalkan
- Refund Diproses

Do not use orange for every status.

---

## 11.7 Transaction Timeline

Reference uses horizontal stepper. TEMBUS needs two variants:

### Compact horizontal
For cards with 3–4 high-level stages.

### Detailed vertical
For order detail with timestamp and proof.

Rules:

- Completed = green
- Current = strong green ring/fill
- Future = neutral
- Failed/blocked = danger/warning
- Never rely on color only; use icon + label.

---

## 11.8 Map Tracking

Reference should influence this strongly.

Required:

- High contrast route polyline
- Pickup/drop-off marker
- Courier vehicle marker
- Recenter control
- Map attribution safe area
- Bottom sheet
- ETA card
- Stale GPS state

Bottom sheet layers:

1. Collapsed: status + ETA + driver
2. Mid: route summary + action
3. Expanded: complete order context

---

## 11.9 Price Summary

```text
Biaya dasar
Jarak
Biaya layanan
Tambahan
Promo
----------------
Total
```

`Total` is visually dominant. Any estimate must be labeled `Estimasi`.

---

## 11.10 Bottom Navigation

- White/neutral surface
- 4–5 destinations max
- Active icon green
- Small orange indicator allowed, not orange-filled entire item
- Label always visible on active state

Customer bottom nav:

`Beranda · Aktivitas · Pesan · Notifikasi · Akun`

Courier:

`Kerja · Order · Earnings · Inbox · Akun`

Merchant:

`Beranda · Pesanan · Menu · Keuangan · Akun`

---

# 12. Customer Home — Target Composition

```text
┌────────────────────────────────────────┐
│ Dark green brand header                │
│ Location + greeting + notification     │
│ Search bar                             │
│ Wallet / promo shortcut                │
└────────────────────────────────────────┘

[Service grid]
Kirim Paket | Ambil Paket | Food
Tambal Ban  | Towing      | Lainnya

[Hero carousel]

[Active order card — if exists]

[Quick repeat / recent]

[Recommended merchants/content]

[Bottom navigation]
```

Home should immediately answer:

1. Saya sedang di mana?
2. Saya bisa melakukan apa?
3. Apakah saya punya order aktif?
4. Apa yang membutuhkan perhatian saya?

---

# 13. Customer Paket Flow — Screen Design

## 13.1 Service Entry

- Header `Kirim Paket`
- Pickup card
- Destination card
- Recent addresses
- CTA `Lanjut`

## 13.2 Package Detail

- Category chips
- Weight/dimension
- Fragile
- Photo
- Notes

## 13.3 Service Selection

Card comparison:

- Vehicle/service
- ETA
- Capacity
- Price
- SLA note

Selected card uses green border + subtle green background.

## 13.4 Quote & Checkout

- Route mini-map
- Address summary
- Package summary
- Price breakdown
- Promo
- Payment method
- Sticky CTA `Pesan Sekarang`

## 13.5 Matching

- Animated restrained search state
- Price locked
- Cancel policy
- No fake countdown

## 13.6 Active Tracking

Use map-first layout similar reference image but TEMBUS-branded:

- Map top ~55–62%
- Bottom sheet with ETA, progress, driver, order ID
- Compact actions chat/call/help
- Expandable detail

---

# 14. Food Flow — Screen Design

## Explore

- Search
- Category carousel
- Promo carousel
- Nearby/open now
- Merchant cards

## Merchant

- Merchant hero small
- Rating/ETA/delivery fee
- Category sticky tab
- Product cards
- Floating cart bar when cart >0

## Cart / Checkout

- Items
- Modifiers
- Notes
- Address
- Promo
- Price
- Payment

## Tracking

Do not reuse parcel wording. Use contextual steps:

`Dikonfirmasi → Disiapkan → Kurir Mengambil → Diantar → Selesai`

---

# 15. Tambal Ban — Emergency UX

Emergency visual rules:

- No marketing banner.
- No unnecessary discovery section.
- Primary CTA visible above fold.
- Large location confirmation.
- Vehicle selector motor/mobil.
- Problem selection simple.
- Clear estimated arrival.

Suggested screen:

```text
Back                       Bantuan

Tambal Ban
Kami bantu cari teknisi terdekat.

[Map/location]
Lokasi Anda
Jl. ...

Kendaraan
[Motor] [Mobil]

Masalah
[Bocor] [Ban Kempis] [Pentil] [Lainnya]

[CTA Cari Bantuan]
```

Active service uses tracking shell + technician/courier profile + service proof.

---

# 16. Towing — Emergency UX

Use same emergency design family as Tambal Ban but different data:

- Vehicle
- Pickup
- Destination/workshop
- Drivable/not drivable
- Photo
- Access notes
- Quote

Active towing screen:

- Map
- Tow truck ETA
- Driver/company identity
- Vehicle pickup proof
- Route to destination
- Completion proof

---

# 17. Activity / My Orders

Reference rightmost screen is a strong starting point.

TEMBUS version:

- Title `Aktivitas`
- Filter chips:
  - Semua
  - Berlangsung
  - Selesai
  - Dibatalkan
- Optional service filter
- Cards contain:
  - service icon/name
  - order ID
  - origin/destination or merchant
  - created date
  - main status
  - compact timeline
  - CTA

Avoid oversized cards for fully completed historical items. Completed history can be more compact.

---

# 18. Notifications Screen

Group by:

- Hari ini
- Kemarin
- Sebelumnya

Notification item:

- Icon
- Title
- 1–2 line body
- Timestamp
- unread marker
- contextual deep link

---

# 19. Chat UI

- Context header with order ID/service
- Quick replies
- Text
- Photo when enabled
- Safety/report action
- System event messages visually different

No social-media gimmicks.

---

# 20. Courier Design Direction

Courier app should look like TEMBUS, but more operational than customer app.

## Work Home

- Strong online/offline toggle
- Map/area
- Demand badge
- Active job card
- Today earning
- Incentive progress

## Offer Screen

Primary visual priority:

1. Earnings
2. Pickup distance/time
3. Trip/service distance
4. Service requirement
5. Accept/decline timer

Accept = green or brand-primary interaction; orange may be reserved for urgency/primary highlight, but do not cause safety confusion.

## Active Job

Large step CTA:

- `Menuju Pickup`
- `Saya Sudah Tiba`
- `Ambil / Mulai Layanan`
- `Dalam Perjalanan`
- `Selesaikan`

All state transitions must wait for server confirmation or show explicit pending state.

---

# 21. Merchant Design Direction

Merchant UI is dense but should remain mobile-native.

## Home

- Store status
- Orders requiring action
- Sales today
- Settlement status
- Stock/menu warnings

## Order Queue

Use strong status segmentation and time elapsed.

New orders must visually stand out without using red as normal urgency.

## Finance

White cards, large amounts, clear labels:

- Gross
- Fees
- Promo contribution
- Adjustment
- Net settlement
- Payout status

---

# 22. Admin / Control Tower Web Design

Use same brand palette, but professional operations-dashboard density.

## Shell

- Dark green left sidebar
- Neutral content canvas
- 12-column grid
- Sticky top utilities
- Global search
- Time range and city/zone filters

## Control Tower

Priority areas:

- KPI strip
- Live map
- Incident/late-order queue
- Supply/demand panel
- Payment/payout warning panel
- Order table

Do not fill every dashboard cell with charts. Prefer actionable queues.

---

# 23. Responsive Rules

## Mobile

- Bottom nav
- Bottom sheet
- Single-column forms
- Sticky bottom CTA

## Tablet

- Navigation rail possible
- Two-pane order detail + map

## Desktop Web

- Sidebar
- Multi-column
- Table + detail drawer

Customer web should not simply stretch a phone UI to desktop width.

---

# 24. Accessibility Rules

- Touch target 48 dp preferred
- Text contrast minimum WCAG AA target
- Orange text on white must pass contrast; otherwise use darker orange or green text
- Focus state visible on web
- Screen reader labels
- Error message with text, not only red border
- Status icon + label
- Motion reduction

---

# 25. Microinteraction

Allowed:

- Button press feedback
- Map marker pulse on active arrival
- Subtle status transition
- Success check animation
- Bottom sheet snap
- Skeleton shimmer restrained

Avoid:

- Constant floating/bouncing icons
- Large parallax in transactional screens
- Excess haptics
- Celebration confetti for routine delivery

---

# 26. Empty, Loading, Error & Offline States

Every major screen must have:

- Loading
- Empty
- Error
- Offline/stale
- Partial data

Examples:

### Orders empty
`Belum ada aktivitas` + contextual CTA.

### Map stale
`Lokasi kurir belum diperbarui selama 2 menit.`

### Payment pending
`Pembayaran sedang dikonfirmasi. Jangan bayar ulang.`

### POD offline
`Bukti tersimpan di perangkat dan akan dikirim saat koneksi kembali.`

---

# 27. Content & Copy Style

Bahasa Indonesia first.

Tone:

- Ringkas
- Jelas
- Tidak terlalu formal
- Tidak kekanak-kanakan
- Action-oriented

Use:

- `Cari kurir`
- `Lacak pesanan`
- `Bayar sekarang`
- `Konfirmasi lokasi`

Avoid:

- jargon internal
- `fulfillment failed`
- `dispatch pending`

Translate internal state into user meaning.

---

# 28. Stitch Global Prompt

Copy this section into Stitch as the primary product prompt.

```text
Design a complete 2026 mobile-first UI/UX system for an Indonesian on-demand logistics and local services super-app named TEMBUS.

Brand name must be TEMBUS only. Do not use “TEMBUS Logistic” or any other company name. Tagline: “Lebih Dekat, Lebih Cepat”.

Visual direction:
- premium, modern, trustworthy, technical, operational
- primary brand dark forest green #003A20
- primary accent orange #FF6A00 used sparingly for high-priority calls to action and emphasis
- white and warm neutral content surfaces
- clean rounded cards, approximately 16–20 px radius
- modern geometric sans typography with strong legibility
- map-first tracking experience with a contextual bottom sheet
- status chips and clear delivery timelines
- avoid excessive gradients, glassmorphism, neon colors, or generic fintech appearance
- use subtle elevation and generous spacing
- support both light and dark themes
- accessibility-conscious contrast and touch targets

The ecosystem has four connected products:
1. Customer Android/Web
2. Courier Android
3. Merchant Android/Web
4. Admin/Control Tower Web

Current customer services:
- Kirim Paket on-demand
- Ambil Paket / pickup
- Food Delivery
- Aggregator / service comparison
- Tambal Ban for motorcycle and car
- Towing for motorcycle and car

Customer app core navigation:
Beranda, Aktivitas, Pesan, Notifikasi, Akun.

Customer Home must contain:
- dark green top brand/header region
- current location and greeting
- search
- wallet/payment/promo shortcut area if relevant
- service grid for Paket, Pickup, Food, Tambal Ban, Towing, and Lainnya/Aggregator
- CMS-driven hero promotional carousel
- active order card when an order exists
- recent/repeat actions
- bottom navigation

For parcel delivery, design:
- address/location selection
- package details
- service/vehicle selection
- quote and transparent price breakdown
- promo and payment method
- matching
- live map tracking
- delivery timeline
- courier card
- chat/call/help
- proof of delivery
- cancellation/refund
- rating/tip/report

For Food, design:
- explore and search
- merchant list
- merchant detail and menu
- item modifiers
- cart
- checkout
- merchant preparation status
- courier tracking
- merchant and courier rating

For Tambal Ban and Towing, create emergency-first flows with minimal steps, large primary actions, location confirmation, motor/car selection, problem/vehicle condition, quote, provider matching, realtime tracking, service proof, and support. Do not show ads or promotional carousels inside emergency flows.

Courier app core navigation:
Kerja, Order, Earnings, Inbox, Akun.
Include online/offline mode, courier offer, earnings, pickup navigation, proof capture, active job steps, payout, leaderboard/rewards, reputation, violations/appeal, worker documents, and support.

Merchant app core navigation:
Beranda, Pesanan, Menu, Keuangan, Akun.
Include store open/close, order queue, order detail, menu/catalog, stock, promo, operating hours, reviews, insights, settlement, payout, staff RBAC, chat/support, receipts/printing, and outlet settings.

Admin/Control Tower web must use a dark green sidebar and neutral content canvas. Include Overview, Live Operations, Orders, Customers, Couriers, Merchants, Services, Maps/Zones, Pricing, Promotions, CMS banners, Payments, Settlement, Payout, Refund/Reversal, Reconciliation, Risk/Fraud, Support/Disputes, Ratings/Reputation, Notifications, Feature Flags, RBAC, Audit Logs, Reports, and System Health.

Use one consistent transaction design language across all services. A transaction screen should have a status header, map when relevant, ETA, timeline, counterparty card, communication, payment summary, help/safety actions, and proof after completion.

Create reusable components and realistic Indonesian content. Do not use US addresses, dollars, miles, feet, or foreign logistics brand names. Use Indonesian addresses, Rupiah, kilometers, minutes, Indonesian names, and realistic Indonesian service wording.
```

---

# 29. Stitch Screen Prompt — Customer Home

```text
Create a high-fidelity Android customer home screen for TEMBUS, an Indonesian on-demand logistics and local services super-app.

Use dark forest green #003A20 as the main brand color and orange #FF6A00 as a controlled accent. White and warm gray cards. Premium 2026 design, clean and operational, not playful.

Top area:
- TEMBUS wordmark
- greeting and current Jakarta-area location
- notification icon
- full-width search bar

Below:
- six service tiles: Kirim Paket, Ambil Paket, Food, Tambal Ban, Towing, Lainnya
- a premium promotional carousel with one strong CTA and pagination dots
- an active order card if there is an order, including order ID, service, ETA, status, mini progress line, and “Lacak” button
- recent/repeat actions
- nearby food recommendations can appear below active transaction content

Bottom navigation: Beranda, Aktivitas, Pesan, Notifikasi, Akun.

Use Indonesian addresses, Rupiah, kilometers, and minutes. Do not use dollars, miles, US addresses, “Tembus Logistic”, or foreign brand logos.
```

---

# 30. Stitch Screen Prompt — Active Tracking

```text
Design a map-first active delivery tracking screen for TEMBUS.

Visual composition inspired by premium logistics tracking apps:
- map occupies approximately 58% of the screen
- dark green route polyline
- courier vehicle marker with a subtle pulse
- pickup and destination markers
- top back button and compact ETA/status control
- large rounded white bottom sheet

Bottom sheet content:
- ETA in minutes
- distance in kilometers
- expected arrival time
- compact three-to-four-step delivery progress
- message stating the courier is heading to the next point
- courier profile card with rating, vehicle, plate number, chat and call
- order ID and route summary
- help/safety entry

TEMBUS colors: #003A20 green, #FF6A00 accent, white/neutral surfaces.
Use Indonesian copy, locations, kilometers, minutes and Rupiah.
```

---

# 31. Stitch Screen Prompt — Activity

```text
Create the TEMBUS “Aktivitas” mobile screen.

Header:
- back or contextual top bar
- title Aktivitas
- subtitle “Lacak dan kelola pesananmu”

Filter chips:
Semua, Berlangsung, Selesai, Dibatalkan.

Use large but efficient rounded cards for active orders and compact cards for completed history.
Each active card includes:
- service icon and label
- order ID
- status chip
- pickup/origin
- destination or merchant
- order date
- ETA if active
- compact delivery timeline
- CTA Lacak or Lihat Detail

Use green for completed/current progress, neutral for future state, orange only for primary action/emphasis.
Indonesian content only.
```

---

# 32. Stitch Screen Prompt — Courier

```text
Design the TEMBUS courier Android app home and active-job experience.

Courier Home:
- strong online/offline control
- current working zone
- demand indicator
- today earnings
- active order card
- incentive/leaderboard progress
- support/safety shortcut
- bottom navigation: Kerja, Order, Earnings, Inbox, Akun

Courier Offer:
- estimated earning is highly visible
- pickup distance/time
- estimated service/trip distance
- pickup and destination context
- service type
- important requirements
- countdown
- clear Accept and Decline actions

Active Job:
- map and navigation
- step status
- customer/merchant contact
- proof requirement
- large next-action button
- server confirmation/pending state after each critical action

Visual identity remains TEMBUS: forest green #003A20, restrained orange #FF6A00, white/neutral cards, premium operational UI.
```

---

# 33. Stitch Screen Prompt — Merchant

```text
Design the TEMBUS Merchant mobile app for a restaurant or local merchant.

Home:
- outlet name and open/closed toggle
- new orders needing action
- today revenue
- settlement summary
- stock/menu alerts
- rating/review alert

Orders:
- tabs/status for Baru, Diproses, Siap, Kurir, Selesai
- elapsed timer
- order amount
- customer notes
- accept/reject where eligible

Menu:
- categories
- product cards
- stock toggle
- price
- edit action

Finance:
- gross sales
- platform fees
- promo contribution
- adjustment
- net settlement
- payout status

Bottom navigation: Beranda, Pesanan, Menu, Keuangan, Akun.
Use the same TEMBUS design system but with slightly higher information density than the customer app.
```

---

# 34. Stitch Screen Prompt — Admin Control Tower

```text
Design a responsive web Control Tower for TEMBUS.

Use a dark forest green #003A20 left sidebar, warm neutral workspace, white cards, and orange #FF6A00 only for priority actions/attention.

Main page should include:
- KPI strip: active orders, completed, delayed, cancellation, payment success, supply health
- large live map with order/courier markers
- delayed order/incident queue
- matching/no-courier issue queue
- merchant preparation delay panel
- emergency Tambal Ban/Towing cases
- payment/payout warning panel
- operational order table with service, order ID, customer, courier/merchant, state, SLA, location, last update, actions

Left navigation:
Overview, Control Tower, Orders, Customers, Couriers, Merchants, Services, Maps/Zones, Pricing, Promotions, CMS, Payments, Settlement, Payout, Refunds, Risk/Fraud, Support, Reputation, Notifications, Feature Flags, RBAC, Audit Logs, Reports, and System Health.

Prioritize actionable queues over decorative charts.
```

---

# 35. Design QA Checklist

Before a Stitch-generated screen is accepted:

- [ ] Brand says TEMBUS only.
- [ ] Uses #003A20 as primary green.
- [ ] Orange is not overused.
- [ ] Indonesian currency/location/unit conventions.
- [ ] Main CTA is obvious within 2 seconds.
- [ ] Transaction state is understandable without reading long text.
- [ ] Payment state is not confused with order state.
- [ ] Touch targets are large enough.
- [ ] Screen works in light and dark mode conceptually.
- [ ] Empty/loading/error/offline state is defined.
- [ ] No ads in emergency/critical transaction flow.
- [ ] No fake live data or countdown dark pattern.
- [ ] Component is reusable across verticals where appropriate.
- [ ] Copy is short and natural Indonesian.
- [ ] No US address, dollar, mile, or feet units.
- [ ] Map and bottom sheet do not cover required navigation controls.
- [ ] Status color is never the only information carrier.

---

# 36. Recommended Generation Order in Stitch

Generate screens in this order so the design system stabilizes early:

1. Customer Home
2. Customer Activity
3. Paket booking
4. Paket checkout
5. Paket active tracking
6. Food explore
7. Food merchant/menu
8. Food checkout/tracking
9. Tambal Ban emergency
10. Towing emergency
11. Customer account/support
12. Courier home/offer/active job
13. Courier earnings/payout
14. Merchant home/orders/menu
15. Merchant finance
16. Admin Control Tower
17. Admin order detail
18. Admin finance/risk/support

Do not generate 50 unrelated screens first. Lock foundations and core transaction shell, then scale variants.

---

# 37. Final Design Rule

The UI should make TEMBUS feel like **one intelligent platform with multiple services**, not six mini-apps living inside one APK. Keep the same navigation principles, transaction shell, payment language, tracking model, support access, and status logic across Paket, Food, Tambal Ban, Towing, and future services.
