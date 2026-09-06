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
	towingReport  *domain.TowingReport
}

func (r *fakeServiceReportRepo) CreateTambalBanReport(ctx context.Context, report *domain.TambalBanReport) error {
	r.tambalCreated = true
	return nil
}

func (r *fakeServiceReportRepo) GetTambalBanReportByOrderID(ctx context.Context, orderID string) (*domain.TambalBanReport, error) {
	return nil, nil
}

func (r *fakeServiceReportRepo) GetTambalBanReportForCustomer(ctx context.Context, orderID, customerID string) (*domain.TambalBanReport, error) {
	if customerID == "customer-owner" {
		return &domain.TambalBanReport{OrderID: orderID}, nil
	}
	return nil, domain.ErrForbidden
}

func (r *fakeServiceReportRepo) CreateTowingReport(ctx context.Context, report *domain.TowingReport) error {
	r.towingCreated = true
	r.towingReport = report
	return nil
}

func (r *fakeServiceReportRepo) GetTowingReportByOrderID(ctx context.Context, orderID string) (*domain.TowingReport, error) {
	return r.towingReport, nil
}

func reportStringPtr(value string) *string { return &value }
func reportIntPtr(value int) *int          { return &value }

func validTambalBanReport(now time.Time) *domain.TambalBanReport {
	return &domain.TambalBanReport{
		OrderID:             "order-1",
		CourierID:           "courier-1",
		TireConditionBefore: reportStringPtr("bocor"),
		TirePhotoBeforeURL:  reportStringPtr("/uploads/before.jpg"),
		ServiceDurationMins: reportIntPtr(25),
		MaterialsUsedItems:  []string{},
		TireConditionAfter:  reportStringPtr("repair_completed"),
		TirePhotoAfterURL:   reportStringPtr("/uploads/after.jpg"),
		CompletedAt:         &now,
	}
}

func TestServiceReportRequiresTambalBanProofs(t *testing.T) {
	repo := &fakeServiceReportRepo{}
	svc := NewServiceReportService(repo)
	now := time.Now()

	report := validTambalBanReport(now)
	report.TirePhotoAfterURL = nil
	err := svc.CreateTambalBanReport(context.Background(), report)
	if !errors.Is(err, domain.ErrInvalidServiceReport) {
		t.Fatalf("expected invalid service report error, got %v", err)
	}
	if repo.tambalCreated {
		t.Fatal("repo should not be called when tambal ban after-photo is missing")
	}

	report = validTambalBanReport(now)
	err = svc.CreateTambalBanReport(context.Background(), report)
	if err != nil {
		t.Fatalf("expected valid tambal ban report, got %v", err)
	}
	if !repo.tambalCreated {
		t.Fatal("repo should be called for valid tambal ban report")
	}
}

func TestServiceReportRequiresStructuredTambalBanFields(t *testing.T) {
	now := time.Now()
	tests := []struct {
		name   string
		mutate func(*domain.TambalBanReport)
	}{
		{"condition before", func(r *domain.TambalBanReport) { r.TireConditionBefore = nil }},
		{"duration", func(r *domain.TambalBanReport) { r.ServiceDurationMins = nil }},
		{"duration lower bound", func(r *domain.TambalBanReport) { r.ServiceDurationMins = reportIntPtr(0) }},
		{"duration upper bound", func(r *domain.TambalBanReport) { r.ServiceDurationMins = reportIntPtr(1441) }},
		{"materials list presence", func(r *domain.TambalBanReport) { r.MaterialsUsedItems = nil }},
		{"condition after", func(r *domain.TambalBanReport) { r.TireConditionAfter = nil }},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			repo := &fakeServiceReportRepo{}
			svc := NewServiceReportService(repo)
			report := validTambalBanReport(now)
			tc.mutate(report)
			err := svc.CreateTambalBanReport(context.Background(), report)
			if !errors.Is(err, domain.ErrInvalidServiceReport) {
				t.Fatalf("expected invalid service report error, got %v", err)
			}
			if repo.tambalCreated {
				t.Fatal("repo should not be called for incomplete structured report")
			}
		})
	}
}

