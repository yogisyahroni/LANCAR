package handler

import "testing"

func TestCompensationWouldExceedIntent(t *testing.T) {
	tests := []struct {
		name                    string
		refundedMinor           int64
		existingChargebackMinor int64
		chargebackMinor         int64
		intentMinor             int64
		want                    bool
	}{
		{name: "full refund followed by full chargeback", refundedMinor: 1000, chargebackMinor: 1000, intentMinor: 1000, want: true},
		{name: "overlapping partial refund and chargeback", refundedMinor: 400, chargebackMinor: 700, intentMinor: 1000, want: true},
		{name: "existing chargeback overlap", existingChargebackMinor: 600, chargebackMinor: 401, intentMinor: 1000, want: true},
		{name: "non overlapping partial compensation", refundedMinor: 400, chargebackMinor: 600, intentMinor: 1000, want: false},
		{name: "no prior compensation", refundedMinor: 0, chargebackMinor: 1000, intentMinor: 1000, want: false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := compensationWouldExceedIntent(tt.refundedMinor, tt.existingChargebackMinor, tt.chargebackMinor, tt.intentMinor); got != tt.want {
				t.Fatalf("compensationWouldExceedIntent() = %v, want %v", got, tt.want)
			}
		})
	}
}
