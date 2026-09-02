package service

import (
	"testing"

	"tembus/order-service/internal/domain"
)

func TestValidateFoodDestination(t *testing.T) {
	tests := []struct {
		name    string
		req     domain.CreateFoodOrderRequest
		wantErr bool
	}{
		{
			name: "address and pin are accepted",
			req: domain.CreateFoodOrderRequest{
				DropoffAddress: "Jl. Sudirman No. 12, Jakarta",
				DropoffLat:     -6.2088,
				DropoffLng:     106.8456,
			},
		},
		{
			name: "address without pin is rejected",
			req: domain.CreateFoodOrderRequest{
				DropoffAddress: "Jl. Sudirman No. 12, Jakarta",
			},
			wantErr: true,
		},
		{
			name: "discovery zero pin is rejected",
			req: domain.CreateFoodOrderRequest{
				DropoffAddress: "Jl. Sudirman No. 12, Jakarta",
				DropoffLat:     0,
				DropoffLng:     0,
			},
			wantErr: true,
		},
		{
			name: "out of range pin is rejected",
			req: domain.CreateFoodOrderRequest{
				DropoffAddress: "Jl. Sudirman No. 12, Jakarta",
				DropoffLat:     -91,
				DropoffLng:     106.8456,
			},
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := validateFoodDestination(tt.req)
			if (err != nil) != tt.wantErr {
				t.Fatalf("validateFoodDestination() error = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}

func TestFoodQuoteInputFingerprintTracksPricingInputsOnly(t *testing.T) {
	base := domain.CreateFoodOrderRequest{
		MerchantID:     "merchant-1",
		Items:          []domain.FoodOrderItemRequest{{MenuID: "menu-1", Quantity: 1}},
		DropoffAddress: "Jl. Sudirman No. 12, Jakarta",
		DropoffLat:     -6.2088,
		DropoffLng:     106.8456,
	}
	withoutReceiver := base
	withoutReceiver.ReceiverName = "Penerima berbeda"
	withoutReceiver.ReceiverPhone = "08123456789"
	if foodQuoteInputFingerprint(base) != foodQuoteInputFingerprint(withoutReceiver) {
		t.Fatal("receiver metadata must not invalidate a price quote")
	}
	changedDestination := base
	changedDestination.DropoffLat = -6.21
	if foodQuoteInputFingerprint(base) == foodQuoteInputFingerprint(changedDestination) {
		t.Fatal("destination changes must invalidate a price quote")
	}
}
