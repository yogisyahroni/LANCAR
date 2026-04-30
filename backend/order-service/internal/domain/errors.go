package domain

import "errors"

var (
	ErrModelUnavailable = errors.New("DELIVERY_MODEL_UNAVAILABLE")
	ErrInvalidEstimate  = errors.New("INVALID_ESTIMATE")
	ErrInternal         = errors.New("INTERNAL_SERVER_ERROR")
)
