package domain

import "errors"

type ChargebackState string

const (
	ChargebackReceived          ChargebackState = "RECEIVED"
	ChargebackUnderReview       ChargebackState = "UNDER_REVIEW"
	ChargebackEvidenceSubmitted ChargebackState = "EVIDENCE_SUBMITTED"
	ChargebackWon               ChargebackState = "WON"
	ChargebackLost              ChargebackState = "LOST"
	ChargebackClosed            ChargebackState = "CLOSED"
)

var ErrInvalidChargebackTransition = errors.New("invalid chargeback transition")

func CanTransitionChargeback(from, to ChargebackState) bool {
	if from == to {
		return true
	}
	switch from {
	case ChargebackReceived:
		return to == ChargebackUnderReview || to == ChargebackEvidenceSubmitted || to == ChargebackWon || to == ChargebackLost || to == ChargebackClosed
	case ChargebackUnderReview:
		return to == ChargebackEvidenceSubmitted || to == ChargebackWon || to == ChargebackLost || to == ChargebackClosed
	case ChargebackEvidenceSubmitted:
		return to == ChargebackWon || to == ChargebackLost || to == ChargebackClosed
	case ChargebackWon, ChargebackLost:
		return to == ChargebackClosed
	default:
		return false
	}
}

func ValidateChargebackState(state ChargebackState) error {
	switch state {
	case ChargebackReceived, ChargebackUnderReview, ChargebackEvidenceSubmitted,
		ChargebackWon, ChargebackLost, ChargebackClosed:
		return nil
	default:
		return ErrInvalidChargebackTransition
	}
}
