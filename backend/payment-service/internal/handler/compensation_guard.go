package handler

// compensationWouldExceedIntent prevents refund and chargeback losses from
// compensating more than the intent. Existing losses are included so another
// provider case cannot bypass the invariant with a new case id.
func compensationWouldExceedIntent(refundedMinor, existingChargebackMinor, chargebackMinor, intentMinor int64) bool {
	return refundedMinor+existingChargebackMinor+chargebackMinor > intentMinor
}
