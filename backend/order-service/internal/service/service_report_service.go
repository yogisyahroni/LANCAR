package service

import (
	"context"
	"fmt"
	"strings"
	"tembus/order-service/internal/domain"
)

type serviceReportServiceImpl struct {
	repo domain.ServiceReportRepository
}

func NewServiceReportService(repo domain.ServiceReportRepository) domain.ServiceReportService {
	return &serviceReportServiceImpl{repo: repo}
}

func (s *serviceReportServiceImpl) CreateTambalBanReport(ctx context.Context, report *domain.TambalBanReport) error {
	if err := validateTambalBanReport(report); err != nil {
		return err
	}
	return s.repo.CreateTambalBanReport(ctx, report)
}

func (s *serviceReportServiceImpl) GetTambalBanReport(ctx context.Context, orderID string) (*domain.TambalBanReport, error) {
	return s.repo.GetTambalBanReportByOrderID(ctx, orderID)
}

func (s *serviceReportServiceImpl) CreateTowingReport(ctx context.Context, report *domain.TowingReport) error {
	if err := validateTowingReport(report); err != nil {
		return err
	}
	return s.repo.CreateTowingReport(ctx, report)
}

func (s *serviceReportServiceImpl) GetTowingReport(ctx context.Context, orderID string) (*domain.TowingReport, error) {
	return s.repo.GetTowingReportByOrderID(ctx, orderID)
}

func validateTambalBanReport(report *domain.TambalBanReport) error {
	if report == nil {
		return fmt.Errorf("%w: body laporan wajib diisi", domain.ErrInvalidServiceReport)
	}
	if strings.TrimSpace(report.OrderID) == "" {
		return fmt.Errorf("%w: order_id wajib diisi", domain.ErrInvalidServiceReport)
	}
	if !hasValue(report.TirePhotoBeforeURL) {
		return fmt.Errorf("%w: tire_photo_before_url wajib diisi", domain.ErrInvalidServiceReport)
	}
	if !hasValue(report.TirePhotoAfterURL) {
		return fmt.Errorf("%w: tire_photo_after_url wajib diisi", domain.ErrInvalidServiceReport)
	}
	if report.CompletedAt == nil {
		return fmt.Errorf("%w: completed_at wajib diisi", domain.ErrInvalidServiceReport)
	}
	return nil
}

func validateTowingReport(report *domain.TowingReport) error {
	if report == nil {
		return fmt.Errorf("%w: body laporan wajib diisi", domain.ErrInvalidServiceReport)
	}
	if strings.TrimSpace(report.OrderID) == "" {
		return fmt.Errorf("%w: order_id wajib diisi", domain.ErrInvalidServiceReport)
	}
	if !hasValue(report.VehiclePhotoBeforeURL) {
		return fmt.Errorf("%w: vehicle_photo_before_url wajib diisi", domain.ErrInvalidServiceReport)
	}
	if !hasValue(report.CompletionPhotoURL) {
		return fmt.Errorf("%w: completion_photo_url wajib diisi", domain.ErrInvalidServiceReport)
	}
	if !hasValue(report.SignatureURL) {
		return fmt.Errorf("%w: signature_url wajib diisi", domain.ErrInvalidServiceReport)
	}
	if report.CompletedAt == nil {
		return fmt.Errorf("%w: completed_at wajib diisi", domain.ErrInvalidServiceReport)
	}
	return nil
}

func hasValue(value *string) bool {
	return value != nil && strings.TrimSpace(*value) != ""
}