func TestServiceReportRejectsInvalidStructuredMaterials(t *testing.T) {
	now := time.Now()
	tests := [][]string{
		{"patch_kit", "patch_kit"},
		{"patch_kit", ""},
	}
	for _, materials := range tests {
		repo := &fakeServiceReportRepo{}
		svc := NewServiceReportService(repo)
		report := validTambalBanReport(now)
		report.MaterialsUsedItems = materials
		if err := svc.CreateTambalBanReport(context.Background(), report); !errors.Is(err, domain.ErrInvalidServiceReport) {
			t.Fatalf("expected invalid materials %v, got %v", materials, err)
		}
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
		LoadingPhotoURL:       reportStringPtr("/uploads/loading.jpg"),
		UnloadingPhotoURL:     reportStringPtr("/uploads/unloading.jpg"),
		UnloadingCompletedAt:  &now,
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

	repo = &fakeServiceReportRepo{}
	svc = NewServiceReportService(repo)
	err = svc.CreateTowingReport(context.Background(), &domain.TowingReport{
		OrderID: "order-1", CourierID: "courier-1",
		VehiclePhotoBeforeURL: reportStringPtr("/uploads/before.jpg"),
		LoadingPhotoURL:       reportStringPtr("/uploads/loading.jpg"),
		UnloadingPhotoURL:     reportStringPtr("/uploads/unloading.jpg"),
		CompletionPhotoURL:    reportStringPtr("/uploads/completion.jpg"),
		SignatureURL:          reportStringPtr("/uploads/signature.jpg"), CompletedAt: &now,
	})
	if !errors.Is(err, domain.ErrInvalidServiceReport) {
		t.Fatal("expected unloading destination timestamp to be required")
	}
	if repo.towingCreated {
		t.Fatal("repo should not be called when destination verification timestamp is missing")
	}

	err = svc.CreateTowingReport(context.Background(), &domain.TowingReport{
		OrderID:               "order-1",
		CourierID:             "courier-1",
		VehiclePhotoBeforeURL: reportStringPtr("/uploads/before.jpg"),
		CompletionPhotoURL:    reportStringPtr("/uploads/completion.jpg"),
		SignatureURL:          reportStringPtr("/uploads/signature.jpg"),
		CompletedAt:           &now,
	})
	if !errors.Is(err, domain.ErrInvalidServiceReport) {
		t.Fatalf("expected invalid towing report error when loading/unloading proof is missing, got %v", err)
	}
	if repo.towingCreated {
		t.Fatal("repo should not be called when towing loading/unloading proof is missing")
	}

	err = svc.CreateTowingReport(context.Background(), &domain.TowingReport{
		OrderID:               "order-1",
		CourierID:             "courier-1",
		VehiclePhotoBeforeURL: reportStringPtr("/uploads/before.jpg"),
		LoadingPhotoURL:       reportStringPtr("/uploads/loading.jpg"),
		UnloadingPhotoURL:     reportStringPtr("/uploads/unloading.jpg"),
		UnloadingCompletedAt:  &now,
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

func TestCreateTambalBanReportEncodesStructuredMaterialsForLegacyStorage(t *testing.T) {
	repo := &fakeServiceReportRepo{}
	svc := NewServiceReportService(repo)
	now := time.Now()
	report := validTambalBanReport(now)
	report.OrderID = "order-materials"
	report.MaterialsUsedItems = []string{"patch_kit", "valve_core"}

	if err := svc.CreateTambalBanReport(context.Background(), report); err != nil {
		t.Fatalf("expected structured materials to be accepted: %v", err)
	}
	if report.MaterialsUsed == nil || *report.MaterialsUsed != `["patch_kit","valve_core"]` {
		t.Fatalf("expected JSON materials in legacy storage field, got %v", report.MaterialsUsed)
	}
}

func TestCreateTowingReportAcceptsStructuredDamageReport(t *testing.T) {
	repo := &fakeServiceReportRepo{}
	svc := NewServiceReportService(repo)
	now := time.Now()
	report := &domain.TowingReport{
		OrderID: "order-damage", VehiclePhotoBeforeURL: reportStringPtr("/uploads/before.jpg"),
		LoadingPhotoURL: reportStringPtr("/uploads/loading.jpg"), UnloadingPhotoURL: reportStringPtr("/uploads/unloading.jpg"),
		UnloadingCompletedAt: &now,
		CompletionPhotoURL:   reportStringPtr("/uploads/completion.jpg"), SignatureURL: reportStringPtr("/uploads/signature.jpg"),
		DamageReport: &domain.TowingDamageReport{Areas: []string{"front_bumper", "left_door"}, Severity: "minor", SafeToTransport: true},
		CompletedAt:  &now,
	}
	if err := svc.CreateTowingReport(context.Background(), report); err != nil {
		t.Fatalf("expected structured damage report to be accepted: %v", err)
	}
}

func TestTowingReportRetrievalPreservesProofAndSignature(t *testing.T) {
	repo := &fakeServiceReportRepo{}
	svc := NewServiceReportService(repo)
	now := time.Now()
	report := &domain.TowingReport{
		OrderID: "order-retrieval", CourierID: "courier-1",
		VehiclePhotoBeforeURL: reportStringPtr("/uploads/before.jpg"),
		LoadingPhotoURL:       reportStringPtr("/uploads/loading.jpg"),
		UnloadingPhotoURL:     reportStringPtr("/uploads/unloading.jpg"), UnloadingCompletedAt: &now,
		CompletionPhotoURL: reportStringPtr("/uploads/completion.jpg"), SignatureURL: reportStringPtr("/uploads/signature.jpg"),
		CompletedAt: &now,
	}
	if err := svc.CreateTowingReport(context.Background(), report); err != nil {
		t.Fatalf("expected report persistence contract to pass: %v", err)
	}
	loaded, err := svc.GetTowingReport(context.Background(), report.OrderID)
	if err != nil {
		t.Fatalf("expected report retrieval to pass: %v", err)
	}
	if loaded == nil || loaded.LoadingPhotoURL == nil || *loaded.LoadingPhotoURL != "/uploads/loading.jpg" || loaded.SignatureURL == nil || *loaded.SignatureURL != "/uploads/signature.jpg" || loaded.UnloadingCompletedAt == nil {
		t.Fatalf("proof/signature/destination verification was not preserved: %#v", loaded)
	}
}
