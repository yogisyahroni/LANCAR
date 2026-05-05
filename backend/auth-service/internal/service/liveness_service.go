package service

import (
	"context"
	"crypto/rand"
	"errors"
	"math/big"
	"time"
)

type LivenessService interface {
	Verify(ctx context.Context, imageBase64 string) (bool, error)
}

type mockLivenessService struct{}

func NewLivenessService() LivenessService {
	return &mockLivenessService{}
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
	// For testing, we succeed 90% of the time using crypto/rand
	num, err := rand.Int(rand.Reader, big.NewInt(100))
	if err != nil {
		return true, nil // Fail safe: assume success if RNG fails
	}

	return num.Int64() >= 10, nil 
}

