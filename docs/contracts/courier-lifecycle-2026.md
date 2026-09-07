# Courier lifecycle contract — 2026

This contract is the canonical ownership and onboarding model for courier
profiles. It applies to the existing admin, auth, matching, and courier
mobile APIs.

## State machine

```text
DRAFT -> SUBMITTED -> VERIFYING -> ACTIVE -> SUSPENDED -> ACTIVE
  |          |            |            |
  |          +--------->  +--------->  +------> DEACTIVATED
  |               |           |        +------> DEACTIVATED
  +------> DEACTIVATED       +------> REJECTED
                   +------> NEEDS_UPDATE

REJECTED -> DRAFT -> SUBMITTED
NEEDS_UPDATE -> DRAFT -> SUBMITTED
```

The persisted value is `courier_profiles.onboarding_status`. State changes
are performed by server-side transition handlers and are recorded in
`courier_profile_status_history`. `ACTIVE` is only valid when verification,
the onboarding checklist, and a primary vehicle are ready. The database guard
also rejects an invalid direct activation update.

## Ownership boundaries

| Concern | Source of truth |
|---|---|
| Identity | `users.id`, `courier_profiles.nik`, compliance documents |
| Contact | `users.full_name`, `users.email`, `users.phone_number` |
| Market | `courier_profiles.market_code`, `application_channel`, `onboarding_policy_version` |
| Home zone | `courier_profiles.home_zone_id` |
| Operating zones | active rows in `courier_zones`; `current_zone_id` is the current operating zone |
| Vehicle | `courier_vehicles` (primary vehicle is the eligibility vehicle) |
| Capabilities | `courier_service_capabilities` |
| Verification | `courier_profiles.verification_status`, `is_verified`, and `verified_at` |
| Operational presence | `courier_profiles.status` and `is_online` |
| Combined read model | `courier_profile_canonical` view |

The read model joins these existing bounded tables without creating a second
identity, vehicle, capability, or zone source of truth.

## Market and capability onboarding

The policy version is stored with each checklist. The default Indonesian
policy (`courier-profile-v1`) requires:

- on-demand: base identity/vehicle/bank documents plus SKPD, SKCK, face
  enrollment, active SIM, vehicle age/engine/CC rules, and vehicle category
  restrictions;
- regular: base identity/vehicle/bank documents plus selfie;
- roadside capability (`tambal_ban*` or `towing*`): SKPD and active tax rule;
- food capability: face enrollment and face-enrolled rule.

The server stores the resolved `required_documents`, `required_rules`,
`service_categories`, market, and policy version in `onboarding_checklist`.
Therefore a client cannot choose a weaker checklist by changing a UI toggle.

## Compatibility

The migration normalizes the historical schema where `status` was used for
verification status. `verification_status` is retained for compatibility
with matching and admin reads, while `status` is the operational presence
projection used by auth/tracking. Legacy approved and verified records are
backfilled as audited `ACTIVE` records.
