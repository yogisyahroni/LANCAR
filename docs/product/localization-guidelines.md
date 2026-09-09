# TEMBUS localization, RTL, and accessibility guidelines

## Scope

The customer web portal and the customer, courier, and merchant Android apps use
`id-ID` as the default locale and `en-US` as the currently released alternate
locale. Android language preferences keep the historical `id`/`en` storage values
for backward compatibility, but all runtime configuration is normalized to BCP-47
tags (`id-ID`/`en-US`).

The web locale is selected by the `tembus_locale` cookie. The root document always
publishes `lang`, `dir`, and `data-locale`, and the client provider keeps those
values synchronized after a language change.

## Translation and fallback

- UI copy is addressed by a namespaced key; a source-language sentence is not a
  key. The web dictionaries are typed and checked for ID/EN parity by
  `scripts/mobile/check_localization.py`.
- Dynamic content resolves in this order: full requested locale, language-only
  locale, market default locale, language-only market default, then `id-ID`.
- Missing content is hidden or replaced by a deliberate safe UI state. Raw keys,
  unapproved legal text, and stale drafts must never be rendered.
- API/server values such as merchant names, addresses, order IDs, and provider
  statuses are data, not translations. They must be escaped and formatted only at
  the presentation boundary.

## Formatting

Use the locale-aware helpers in `frontend/src/i18n/format.ts` or the matching
Android `LocaleFormatters` object. Never hardcode `id-ID`, `Rp`, a date pattern, or
the device default inside a user-facing formatter.

- Money uses the market's ISO-4217 currency and minor-unit metadata. Amounts are
  not recalculated in the client.
- Dates and times accept an explicit IANA timezone from market configuration.
  Technical ISO parsing may use a protocol locale, but the displayed result must
  use the selected user locale.
- Address components are ordered and joined at the display boundary. Phone
  numbers retain country context and are displayed in an international form.
- IDs, coordinates, provider codes, and machine-readable dates remain stable for
  copy/export and are not translated.

## Long copy, RTL, and accessibility gate

Before enabling a locale or market, test the longest approved translation in every
critical flow (authentication, booking, order detail, payment, tracking, and
settings). Use flexible widths, wrapping, ellipsis only where loss is safe, and
content descriptions that remain meaningful after translation.

The direction contract recognizes RTL languages (`ar`, `fa`, `he`, `ur`, and
related tags) even while the release allowlist remains ID/EN. Web uses `dir` on
the root document; Compose provides `LocalLayoutDirection`. Directional icons and
spacing must be tested with the same long-copy fixture before an RTL market is
enabled. No production claim of an RTL market is made until its translations and
visual/device gate are approved.

Every localized surface retains semantic headings, labels, table headers, keyboard
focus, live-region behavior, minimum touch targets, and sufficient contrast. Run
the existing axe/Playwright checks for ID and EN and rerun them with the RTL
direction fixture. Android unit/resource checks are deterministic; they do not
replace a real emulator visual review.

## Legal and marketing content

Marketing records must be `published` and inside their effective window. Legal
records must be `approved`, versioned, and effective. The public market-config
contract (`docs/contracts/market-configuration-2026.md`) is the source of truth
for market legal document versions and public URIs; the client must not create a
second legal store or infer a market fallback. `LocalizedContent` provides the
safe resolver and preserves the server-provided version for audit/display.
