import unittest


class FaultInjectedRuntime:
    """Small deterministic model of the production safety contracts."""

    def __init__(self):
        self.failures = set()

    def fail(self, dependency):
        self.failures.add(dependency)

    def transactional_write(self, in_flight, limit):
        if in_flight >= limit:
            return {"accepted": False, "code": "ERR_TRANSACTION_LOAD_SHED"}
        return {"accepted": True, "committed": True}

    def read(self, dependency):
        if dependency == "database_replica" and dependency in self.failures:
            return {"source": "database_writer", "stale": False}
        return {"source": dependency, "stale": False}

    def publish(self, dependency):
        if dependency in self.failures:
            return {"outbox_persisted": True, "ack": False, "requeue": True}
        return {"outbox_persisted": True, "ack": True, "requeue": False}

    def provider_call(self, dependency, transactional=False):
        if dependency not in self.failures:
            return {"success": True, "attempts": 1, "circuit_open": False}
        return {
            "success": False,
            "attempts": 3,
            "circuit_open": True,
            "transactional_success": False if transactional else None,
        }

    def maps_route(self):
        if "maps" in self.failures:
            return {"status": "degraded", "fallback": "approximate", "pricing_authoritative": False}
        return {"status": "healthy", "fallback": None, "pricing_authoritative": True}

    def carrier_event(self):
        if "carrier" in self.failures:
            return {"canonical_status": "UNKNOWN", "replayable": True}
        return {"canonical_status": "IN_TRANSIT", "replayable": False}

    def notification(self):
        if "notification" in self.failures:
            return {"transaction_committed": True, "delivery_deferred": True}
        return {"transaction_committed": True, "delivery_deferred": False}


class ResilienceContractTests(unittest.TestCase):
    def setUp(self):
        self.runtime = FaultInjectedRuntime()

    def test_redis_failure_still_has_bounded_write_protection(self):
        self.runtime.fail("redis")
        result = self.runtime.transactional_write(in_flight=64, limit=64)
        self.assertEqual(result["code"], "ERR_TRANSACTION_LOAD_SHED")
        self.assertFalse(result["accepted"])

    def test_database_replica_failure_does_not_use_stale_read(self):
        self.runtime.fail("database_replica")
        result = self.runtime.read("database_replica")
        self.assertEqual(result["source"], "database_writer")
        self.assertFalse(result["stale"])

    def test_queue_failure_keeps_work_replayable(self):
        self.runtime.fail("queue")
        result = self.runtime.publish("queue")
        self.assertTrue(result["outbox_persisted"])
        self.assertFalse(result["ack"])
        self.assertTrue(result["requeue"])

    def test_maps_failure_is_labeled_and_cannot_set_price_truth(self):
        self.runtime.fail("maps")
        result = self.runtime.maps_route()
        self.assertEqual(result["status"], "degraded")
        self.assertEqual(result["fallback"], "approximate")
        self.assertFalse(result["pricing_authoritative"])

    def test_payment_failure_cannot_create_transaction_success(self):
        self.runtime.fail("payment")
        result = self.runtime.provider_call("payment", transactional=True)
        self.assertFalse(result["success"])
        self.assertFalse(result["transactional_success"])
        self.assertTrue(result["circuit_open"])
        self.assertEqual(result["attempts"], 3)

    def test_carrier_failure_preserves_unknown_and_replay(self):
        self.runtime.fail("carrier")
        result = self.runtime.carrier_event()
        self.assertEqual(result["canonical_status"], "UNKNOWN")
        self.assertTrue(result["replayable"])

    def test_notification_failure_does_not_rollback_domain_commit(self):
        self.runtime.fail("notification")
        result = self.runtime.notification()
        self.assertTrue(result["transaction_committed"])
        self.assertTrue(result["delivery_deferred"])


if __name__ == "__main__":
    unittest.main()
