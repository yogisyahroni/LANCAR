package domain

import (
	"errors"
	"fmt"
)

type RequoteRequiredError struct {
	Reason       string
	QuoteID      string
	CurrentTotal int64
}

func (e *RequoteRequiredError) Error() string {
	return "REQUOTE_REQUIRED: " + e.Reason
}

type ModelUnavailableError struct {
	Model     string
	MessageID string
	UserMsg   string
}

func (e *ModelUnavailableError) Error() string {
	return fmt.Sprintf("model %s unavailable: %s", e.Model, e.UserMsg)
}

// UserFacingError — error bisnis yang pesannya AMAN & penting ditampilkan
// langsung ke customer (mis. "menu item tidak tersedia", "pilih Level Pedas
// dulu"). UAT-C-012/C-014: tanpa ini, userSafeError menelan pesan asli dan
// menampilkan ERR_INTERNAL generic.
type UserFacingError struct {
	UserMsg string
}

func (e *UserFacingError) Error() string {
	return e.UserMsg
}

func NewUserFacingError(msg string) error {
	return &UserFacingError{UserMsg: msg}
}

var (
	ErrInvalidEstimate      = errors.New("INVALID_ESTIMATE")
	ErrInternal             = errors.New("INTERNAL_SERVER_ERROR")
	ErrNotFound             = errors.New("NOT_FOUND")
	ErrForbidden            = errors.New("FORBIDDEN")
	ErrUnauthorized         = errors.New("UNAUTHORIZED")
	ErrConflict             = errors.New("CONFLICT")
	ErrInvalidCoordinates   = errors.New("INVALID_COORDINATES")
	ErrLocationNotCovered   = errors.New("LOCATION_NOT_COVERED")
	ErrOrderAlreadyAssigned = errors.New("ORDER_ALREADY_ASSIGNED")
	// ErrForbiddenItem — barang terlarang (gas, chemical, weapon, flammable, dll)
	// dicegah saat create order (TC-LOG-005).
	ErrForbiddenItem = errors.New("FORBIDDEN_ITEM")
)
