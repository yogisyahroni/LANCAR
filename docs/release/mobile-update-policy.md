# Mobile update policy

`APP-2026-015` owns minimum-version and update behavior for customer, courier,
merchant, and web clients. The authoritative policy is scoped by
`market_code + client_type + platform` in `mobile_release_policies`.

## Update modes

- `none`: no update prompt is required.
- `soft`: the update prompt is dismissible and is presented as release metadata;
  it must never be rendered or recorded as a payment/order failure.
- `hard`: only valid when the old binary is unsafe or incompatible. The server
  keeps active-order and support access available and disables initiation of new
  transactions until the client updates. Existing server-authoritative order and
  payment state is not changed by the prompt.

The API returns localized messages and a platform/market store destination. A
missing or unknown app version is handled conservatively: release metadata is
returned, but the client is not hard-blocked solely because its version header
is unknown.

## Native capability boundary

Remote policy is limited to release metadata: versions, update mode, localized
copy, store destination, and recovery-access flags. It cannot deliver executable
code, JavaScript, arbitrary transaction rules, or a replacement state machine.
Any new native capability still requires a reviewed Android/web release and the
normal store review process. Market operations may pause or degrade a market
through the existing server-side market controls without shipping a new binary.

## Operational change procedure

1. Confirm the target market, client, platform, binary safety/compatibility
   reason, store destination, and active-order/support recovery path.
2. Update the policy in the Admin Dashboard under **Mobile Release Policies**.
   Mutations require the existing TOTP and idempotency controls.
3. Use `soft` for a dismissible release notice. Use `hard` only for a genuinely
   unsafe or incompatible old binary; the database constraint rejects a hard
   policy that removes active-order or support access.
   Before a hard policy is saved, the Admin GUI shows the observed version
   distribution for the scoped market/client/platform from the last 30 days of
   experience telemetry. If there is no observed sample, the hard policy is
   blocked rather than presented as a fabricated affected-user estimate. The
   operator must confirm the impact estimate explicitly; the protected route
   also requires the version-policy permission, TOTP and an audit reason.
4. Verify the resolved endpoint for the target market/locale and test the
   customer, courier, and merchant update surfaces before promotion.
5. Record the revision and audit reason. Roll back by restoring the previous
   scoped policy through the same protected admin path.
