# Merchant onboarding and commercial lifecycle contract — 2026

This contract applies to Food merchant registration, KYB review, activation,
suspension, resubmission, and market-scoped verification. The existing
`merchant-service` remains the owner of merchant registration and operations;
`admin-service` owns privileged review actions.

## Canonical state machine

```text
DRAFT -> SUBMITTED -> VERIFYING -> ACTIVE -> SUSPENDED -> VERIFYING
  |          |            |           |
  |          +---------> REJECTED    +------> (merchant operations closed)
  |                       |
  +-----------------------+  (resubmission starts at SUBMITTED)
```

The persisted state is `merchants.onboarding_status`. Valid transitions are
implemented by `transition_merchant_onboarding(...)`; direct changes to the
canonical state are rejected by the database trigger. Any non-`ACTIVE` state
forces `merchants.is_open = false`. The legacy
`merchants.verification_status` value is a compatibility projection only.

## Ownership and structured data

| Concern | Source of truth |
|---|---|
| Merchant identity and operation | `merchants` and existing merchant-service repository |
| Legal entity, owner/operator, market | `merchant_legal_profiles` |
| Bank/payout account | existing merchant bank-account columns; `payout_account_reference` is a typed reference |
| Verification policy | `merchant_market_verification_requirements` |
| Review history | `merchant_onboarding_reviews` and `audit_logs` |
| Commercial terms | `merchant_commission_contracts` |

`merchant_onboarding_requirements_met(merchant_id)` fails closed when no active
market policy exists or a required document is absent. Requirements are
resolved by market and legal entity, and each policy carries a version and
effective window.

## API contract

Merchant registration is `POST /api/v1/merchant/register`. It creates a
`SUBMITTED` application (or resubmits an existing `DRAFT`/`REJECTED` application
with the same merchant ID). `market_code` is normalized to uppercase and
defaults to `ID-JK` for the current market.

Privileged review endpoints are protected by admin role, TOTP, an idempotency
key, and a valid admin actor:

| Endpoint | Transition |
|---|---|
| `POST /admin/merchants/:id/start-verification` | `SUBMITTED -> VERIFYING` |
| `POST /admin/merchants/:id/approve` | `VERIFYING -> ACTIVE` |
| `POST /admin/merchants/:id/reject` | `SUBMITTED/VERIFYING -> REJECTED` (reason required) |
| `POST /admin/merchants/:id/suspend` | `ACTIVE -> SUSPENDED` (reason required) |

Activation checks location and the current market policy in the same database
transaction. Merchant app `toggle-open`, `pause`, and `busy` operations require
the canonical `ACTIVE` state, so a client cannot self-activate.

Commercial contract creation and approval remain on the existing
`/admin/finance/merchant-commission-contracts` endpoints. Approved terms are
versioned by merchant/market/service and carry `effective_from`/`effective_to`;
overlapping approved periods are rejected by the database constraint/trigger.
