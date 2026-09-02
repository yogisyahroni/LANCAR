package domain

import (
	"context"
	"errors"
	"time"
)

type HandoffStage string

const (
	HandoffStagePickup   HandoffStage = "pickup"
	HandoffStageDelivery HandoffStage = "delivery"
)

var (
	ErrHandoffTokenInvalid       = errors.New("HANDOFF_TOKEN_INVALID")
	ErrHandoffTokenExpired       = errors.New("HANDOFF_TOKEN_EXPIRED")
	ErrHandoffTokenConsumed      = errors.New("HANDOFF_TOKEN_CONSUMED")
	ErrHandoffTokenAttemptsLimit = errors.New("HANDOFF_TOKEN_ATTEMPTS_EXCEEDED")
	ErrHandoffActorMismatch      = errors.New("HANDOFF_ACTOR_MISMATCH")
	ErrHandoffOrderMismatch      = errors.New("HANDOFF_ORDER_MISMATCH")
	ErrHandoffStageMismatch      = errors.New("HANDOFF_STAGE_MISMATCH")
)

type HandoffToken struct {
	ID          string
	OrderID     string
	ActorID     string
	Stage       HandoffStage
	TokenHash   string
	Attempts    int
	MaxAttempts int
	ExpiresAt   time.Time
	ConsumedAt  *time.Time
	CreatedAt   time.Time
}

type HandoffTokenRepository interface {
	CreateHandoffToken(ctx context.Context, token *HandoffToken) error
	ConsumeHandoffToken(ctx context.Context, tokenHash, orderID, actorID string, stage HandoffStage, now time.Time) error
}

type HandoffService interface {
	Issue(ctx context.Context, orderID, actorID string, stage HandoffStage, ttl time.Duration) (string, *HandoffToken, error)
	Consume(ctx context.Context, token, orderID, actorID string, stage HandoffStage) error
}
