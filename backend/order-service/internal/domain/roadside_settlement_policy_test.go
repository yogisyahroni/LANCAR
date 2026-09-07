package domain

import (
	"errors"
	"math"
	"testing"
)

func TestRoadsidePercentExactAndBounded(t *testing.T) {
	cases := []struct {
		amount int64
		rate   float64
		want   int64
		bad    bool
	}{
		{120000, 2.9, 3480, false}, {1, 99.99, 0, false}, {math.MaxInt64, 100, math.MaxInt64, false},
		{math.MaxInt64, 0.1, 9223372036854775, false}, {-1, 10, 0, true}, {100, -1, 0, true},
		{100, 101, 0, true}, {100, math.NaN(), 0, true}, {100, math.Inf(1), 0, true},
	}
	for _, tc := range cases {
		got, err := RoadsidePercent(tc.amount, tc.rate)
		if (err != nil) != tc.bad || (!tc.bad && got != tc.want) {
			t.Errorf("percent(%d,%v) = %d,%v; want %d bad=%v", tc.amount, tc.rate, got, err, tc.want, tc.bad)
		}
	}
}

func TestRoadsideSettlementProofCollectionAndPricing(t *testing.T) {
	source := &RoadsideSettlementSource{OrderID: "order", ServiceCode: "tambal_ban_motor", ServiceSubType: "tambal_ban_motor", Status: StatusDelivered, AssignedCourierID: "courier", ReportID: "report", FinalReportReady: true, FinancialReady: true, GrossTotalIDR: 120000, CollectedTotalIDR: 120000, BaseFareIDR: 50000, DistanceFeeIDR: 20000, InsuranceFeeIDR: 5000}
	config := &SettlementConfig{CommissionBasis: SettlementBasisPerKM, PlatformCommissionPct: 20, MDRPct: 1, TaxPct: 1, CourierKeepsBaseFee: true}
	result, err := CalculateRoadsideSettlement(source, config)
	if err != nil {
		t.Fatal(err)
	}
	if result.PlatformCommissionAmt != 14000 || result.EstimatedNetEarnings != 98600 {
		t.Fatalf("unexpected financial result: %+v", result)
	}
	bad := *source
	bad.FinalReportReady = false
	if err := ValidateRoadsideSettlementSource(&bad); !errors.Is(err, ErrRoadsideSettlementProofRequired) {
		t.Fatalf("missing proof: %v", err)
	}
	bad = *source
	bad.CollectedTotalIDR = 119999
	if err := ValidateRoadsideSettlementSource(&bad); !errors.Is(err, ErrRoadsideSettlementCollectionRequired) {
		t.Fatalf("uncollected: %v", err)
	}
	bad = *source
	bad.BaseFareIDR = 120001
	if _, err := CalculateRoadsideSettlement(&bad, config); err == nil {
		t.Fatal("inconsistent components accepted")
	}
	bad = *source
	bad.Status = StatusCancelled
	if err := ValidateRoadsideSettlementSource(&bad); !errors.Is(err, ErrRoadsideSettlementNotDelivered) {
		t.Fatalf("cancelled: %v", err)
	}
	bad = *source
	bad.ServiceSubType = "towing_motor"
	bad.ServiceCode = "towing_motor"
	if _, err := CalculateRoadsideSettlement(&bad, config); err == nil {
		t.Fatal("other category accepted")
	}
	wrong := *config
	wrong.PlatformCommissionPct = 101
	if _, err := CalculateRoadsideSettlement(source, &wrong); err == nil {
		t.Fatal("invalid commission accepted")
	}
}
