package domain

import (
	"context"
	"errors"
	"time"
)

var (
	ErrRoadsideSettlementCollectionRequired = errors.New("roadside settlement collection required")
	ErrRoadsideSettlementNotFound           = errors.New("roadside settlement order not found")
	ErrRoadsideSettlementProofRequired      = errors.New("roadside settlement final proof required")
	ErrRoadsideSettlementNotDelivered       = errors.New("roadside settlement requires delivered order")
)

// RoadsideSettlementSource is the immutable/server-authoritative input used
// to calculate Tambal Ban settlement. Financial values come from the stored
// order/quote snapshot; clients never provide amounts for settlement.
type RoadsideSettlementSource struct {
	OrderID           string
	ServiceCode       string
	ServiceSubType    string
	Status            OrderStatus
	AssignedCourierID string
	GrossTotalIDR     int64
	BaseFareIDR       int64
	DistanceFeeIDR    int64
	InsuranceFeeIDR   int64
	FinalReportReady  bool
	FinancialReady    bool
	ReportID          string
	CollectedTotalIDR int64
}

type RoadsideSettlementSourceRepository interface {
	GetRoadsideSettlementSource(ctx context.Context, orderID string) (*RoadsideSettlementSource, error)
}

type RoadsideSettlementService interface {
	Calculate(ctx context.Context, orderID, actorID, actorRole string) (*SettlementResult, error)
}

// RoadsideSettlementFinalizer is the privileged money-moving operation. The
// existing Calculate method remains a read-only preview.
type RoadsideSettlementTaxPolicy interface {
	CalculateWithholding(ctx context.Context, courierID string, netIDR int64) (int64, error)
	CalculateWithholdingFromRate(netIDR int64, ratePct float64) (int64, error)
}

type RoadsideSettlementWriteRepository interface {
	FinalizeRoadsideSettlement(ctx context.Context, orderID, actorID, actorRole string, configRepo SettlementRepository, taxPolicy RoadsideSettlementTaxPolicy) (*RoadsideSettlementRecord, error)
	ListReadyRoadsideOrders(ctx context.Context, limit int) ([]string, error)
}

type RoadsideSettlementFinalizer interface {
	Finalize(ctx context.Context, orderID, actorID, actorRole string) (*RoadsideSettlementRecord, error)
}

type RoadsideSettlementRecord struct {
	ID                 string           `json:"id"`
	OrderID            string           `json:"order_id"`
	CourierID          string           `json:"courier_id"`
	ReportID           string           `json:"report_id"`
	Result             SettlementResult `json:"result"`
	LedgerJournalID    string           `json:"ledger_journal_id"`
	PayoutRecordID     string           `json:"payout_record_id"`
	Status             string           `json:"status"`
	WithholdingIDR     int64            `json:"withholding_idr"`
	DisbursementNetIDR int64            `json:"disbursement_net_idr"`
	CreatedAt          time.Time        `json:"created_at"`
}
