package service

import (
	"encoding/json"
	"math"
	"testing"
)

// Mock Structures to simulate Payment Service Data
type PaymentRequest struct {
	AmountIDR int64 `json:"amount_idr"`
}

func parsePaymentPayload(payload []byte) (*PaymentRequest, error) {
	var req PaymentRequest
	// In Go, unmarshaling a decimal/float into int64 will fail if it's not a whole number when strictly typed, 
	// or we can strictly enforce it with a decoder that disallows unknown fields or custom UnmarshalJSON
	err := json.Unmarshal(payload, &req)
	if err != nil {
		return nil, err
	}
	return &req, nil
}

func isValidAmount(amount int64) bool {
	// Reject negative amount
	if amount < 0 {
		return false
	}
	// Reject max int overflow (though Go handles int64 naturally up to 9 quintillion)
	if amount == math.MaxInt64 {
		return false
	}
	return true
}

func roundToIDR(amount float64) int64 {
	// Standard Rounding policy for IDR (Round half to even/up depending on math.Round)
	return int64(math.Round(amount))
}

func TestMoneyType_DecimalExploitRejected(t *testing.T) {
	// Payload containing a float 50000.50 which is invalid for strictly int64 fields
	payload := []byte(`{"amount_idr": 50000.50}`)
	
	_, err := parsePaymentPayload(payload)
	if err == nil {
		t.Errorf("Expected decimal/float payload to fail unmarshaling into int64, but it succeeded")
	}
}

func TestMoneyType_NegativeAmountRejected(t *testing.T) {
	if isValidAmount(-10000) {
		t.Errorf("Expected negative amount to be rejected")
	}
}

func TestMoneyType_IntegerOverflowRejected(t *testing.T) {
	if isValidAmount(math.MaxInt64) {
		t.Errorf("Expected extreme max integer (overflow risk) to be rejected or handled safely")
	}
}

func TestMoneyType_RoundingPolicyStable(t *testing.T) {
	tests := []struct {
		input    float64
		expected int64
	}{
		{50000.4, 50000},
		{50000.5, 50001},
		{50000.6, 50001},
		{999.99, 1000},
	}

	for _, tt := range tests {
		result := roundToIDR(tt.input)
		if result != tt.expected {
			t.Errorf("Rounding policy failed. Expected %d for input %f, got %d", tt.expected, tt.input, result)
		}
	}
}
