package service

import (
	"strings"
	"testing"
	"time"

	"tembus/order-service/internal/domain"
)

func TestFoodMerchantOperatingState(t *testing.T) {
	for _, tc := range []struct {
		state string
		open  bool
		want  string
	}{
		{state: domain.OperatingStateOpen, open: true, want: ""},
		{state: domain.OperatingStateBusy, open: true, want: ""},
		{state: domain.OperatingStateClosed, open: false, want: "merchant tutup"},
		{state: domain.OperatingStatePaused, open: true, want: "merchant sedang pause"},
		{state: domain.OperatingStateTempClosed, open: true, want: "merchant sedang ditutup sementara"},
		{state: domain.OperatingStateHoliday, open: true, want: "merchant sedang libur"},
	} {
		t.Run(tc.state, func(t *testing.T) {
			err := validateFoodMerchantOperatingState(&domain.FoodMerchantInfo{OperatingState: tc.state, IsOpen: tc.open})
			if tc.want == "" {
				if err != nil {
					t.Fatalf("state %q rejected: %v", tc.state, err)
				}
				return
			}
			if err == nil || !strings.Contains(err.Error(), tc.want) {
				t.Fatalf("state %q error = %v, want text %q", tc.state, err, tc.want)
			}
		})
	}
}

func TestFoodLastOrderClosedUsesMerchantTimezone(t *testing.T) {
	closeAt := "08:00"
	merchant := &domain.FoodMerchantInfo{
		JamTutup:                    &closeAt,
		LastOrderMinutesBeforeClose: 30,
		OperatingTimezone:           "America/Los_Angeles",
	}
	la, err := time.LoadLocation("America/Los_Angeles")
	if err != nil {
		t.Fatal(err)
	}
	if !foodLastOrderClosed(merchant, time.Date(2026, 9, 8, 7, 40, 0, 0, la)) {
		t.Fatal("merchant timezone must control last-order cutoff")
	}
}
