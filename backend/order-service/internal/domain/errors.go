package domain

import (
	"errors"
	"fmt"
)

type RecoverableErrorDescriptor struct {
	Code      string
	Action    string
	Retryable bool
}

var recoverableErrorDescriptors = map[string]RecoverableErrorDescriptor{
	"REQUOTE_REQUIRED":      {Code: "REQUOTE_REQUIRED", Action: "Tinjau harga terbaru lalu lanjutkan kembali.", Retryable: false},
	"OUT_OF_SERVICE_AREA":   {Code: "OUT_OF_SERVICE_AREA", Action: "Pilih alamat lain yang masih terjangkau layanan.", Retryable: false},
	"NO_COURIER":            {Code: "NO_COURIER", Action: "Coba lagi beberapa saat atau pilih layanan lain.", Retryable: true},
	"PROVIDER_UNAVAILABLE":  {Code: "PROVIDER_UNAVAILABLE", Action: "Pilih provider atau layanan lain.", Retryable: false},
	"ITEM_UNAVAILABLE":      {Code: "ITEM_UNAVAILABLE", Action: "Hapus item yang tidak tersedia atau pilih pengganti.", Retryable: false},
	"INVALID_TRANSITION":    {Code: "INVALID_TRANSITION", Action: "Muat ulang status terbaru sebelum mencoba lagi.", Retryable: true},
	"PAYMENT_PENDING":       {Code: "PAYMENT_PENDING", Action: "Tunggu konfirmasi pembayaran sebelum mengulangi aksi.", Retryable: true},
	"PROOF_REQUIRED":        {Code: "PROOF_REQUIRED", Action: "Lengkapi bukti yang diwajibkan lalu kirim ulang.", Retryable: false},
	"HANDOFF_INVALID":       {Code: "HANDOFF_INVALID", Action: "Minta kode serah-terima baru dan ulangi verifikasi.", Retryable: true},
	"SCHEDULE_INVALID":      {Code: "SCHEDULE_INVALID", Action: "Pilih jadwal yang masih tersedia.", Retryable: false},
	"CAPABILITY_MISMATCH":   {Code: "CAPABILITY_MISMATCH", Action: "Pilih layanan yang sesuai kemampuan akun/perangkat.", Retryable: false},
	"CARRIER_RATE_EXPIRED":  {Code: "CARRIER_RATE_EXPIRED", Action: "Hitung tarif terbaru sebelum melanjutkan.", Retryable: true},
	"CARRIER_EVENT_UNKNOWN": {Code: "CARRIER_EVENT_UNKNOWN", Action: "Muat ulang pelacakan atau hubungi dukungan.", Retryable: true},
}

func RecoverableErrorForCode(code string) (RecoverableErrorDescriptor, bool) {
	descriptor, ok := recoverableErrorDescriptors[code]
	return descriptor, ok
}

type RequoteRequiredError struct {
	Reason       string
	QuoteID      string
	CurrentTotal int64
}

func IsInvalidOrderTransition(err error) bool {
	var transitionErr *InvalidOrderTransitionError
	return errors.As(err, &transitionErr)
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
