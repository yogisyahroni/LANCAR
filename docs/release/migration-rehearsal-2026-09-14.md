# Migration rehearsal — 2026-09-14

## Scope

This rehearsal used a disposable `postgis/postgis:15-3.4-alpine` container and
synthetic data only. It did not connect to or copy data from the running staging
database (`tembus-db`).

## Execution

1. Goose applied the repository migration chain through
   `20260901000006_aggregator_claim_evidence.sql`.
2. The canonical legacy fixture was inserted.
3. 10,000 synthetic `carrier_event_inbox` rows were inserted before
   `20260901000007_carrier_event_provider_fields.sql`.
4. Goose applied the remaining chain through `20260914000004_crm_market_policy_seed.sql`.
5. The canonical order contract verification passed.
6. The provider-field backfill invariant returned `carrier_rows=10000` and
   `provider_status_populated=10000`.
7. Goose `down` completed for the latest migration, proving the rollback step.

## Result

`PASS` for this controlled production-like schema/data-volume rehearsal. The
record proves migration ordering, a non-trivial data backfill, canonical
invariants and a rollback step. It is not a production migration deployment
claim and contains no credentials or production records.
