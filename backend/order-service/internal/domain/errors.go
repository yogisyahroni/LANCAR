package domain

import (
	"errors"
	"fmt"
	"net/http"
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

// -------------------------------------------------------------------
// CORE-2026-008 — Typed recoverable errors
// -------------------------------------------------------------------
// Standardized business-error codes. Handlers return a *TypedError (via
// NewTypedError) so the transport layer can emit a canonical ErrorResponse
// carrying the code, a user-facing message, a recoverable flag, and the
// correlation id. Clients use `code` + `recoverable` to render the next
// actionable UI instead of leaking internal error text.

// ErrCode is the canonical string namespace shared by server errors and
// client recovery tables (see ErrorReference.kt / frontend api.ts).
type ErrCode string

const (
	CodeRequoteRequired      ErrCode = "REQUOTE_REQUIRED"
	CodeOutOfServiceArea     ErrCode = "OUT_OF_SERVICE_AREA"
	CodeNoCourier            ErrCode = "NO_COURIER"
	CodeProviderUnavailable  ErrCode = "PROVIDER_UNAVAILABLE"
	CodeItemUnavailable      ErrCode = "ITEM_UNAVAILABLE"
	CodeInvalidTransition    ErrCode = "INVALID_TRANSITION"
	CodePaymentPending       ErrCode = "PAYMENT_PENDING"
	CodeProofRequired        ErrCode = "PROOF_REQUIRED"
	CodeHandoffInvalid       ErrCode = "HANDOFF_INVALID"
	CodeScheduleInvalid      ErrCode = "SCHEDULE_INVALID"
	CodeCapabilityMismatch   ErrCode = "CAPABILITY_MISMATCH"
	CodeCarrierRateExpired   ErrCode = "CARRIER_RATE_EXPIRED"
	CodeCarrierEventUnknown  ErrCode = "CARRIER_EVENT_UNKNOWN"
	CodeValidation           ErrCode = "ERR_VALIDATION"
	CodeInvalidBody          ErrCode = "ERR_INVALID_BODY"
	CodeInvalidJSON          ErrCode = "ERR_INVALID_JSON"
	CodeInternal             ErrCode = "ERR_INTERNAL"
	CodeNotFound             ErrCode = "ERR_NOT_FOUND"
	CodeUnauthorizedErr      ErrCode = "ERR_UNAUTHORIZED"
	CodeInvalidCoordinates   ErrCode = "INVALID_COORDINATES"
	CodeOrderAlreadyAssigned ErrCode = "ORDER_ALREADY_ASSIGNED"
	CodeForbiddenItem        ErrCode = "FORBIDDEN_ITEM"
)

// TypedError is the canonical business error returned across service layers.
type TypedError struct {
	Code        ErrCode
	UserMessage string
	Recoverable bool
	Err         error
}

func (e *TypedError) Error() string {
	if e.Err != nil {
		return string(e.Code) + ": " + e.Err.Error()
	}
	return string(e.Code)
}
func (e *TypedError) Unwrap() error { return e.Err }

func NewTypedError(code ErrCode, msg string, recoverable bool, cause error) *TypedError {
	return &TypedError{Code: code, UserMessage: msg, Recoverable: recoverable, Err: cause}
}

// HTTPStatus maps a TypedError code to its HTTP status (CORE-2026-008).
func (e *TypedError) HTTPStatus() int {
	switch e.Code {
	case CodeUnauthorizedErr:
		return http.StatusUnauthorized
	case CodeNotFound:
		return http.StatusNotFound
	case CodeOutOfServiceArea, CodeInvalidCoordinates, CodeScheduleInvalid,
		CodeItemUnavailable, CodeInvalidTransition, CodeCarrierEventUnknown,
		CodeProofRequired, CodeCarrierRateExpired, CodeHandoffInvalid,
		CodeCapabilityMismatch, CodeValidation, CodeInvalidBody, CodeInvalidJSON:
		return http.StatusBadRequest
	case CodePaymentPending, CodeOrderAlreadyAssigned:
		return http.StatusUnprocessableEntity
	case CodeRequoteRequired, CodeNoCourier, CodeProviderUnavailable:
		return http.StatusConflict
	case CodeForbiddenItem:
		return http.StatusForbidden
	default:
		return http.StatusInternalServerError
	}
}

// sentinel typed errors for the 14 documented CORE-2026-008 codes.
var (
	ErrTypedRequoteRequired     = &TypedError{Code: CodeRequoteRequired, UserMessage: "Estimates have changed — please re-quote.", Recoverable: true}
	ErrTypedOutOfServiceArea    = &TypedError{Code: CodeOutOfServiceArea, UserMessage: "Lokasi di luar zona layanan kami.", Recoverable: false}
	ErrTypedNoCourier           = &TypedError{Code: CodeNoCourier, UserMessage: "Driver tidak tersedia — coba jadwal lain.", Recoverable: true}
	ErrTypedProviderUnavailable = &TypedError{Code: CodeProviderUnavailable, UserMessage: "Provider sementara tidak tersedia.", Recoverable: true}
	ErrTypedItemUnavailable     = &TypedError{Code: CodeItemUnavailable, UserMessage: "Item tidak tersedia.", Recoverable: true}
	ErrTypedInvalidTransition   = &TypedError{Code: CodeInvalidTransition, UserMessage: "Aksi tidak valid pada status ini.", Recoverable: false}
	ErrTypedPaymentPending      = &TypedError{Code: CodePaymentPending, UserMessage: "Pembayaran belum selesai — silakan bayar dulu.", Recoverable: true}
	ErrTypedProofRequired       = &TypedError{Code: CodeProofRequired, UserMessage: "Butuh bukti serah terima ( foto / tanda tangan ).", Recoverable: false}
	ErrTypedHandoffInvalid      = &TypedError{Code: CodeHandoffInvalid, UserMessage: "Serah terima tidak valid — pastikan area & paket cocok.", Recoverable: false}
	ErrTypedScheduleInvalid     = &TypedError{Code: CodeScheduleInvalid, UserMessage: "Jadwal tidak valid — pilih rentang waktu lain.", Recoverable: true}
	ErrTypedCapabilityMismatch  = &TypedError{Code: CodeCapabilityMismatch, UserMessage: "Driver tidak memenuhi kapabilitas yang dibutuhkan.", Recoverable: true}
	ErrTypedCarrierRateExpired  = &TypedError{Code: CodeCarrierRateExpired, UserMessage: "Tarif kupon sudah kadaluwarna — pilih kupon lain.", Recoverable: true}
	ErrTypedCarrierEventUnknown = &TypedError{Code: CodeCarrierEventUnknown, UserMessage: "Aksi tidak dikenali driver.", Recoverable: false}

	ErrTypedNotFound      = &TypedError{Code: CodeNotFound, UserMessage: "Data tidak ditemukan.", Recoverable: false}
	ErrTypedUnauthorized  = &TypedError{Code: CodeUnauthorizedErr, UserMessage: "Sesi berakhir — silakan masuk kembali.", Recoverable: false}
	ErrTypedInternal      = &TypedError{Code: CodeInternal, UserMessage: "Terjadi kesalahan. Tim kami sudah diberi tahu.", Recoverable: true}
	ErrTypedValidationError = &TypedError{Code: CodeValidation, UserMessage: "Masukan tidak valid.", Recoverable: false}
)
