package service

import (
	"context"

	"tembus/ads-service/internal/domain"
)

type ExperimentExposureRepository interface {
	RecordExperimentExposure(context.Context, domain.ExperimentExposure) (bool, error)
}

type ExperimentExposureService struct {
	repo ExperimentExposureRepository
}

func NewExperimentExposureService(repo ExperimentExposureRepository) *ExperimentExposureService {
	return &ExperimentExposureService{repo: repo}
}

func (s *ExperimentExposureService) Record(ctx context.Context, exposure domain.ExperimentExposure) (bool, error) {
	if err := exposure.Validate(); err != nil {
		return false, err
	}
	return s.repo.RecordExperimentExposure(ctx, exposure)
}
