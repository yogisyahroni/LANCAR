# Deterministic resilience/fault-injection tests

`test_resilience_contract.py` is a local/CI-safe failure matrix. It injects
failures for Redis, database replica, queue, maps, payment, carrier and
notification dependencies and asserts the safe policy: bounded work, typed
degradation, durable replay, `UNKNOWN` provider state and no fake financial
success.

Run:

```text
python -m unittest discover -s tests/chaos -p "test_*.py" -v
```

This is not a substitute for a staging or production-safe outage rehearsal.
Live drills require an approved environment, owner, change window and
rollback plan; their evidence belongs in the incident/release record.

