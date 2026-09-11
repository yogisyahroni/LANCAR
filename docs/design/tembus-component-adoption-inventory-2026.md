# TEMBUS component adoption inventory — 2026

## Purpose

This inventory is the DS-2026-011 review record. It identifies repeated
Material/Compose primitives before adding new TEMBUS components and records
the first high-frequency migrations. Product screens may still compose native
Material internals when the composition is domain-specific, but reusable
Button/Card/Search/Chip/AppBar/Badge/Navigation semantics must use the
governed TEMBUS API or be explicitly listed as a composition exception.

## Inventory result

| Primitive concern | Existing duplicate pattern | Governed TEMBUS contract | Adoption decision |
| --- | --- | --- | --- |
| Button / loading / destructive state | native `Button`, `TextButton` in screens | `TembusButton` + semantic variant/state | Food Home retry migrated; transaction-specific screens remain staged for their domain task. |
| Icon button / favorite / navigation action | native `IconButton` with per-screen modifiers | `TembusIconButton` | Food Home back/cart migrated; commerce card favorite already uses the TEMBUS commerce contract. |
| Search field | native `OutlinedTextField` with local shape/icon styling | `TembusSearchField` | Food Home discovery migrated; Dashboard hero search remains a compact semantic search trigger, not a second input API. |
| Chip / filter | native `FilterChip`/`AssistChip` with local colors | `TembusChip` | Food Home halal and discovery sort controls migrated; selected semantics are centralized. |
| Card / merchant presentation | native cards and local merchant card implementations | `TembusCard` and `TembusMerchantCard`/`TembusSponsoredMerchantCard` | Food merchant results use the TEMBUS commerce family; Dashboard domain cards retain composition-only native internals until a behavior-preserving extraction is warranted. |
| App bar | screen-specific rows and native `TopAppBar` | `TembusAppBar` where title-bar anatomy is reusable | Food Home uses a compact service-specific header; no new global app-bar duplicate was introduced. |
| Badge | local count/status boxes | `TembusBadge` or a domain registry | Sponsored disclosure and service icons use governed contracts; count badges remain local compositions when their geometry is part of the parent action. |
| Bottom navigation | native `NavigationBar`/item wiring | `TembusBottomNavigation` | Customer Dashboard phone layout migrated; rail layout remains a platform-specific adaptation. |

## Highest-frequency migration evidence

- Customer Food discovery now imports `TembusSearchField`, `TembusChip`,
  `TembusIconButton`, and the TEMBUS commerce cards. Its existing search,
  filter, cart, favorite, loading, error, and merchant-click behavior is
  preserved.
- Customer Dashboard phone navigation now uses `TembusBottomNavigation`; the
  existing destination keys and click callbacks are unchanged.
- `TembusChip` exposes selected state through accessibility semantics, so the
  migrated filter row does not depend on a screen-owned selection vocabulary.

## Naming / asset guard

Production source uses TEMBUS or semantic domain names. Benchmark names are not
functional component names. Approved icons and deterministic neutral fallbacks
are used for functional UI; Food Home contains no emoji fallback or random SVG
placeholder.

## Removal policy

No legacy primitive was deleted in this increment. Removal is deferred until
all call sites have migrated and compile/accessibility regression checks pass.
This keeps the change behavior-preserving and makes the inventory auditable.
