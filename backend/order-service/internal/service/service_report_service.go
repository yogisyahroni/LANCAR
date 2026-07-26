package service

import (
	"context"
	"tembus/order-service/internal/domain"
)

type serviceReportServiceImpl struct {
	repo domain.ServiceReportRepository
}

func NewServiceReportService(repo domain.ServiceReportRepository) domain.ServiceReportService {
	return &serviceReportServiceImpl{repo: repo}
}

func (s *serviceReportServiceImpl) CreateTambalBanReport(ctx context.Context, report *domain.TambalBanReport) error {
	return s.repo.CreateTambalBanReport(ctx, report)
}

func (s *serviceReportServiceImpl) GetTambalBanReport(ctx context.Context, orderID string) (*domain.TambalBanReport, error) {
	return s.repo.GetTambalBanReportByOrderID(ctx, orderID)
}

func (s *serviceReportServiceImpl) CreateTowingReport(ctx context.Context, report *domain.TowingReport) error {
	return s.repo.CreateTowingReport(ctx, report)
}

func (s *serviceReportServiceImpl) GetTowingReport(ctx context.Context, orderID string) (*domain.TowingReport, error) {
	return s.repo.GetTowingReportByOrderID(ctx, orderID)
}
