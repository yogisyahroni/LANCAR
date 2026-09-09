# Runtime Design Tokens Contract — 2026

## Scope

Runtime design tokens are optional campaign presentation metadata carried as a
`design_tokens` section in the existing experience manifest. The section is
not rendered directly. The native customer app resolves it into compiled
design-system values inside `RuntimeThemeProvider`.

The provider is scoped to dynamic dashboard presentation content. It is not
added to the global `TEMBUSCustomerTheme`. Booking, payment, order, tracking,
and other critical transaction screens therefore keep packaged theme values;
shared campaign content rendered in one of those screens must pass
`enabled = false`.

## Allowed section

```json
{
  "id": "campaign-theme",
  "component": "design_tokens",
  "properties": {
    "accent_preset": "campaign_orange",
    "background_preset": "accent_soft",
    "corner_preset": "standard",
    "spacing_preset": "relaxed",
    "badge_preset": "pill"
  }
}
```

All properties are optional and have these packaged defaults:

| Property | Allowed values | Default |
| --- | --- | --- |
| `accent_preset` | `brand`, `campaign_orange`, `campaign_blue` | `brand` |
| `background_preset` | `surface`, `brand_soft`, `accent_soft` | `surface` |
| `corner_preset` | `compact`, `standard`, `emphasized` | `standard` |
| `spacing_preset` | `compact`, `standard`, `relaxed` | `standard` |
| `badge_preset` | `hidden`, `label`, `pill` | `pill` |

The server rejects unknown properties and values before publication. Both the
server schema and Android sanitizer use the same finite allowlist. The fixed
palette mappings are checked for WCAG AA normal-text contrast (at least
4.5:1); the Android resolver falls back to packaged defaults if a future
mapping fails its local contrast guard.

## Safety boundary

Remote values cannot contain arbitrary hex colors, CSS, layout instructions,
font family names, font binaries, JavaScript, WebView content, or executable
UI code. Runtime tokens can adjust only bounded accent/background palette
presets, corner presets, spacing presets, and badge presentation. They cannot
change transaction amounts, eligibility, pricing, payment state, order state,
provider state, authorization, or any other authoritative business state.

The manifest remains in the existing checksum-verified `sections` payload and
does not require a new database table or migration.
