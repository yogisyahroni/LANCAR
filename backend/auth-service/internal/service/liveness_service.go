package service

import (
	"context"
	"errors"
	"math/rand"
	"time"
)

type LivenessService interface {
	Verify(ctx context.Context, imageBase64 string) (bool, error)
}

type mockLivenessService struct {
	rng *rand.Rand
}

func NewLivenessService() LivenessService {
	return &mockLivenessService{
		rng: rand.New(rand.NewSource(time.Now().UnixNano())),
	}
}

func (s *mockLivenessService) Verify(ctx context.Context, imageBase64 string) (bool, error) {
	if imageBase64 == "" {
		return false, errors.New("empty image data")
	}
	
	// Simulate AI processing latency
	select {
	case <-time.After(500 * time.Millisecond):
	case <-ctx.Done():
		return false, ctx.Err()
	}

	// In production, this would call an external KYC provider (e.g., Advance.ai or Verihubs)
	// For testing, we succeed 90% of the time
	return s.rng.Float32() > 0.1, nil 
}
