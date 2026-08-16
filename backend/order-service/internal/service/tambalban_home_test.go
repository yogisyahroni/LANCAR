package service

import (
	"context"
	"strings"
	"testing"

	"tembus/order-service/internal/domain"
)

// ============================================================
// TAMBAL BAN HOME — Unit tests (design Stitch UI/UX → end-to-end)
// ============================================================

type fakeAvailabilityRepo struct {
	domain.AvailabilityRepository
	couriers    []*domain.NearbyCourier
	services    map[string]*domain.DeliveryServiceProduct
}

func (f *fakeAvailabilityRepo) FindCouriersByCapability(ctx context.Context, serviceSubType string, radiusKM float64, lat, lng float64) ([]*domain.NearbyCourier, error) {
	return f.couriers, nil
}

func (f *fakeAvailabilityRepo) GetCourierByID(ctx context.Context, courierID, serviceSubType string, lat, lng float64) (*domain.NearbyCourier, error) {
	for _, c := range f.couriers {
		if c.CourierID == courierID {
			return c, nil
		}
	}
	return nil, errCourierNotFound
}

func (f *fakeAvailabilityRepo) GetDeliveryServiceByCode(ctx context.Context, code string) (*domain.DeliveryServiceProduct, error) {
	if p, ok := f.services[code]; ok {
		return p, nil
	}
	return nil, errServiceNotFound
}

func (f *fakeAvailabilityRepo) GetAvailabilityState(ctx context.Context, courierID string) (*domain.CourierAvailabilityState, error) {
	// No state record = treat as idle (available)
	return nil, errStateNotFound
}

func (f *fakeAvailabilityRepo) EstimateDistanceKM(ctx context.Context, lat1, lng1, lat2, lng2 float64) (float64, error) {
	return 1.5, nil
}

var errServiceNotFound = errServiceNotFoundT()
var errStateNotFound = errStateNotFoundT()
var errCourierNotFound = errT("courier not found")

type errT string

func (e errT) Error() string { return string(e) }

func errServiceNotFoundT() error { return errT("service not found") }
func errStateNotFoundT() error  { return errT("state not found") }

func newFakeRepo() *fakeAvailabilityRepo {
	return &fakeAvailabilityRepo{
		couriers: []*domain.NearbyCourier{
			{
				CourierID:           "c1",
				CourierName:         "Budi",
				Rating:              4.9,
				VehicleType:         "motor",
				CourierServicePrice: 15000,
				DistanceKM:          1.2,
				RadiusMaxKM:         10,
			},
			{
				CourierID:           "c2",
				CourierName:         "Agus",
				Rating:              4.8,
				VehicleType:         "motor",
				CourierServicePrice: 12000,
				DistanceKM:          2.5,
				RadiusMaxKM:         8,
			},
		},
		services: map[string]*domain.DeliveryServiceProduct{
			"tambal_ban_motor": {
				Code:            "tambal_ban_motor",
				Name:            "Tambal Ban Motor",
				BaseFareIDR:     5000,
				PerKmIDR:        2000,
				PlatformFeeIDR:  1000,
				PlatformFeePct:  2.5,
				SearchRadiiKM:   []float64{3, 5, 10},
			},
			"tambal_ban_mobil": {
				Code:            "tambal_ban_mobil",
				Name:            "Tambal Ban Mobil",
				BaseFareIDR:     10000,
				PerKmIDR:        3000,
				PlatformFeeIDR:  1000,
				PlatformFeePct:  2.5,
				SearchRadiiKM:   []float64{3, 5, 10},
			},
		},
	}
}

func TestGetTambalBanHome(t *testing.T) {
	svc := NewAvailabilityService(newFakeRepo())

	resp, err := svc.GetTambalBanHome(context.Background(), -6.2, 106.8)
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}

	if resp == nil {
		t.Fatal("expected response, got nil")
	}
	if len(resp.Services) != 2 {
		t.Errorf("expected 2 services, got %d", len(resp.Services))
	}
	if resp.Services[0].Code != "tambal_ban_motor" {
		t.Errorf("expected tambal_ban_motor first, got %s", resp.Services[0].Code)
	}
	if resp.Services[0].BaseFareIDR != 5000 {
		t.Errorf("expected base fare 5000, got %d", resp.Services[0].BaseFareIDR)
	}
	if resp.Count != 2 {
		t.Errorf("expected 2 couriers, got %d", resp.Count)
	}
	// Price range dari harga jasa kurir (min 12000, max 15000)
	if resp.PriceRange.Min != 12000 || resp.PriceRange.Max != 15000 {
		t.Errorf("expected price range 12000-15000, got %d-%d", resp.PriceRange.Min, resp.PriceRange.Max)
	}
}

func TestGetCourierDetail(t *testing.T) {
	svc := NewAvailabilityService(newFakeRepo())

	detail, err := svc.GetCourierDetail(context.Background(), "c1", "tambal_ban_motor")
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}

	if detail.CourierName != "Budi" {
		t.Errorf("expected Budi, got %s", detail.CourierName)
	}
	if detail.Rating != 4.9 {
		t.Errorf("expected rating 4.9, got %f", detail.Rating)
	}
	if detail.CourierServicePrice != 15000 {
		t.Errorf("expected price 15000, got %d", detail.CourierServicePrice)
	}
	if detail.ServiceSubType != "tambal_ban_motor" {
		t.Errorf("expected service sub type tambal_ban_motor, got %s", detail.ServiceSubType)
	}
}

func TestSearchTambalBanCouriers(t *testing.T) {
	svc := NewAvailabilityService(newFakeRepo())

	// Search "bu" → Budi
	resp, err := svc.SearchTambalBanCouriers(context.Background(), "bu", -6.2, 106.8, "tambal_ban_motor")
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if resp.Count != 1 || !strings.Contains(resp.Couriers[0].CourierName, "Budi") {
		t.Errorf("expected 1 courier Budi, got %d: %+v", resp.Count, resp.Couriers)
	}

	// Search empty → semua
	resp, err = svc.SearchTambalBanCouriers(context.Background(), "", -6.2, 106.8, "tambal_ban_motor")
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if resp.Count != 2 {
		t.Errorf("expected 2 couriers with empty query, got %d", resp.Count)
	}

	// Search tak ada hasil
	resp, err = svc.SearchTambalBanCouriers(context.Background(), "zzz", -6.2, 106.8, "tambal_ban_motor")
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if resp.Count != 0 {
		t.Errorf("expected 0 couriers, got %d", resp.Count)
	}
}
