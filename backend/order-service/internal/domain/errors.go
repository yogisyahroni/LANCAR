package domain

import (
	"errors"
	"fmt"
)

type ModelUnavailableError struct {
	Model     string
	MessageID string
	UserMsg   string
}

func (e *ModelUnavailableError) Error() string {
	return fmt.Sprintf("model %s unavailable: %s", e.Model, e.UserMsg)
}

var (
	ErrInvalidEstimate = errors.New("INVALID_ESTIMATE")
	ErrInternal        = errors.New("INTERNAL_SERVER_ERROR")
	ErrNotFound        = errors.New("NOT_FOUND")
)
