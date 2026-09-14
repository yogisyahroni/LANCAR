# CRM loyalty liability and breakage policy — 2026 draft

Status: implementation draft; Finance and Legal approval required before production use.

## Accounting boundary

The immutable `loyalty_ledger_entries` table is the source of loyalty points and
their liability snapshot. `loyalty_accounts.points_balance` is a locked
projection. Earn, redeem, reverse, expire and manual corrections append a new
ledger row and are never repaired by editing history. Order-linked rows must
reference a canonical order and its payment/refund state before they are
released or reversed.

Referral liability is measured from `crm_referral_attributions` and is released
only after the qualifying order is in a completed state and the Risk decision
is not review/block. Membership subsidy is measured from the owning Food
membership subsidy ledger; campaign reservations remain a projection and are
reconciled against the canonical order subsidy.

## Expiry and breakage proposal

1. Points expire 12 months after the last qualifying earn unless the market
   policy says otherwise.
2. Expiry is an `EXPIRE` ledger event with the original liability reference;
   it is not a negative balance rewrite.
3. Breakage is recognized only for points that are both expired and outside the
   legally required customer-claim window. Unexpired or disputed points remain
   a liability.
4. Recognition is posted per market/currency and policy version, with the
   expired-point population, liability amount, approval and journal reference
   retained as evidence.
5. A Finance-approved correction uses a compensating `ADJUSTMENT` entry. A
   Legal/Compliance hold prevents recognition for affected markets.

## Approval and evidence gate

Finance must approve the liability account mapping, expiry period, claim window,
currency treatment and breakage journal before activation. Legal/Compliance
must confirm the market-specific customer terms and any consumer-protection
restrictions. Until both approvals are attached to the release record, the
implementation must report `POLICY_DRAFT_NOT_APPROVED` and must not recognize
breakage as revenue.

This draft closes the engineering design gap only; it does not represent the
required Finance/Legal approval or a live accounting posting.
