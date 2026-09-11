# TEMBUS iconography and media governance — 2026

DS-2026-009 defines the functional icon and remote creative contract for the mobile super-app. Functional iconography uses the Material Symbols family already shipped by the Customer app; decorative campaign art cannot replace critical action icons.

## Canonical functional icon mapping

`ServiceIcons.kt` is the single Customer Android mapping used by Home/App Experience (`DynamicHomeRenderer`), order history, order detail, and notification activity rows.

| Service family | Code examples | Canonical icon | Canonical label |
| --- | --- | --- | --- |
| Paket instan | `on_demand`, `p2p`, `paket_instan` | `LocalShipping` | Paket Instan |
| Ekspedisi antar kota | `regular`, `ekspedisi_antar_kota` | `LocalShipping` | Ekspedisi Antar Kota |
| Food | `food`, `food_delivery` | `Restaurant` | Food |
| Tambal Ban | `tambal_ban_motor`, `tambal_ban_mobil` | `Build` | Tambal Ban Motor/Mobil |
| Towing / Derek | `towing_motor`, `towing_mobil` | `DirectionsCar` | Towing Motor/Mobil |

Unknown service codes resolve to the neutral `Info` icon and `Layanan TEMBUS`; they never borrow an unrelated vehicle icon.

## Media presets

| Preset | Ratio | Max source bytes | Safe text zone | Fallback |
| --- | ---: | ---: | --- | --- |
| `hero_banner` | 16:9 | 5 MiB | `none` by default | neutral app-owned state |
| `merchant_card` | 4:3 | 2 MiB | `none` | commerce placeholder |
| `sponsored_card` | 4:3 | 2 MiB | `none` | commerce placeholder |
| `category_tile` | 1:1 | 1 MiB | `none` | service icon |
| `campaign_intro` | 16:9 | 5 MiB | `none` | static verified image/icon for animated media |
| `empty_state` | 1:1 | 512 KiB | `none` | design-system icon |

The runtime manifest sanitizer accepts declared aspect ratios only within the preset tolerance. `safe_text_zone` is metadata with a bounded vocabulary; `none` is the safe default because current renderers place copy outside the asset. Animated/video assets must declare a fallback and it must be a static image/icon; metered/data-saver delivery already prefers that fallback through `ExperienceAssetPrefetchPolicy`.

## Creative safety

- Remote creative is verified raster/media content only: HTTPS/local packaged asset, checksum, content type, byte limit, dimensions, expiry, and fallback are checked before the asset becomes known-good.
- HTML, JavaScript, WebView, shell, arbitrary class/reflection, and UI-chrome properties are not renderable manifest capabilities. App-owned CTA buttons are rendered from sanitized semantic fields.
- Merchant or campaign creative cannot supply a fake system dialog, notification treatment, or executable/button UI. The renderer owns labels, actions, focus semantics, and accessibility text.

## Low-bandwidth and accessibility behavior

- Asset staging is atomic and audience-scoped; on metered/data-saver networks the static fallback is preferred.
- Broken or missing art reports the existing asset event and falls back to app-owned icon/placeholder without blocking the route.
- Alt text is sourced from sanitized `alt_label` or the content title; critical action icons keep semantic content descriptions and do not depend on decorative imagery.
