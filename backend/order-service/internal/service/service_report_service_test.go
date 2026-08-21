package service

import (
	"context"
	"errors"
	"testing"
	"time"

	"tembus/order-service/internal/domain"
)

type fakeServiceReportRepo struct {
	tambalCreated bool
	towingCreated bool
}

func (r *fakeServiceReportRepo) CreateTambalBanReport(ctx context.Context, report *domain.TambalBanReport) error {
	r.tambalCreated = true
	return nil
}

func (r *fakeServiceReportRepo) GetTambalBanReportByOrderID(ctx context.Context, orderID string) (*domain.TambalBanReport, error) {
	return nil, nil
}

func (r *fakeServiceReportRepo) CreateTowingReport(ctx context.Context, report *domain.TowingReport) error {
	r.towingCreated = true
	return nil
}

func (r *fakeServiceReportRepo) GetTowingReportByOrderID(ctx context.Context, orderID string) (*domain.TowingReport, error) {
	return nil, nil
}

func reportStringPtr(value string) *string {
	return &value
}

func TestServiceReportRequiresTambalBanProofs(t *testing.T) {
	repo := &fakeServiceReportRepo{}
	svc := NewServiceReportService(repo)
	now := time.Now()

	err := svc.CreateTambalBanReport(context.Background(), &domain.TambalBanReport{
		OrderID:             "order-1",
		CourierID:           "courier-1",
		TirePhotoBeforeURL:  reportStringPtr("/uploads/before.jpg"),
		TirePhotoAfterURL:   nil,
		TireConditionBefore: reportStringPtr("bocor"),
		CompletedAt:         &now,
	})
	if !errors.Is(err, domain.ErrInvalidServiceReport) {
		t.Fatalf("expected invalid service report error, got %v", err)
	}
	if repo.tambalCreated {
		t.Fatal("repo should not be called when tambal ban after-photo is missing")
	}

	err = svc.CreateTambalBanReport(context.Background(), &domain.TambalBanReport{
		OrderID:             "order-1",
		CourierID:           "courier-1",
		TirePhotoBeforeURL:  reportStringPtr("/uploads/before.jpg"),
		TirePhotoAfterURL:   reportStringPtr("/uploads/after.jpg"),
		TireConditionBefore: reportStringPtr("bocor"),
		CompletedAt:         &now,
	})
	if err != nil {
		t.Fatalf("expected valid tambal ban report, got %v", err)
	}
	if !repo.tambalCreated {
		t.Fatal("repo should be called for valid tambal ban report")
	}
}

func TestServiceReportRequiresTowingProofs(t *testing.T) {
	repo := &fakeServiceReportRepo{}
	svc := NewServiceReportService(repo)
	now := time.Now()

	err := svc.CreateTowingReport(context.Background(), &domain.TowingReport{
		OrderID:               "order-1",
		CourierID:             "courier-1",
		VehiclePhotoBeforeURL: reportStringPtr("/uploads/before.jpg"),
		CompletionPhotoURL:    reportStringPtr("/uploads/completion.jpg"),
		SignatureURL:          nil,
		CompletedAt:           &now,
	})
	if !errors.Is(err, domain.ErrInvalidServiceReport) {
		t.Fatalf("expected invalid service report error, got %v", err)
	}
	if repo.towingCreated {
		t.Fatal("repo should not be called when towing signature is missing")
	}

	err = svc.CreateTowingReport(context.Background(), &domain.TowingReport{
		OrderID:               "order-1",
		CourierID:             "courier-1",
		VehiclePhotoBeforeURL: reportStringPtr("/uploads/before.jpg"),
		CompletionPhotoURL:    reportStringPtr("/uploads/completion.jpg"),
		SignatureURL:          reportStringPtr("/uploads/signature.jpg"),
		CompletedAt:           &now,
	})
	if err != nil {
		t.Fatalf("expected valid towing report, got %v", err)
	}
	if !repo.towingCreated {
		t.Fatal("repo should be called for valid towing report")
	}
}
