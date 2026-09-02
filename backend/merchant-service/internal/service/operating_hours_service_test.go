package service_test

import (
	"context"
	"testing"

	"tembus/merchant-service/internal/domain"
	"tembus/merchant-service/internal/service"
)

type operatingHoursRepo struct {
	*foodDocsRepo
	hours    []domain.MerchantOperatingHour
	closures []domain.MerchantSpecialClosure
	replaced []domain.MerchantOperatingHour
}

func (r *operatingHoursRepo) GetOperatingHours(ctx context.Context, merchantID string) ([]domain.MerchantOperatingHour, error) {
	return r.hours, nil
}
func (r *operatingHoursRepo) ReplaceOperatingHours(ctx context.Context, merchantID string, hours []domain.MerchantOperatingHour) error {
	r.replaced = hours
	r.hours = hours
	return nil
}
func (r *operatingHoursRepo) ListSpecialClosures(ctx context.Context, merchantID string) ([]domain.MerchantSpecialClosure, error) {
	return r.closures, nil
}

func TestGetOperatingHours_UsesExistingMerchantHoursAsRealFallback(t *testing.T) {
	merchant := approvedMerchant()
	merchant.JamBuka, merchant.JamTutup = strp("08:00"), strp("20:00")
	repo := &operatingHoursRepo{foodDocsRepo: &foodDocsRepo{merchant: merchant}}
	svc := service.NewMerchantService(repo, nil, nil, nil)

	response, err := svc.GetOperatingHours(context.Background(), "user-1")
	if err != nil {
		t.Fatalf("GetOperatingHours() error = %v", err)
	}
	if len(response.Hours) != 7 {
		t.Fatalf("hours count = %d, want 7", len(response.Hours))
	}
	if !response.Hours[0].IsOpen || response.Hours[0].OpensAt == nil || *response.Hours[0].OpensAt != "08:00" {
		t.Fatalf("fallback must use actual profile hours, got %+v", response.Hours[0])
	}
}

func TestReplaceOperatingHours_RejectsDuplicateWeekday(t *testing.T) {
	repo := &operatingHoursRepo{foodDocsRepo: &foodDocsRepo{merchant: approvedMerchant()}}
	svc := service.NewMerchantService(repo, nil, nil, nil)
	hours := make([]domain.MerchantOperatingHour, 7)
	for index := range hours {
		hours[index] = domain.MerchantOperatingHour{Weekday: index, IsOpen: false}
	}
	hours[6].Weekday = 5

	if _, err := svc.ReplaceOperatingHours(context.Background(), "user-1", hours); err == nil {
		t.Fatal("ReplaceOperatingHours() expected validation error for duplicate weekday")
	}
	if len(repo.replaced) != 0 {
		t.Fatal("invalid schedule must not be persisted")
	}
}

func TestReplaceOperatingHours_PersistsAllDays(t *testing.T) {
	repo := &operatingHoursRepo{foodDocsRepo: &foodDocsRepo{merchant: approvedMerchant()}}
	svc := service.NewMerchantService(repo, nil, nil, nil)
	hours := make([]domain.MerchantOperatingHour, 7)
	for weekday := 0; weekday < 7; weekday++ {
		hours[weekday] = domain.MerchantOperatingHour{Weekday: weekday, IsOpen: weekday != 3}
		if weekday != 3 {
			open, close := "09:00", "21:00"
			hours[weekday].OpensAt, hours[weekday].ClosesAt = &open, &close
		}
	}

	response, err := svc.ReplaceOperatingHours(context.Background(), "user-1", hours)
	if err != nil {
		t.Fatalf("ReplaceOperatingHours() error = %v", err)
	}
	if len(repo.replaced) != 7 || len(response.Hours) != 7 {
		t.Fatalf("persisted=%d response=%d, want all 7", len(repo.replaced), len(response.Hours))
	}
}

func TestReplaceOperatingHours_RejectsLastOrderOutsideSupportedWindow(t *testing.T) {
	repo := &operatingHoursRepo{foodDocsRepo: &foodDocsRepo{merchant: approvedMerchant()}}
	svc := service.NewMerchantService(repo, nil, nil, nil)
	hours := make([]domain.MerchantOperatingHour, 7)
	for weekday := 0; weekday < 7; weekday++ {
		open, close := "09:00", "21:00"
		hours[weekday] = domain.MerchantOperatingHour{
			Weekday: weekday, IsOpen: true, OpensAt: &open, ClosesAt: &close,
			LastOrderMinutesBeforeClose: 181,
		}
	}

	if _, err := svc.ReplaceOperatingHours(context.Background(), "user-1", hours); err == nil {
		t.Fatal("last order over 180 minutes must be rejected")
	}
	if len(repo.replaced) != 0 {
		t.Fatal("invalid last-order schedule must not be persisted")
	}
}
