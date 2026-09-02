package service

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"strings"
	"time"

	"tembus/order-service/internal/domain"

	"github.com/google/uuid"
)

const (
	defaultHandoffTTL = 5 * time.Minute
	maxHandoffTTL     = 15 * time.Minute
)

type handoffService struct {
	repo    domain.HandoffTokenRepository
	now     func() time.Time
	newCode func() (string, error)
}

func NewHandoffService(repo domain.HandoffTokenRepository) domain.HandoffService {
	return &handoffService{repo: repo, now: func() time.Time { return time.Now().UTC() }, newCode: newHandoffCode}
}

func (s *handoffService) Issue(ctx context.Context, orderID, actorID string, stage domain.HandoffStage, ttl time.Duration) (string, *domain.HandoffToken, error) {
	if _, err := uuid.Parse(strings.TrimSpace(orderID)); err != nil {
		return "", nil, fmt.Errorf("invalid order id: %w", err)
	}
	if _, err := uuid.Parse(strings.TrimSpace(actorID)); err != nil {
		return "", nil, fmt.Errorf("invalid actor id: %w", err)
	}
	if stage != domain.HandoffStagePickup && stage != domain.HandoffStageDelivery {
		return "", nil, fmt.Errorf("invalid handoff stage: %s", stage)
	}
	if ttl <= 0 {
		ttl = defaultHandoffTTL
	}
	if ttl > maxHandoffTTL {
		ttl = maxHandoffTTL
	}
	code, err := s.newCode()
	if err != nil {
		return "", nil, fmt.Errorf("generate handoff token: %w", err)
	}
	now := s.now().UTC()
	record := &domain.HandoffToken{
		ID:          uuid.New().String(),
		OrderID:     strings.TrimSpace(orderID),
		ActorID:     strings.TrimSpace(actorID),
		Stage:       stage,
		TokenHash:   hashHandoffCode(code),
		MaxAttempts: 5,
		ExpiresAt:   now.Add(ttl),
		CreatedAt:   now,
	}
	if err := s.repo.CreateHandoffToken(ctx, record); err != nil {
		return "", nil, err
	}
	return code, record, nil
}

func (s *handoffService) Consume(ctx context.Context, token, orderID, actorID string, stage domain.HandoffStage) error {
	if strings.TrimSpace(token) == "" {
		return domain.ErrHandoffTokenInvalid
	}
	if _, err := uuid.Parse(strings.TrimSpace(orderID)); err != nil {
		return domain.ErrHandoffOrderMismatch
	}
	if _, err := uuid.Parse(strings.TrimSpace(actorID)); err != nil {
		return domain.ErrHandoffActorMismatch
	}
	if stage != domain.HandoffStagePickup && stage != domain.HandoffStageDelivery {
		return domain.ErrHandoffStageMismatch
	}
	return s.repo.ConsumeHandoffToken(ctx, hashHandoffCode(strings.TrimSpace(token)), strings.TrimSpace(orderID), strings.TrimSpace(actorID), stage, s.now().UTC())
}

func newHandoffCode() (string, error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf), nil
}

func hashHandoffCode(code string) string {
	digest := sha256.Sum256([]byte(code))
	return hex.EncodeToString(digest[:])
}
