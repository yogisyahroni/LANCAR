# TEMBUS translation-key governance

## Key rules

1. Use a stable, namespaced key such as `nav.orders` or
   `landing.service.food.description`.
2. One key represents one meaning. Do not reuse a key merely because two English
   strings currently match.
3. Keep placeholders named and stable (`{name}`, `{price}`); never concatenate
   translated sentence fragments around user data.
4. Keep the ID and EN dictionaries/resource files in parity. CI runs
   `python scripts/mobile/check_localization.py` before Android lint/build.
5. Do not put secrets, raw provider payloads, or legal approval metadata in a
   translation file.

## Dynamic content

Dynamic marketing and legal content is data with a locale, status, version, and
effective window. The resolver must apply the documented fallback chain and
return no record when eligibility is not proven. The market configuration API is
the canonical source for approved public legal documents; any CMS integration must
map into the existing content contract rather than inventing a parallel store.

## Review and lifecycle

New keys require a product owner/context, Indonesian and English copy, and a
review of long-copy and accessibility impact. Critical legal/financial copy must
carry a market-approved version before release. Deprecated keys remain available
until all clients have migrated; then they are removed in a separate cleanup with
an evidence update.

Reviewers should check:

- no inline user-facing sentence was introduced in a core surface;
- number/date/time/currency/address/phone formatting goes through the locale
  boundary;
- fallback never exposes a key or draft;
- translated copy wraps without clipping and preserves semantic labels;
- legal links preserve the approved version and use a safe relative/HTTPS URI.
