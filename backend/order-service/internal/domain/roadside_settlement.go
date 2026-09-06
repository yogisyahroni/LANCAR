package domain

import (
	"context"
	"errors"
)

var (
	ErrRoadsideSettlementNotFound      = errors.New("roadside settlement order not found")
	ErrRoadsideSettlementProofRequired = errors.New("roadside settlement final proof required")
	ErrRoadsideSettlementNotDelivered  = errors.New("roadside settlement requires delivered order")
)

// RoadsideSettlementSource is the immutable/server-authoritative input used
// to calculate Tambal Ban settlement. Financial values come from the stored
// order/quote snapshot; clients never provide amounts for settlement.
type RoadsideSettlementSource struct {
	OrderID            string
	ServiceCode        string
	ServiceSubType     string
	Status             OrderStatus
	AssignedCourierID  string
	GrossTotalIDR      int64
	BaseFareIDR        int64
	DistanceFeeIDR     int64
	InsuranceFeeIDR    int64
	FinalReportReady   bool
}

type RoadsideSettlementSourceRepository interface {
	GetRoadsideSettlementSource(ctx context.Context, orderID string) (*RoadsideSettlementSource, error)
}

type RoadsideSettlementService interface {
	Calculate(ctx context.Context, orderID, actorID, actorRole string) (*SettlementResult, error)
}
