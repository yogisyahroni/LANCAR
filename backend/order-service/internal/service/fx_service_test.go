package service

import (
	"context"
	"testing"
	"time"

	"tembus/order-service/internal/domain"
)

type fxRecordRepositoryStub struct {
	record *domain.FXConversionRecord
}

func (s *fxRecordRepositoryStub) CreateFXConversion(_ context.Context, record *domain.FXConversionRecord) error {
	s.record = record
	return nil
}

func TestFXServiceConvertsAndRecordsLockedRate(t *testing.T) {
	repo := &fxRecordRepositoryStub{}
	svc := NewFXService(repo)
	converted, record, err := svc.ConvertAndRecord(context.Background(), domain.FXConversionRequest{
		ReferenceType:       "payment",
		ReferenceID:         "payment-1",
		Source:              domain.LegacyIDR(250000),
		TargetCurrency:      "USD",
		FXRate:              "0.000061",
		RateSource:          "treasury-rate-v1",
		RateTimestamp:       time.Date(2026, 9, 8, 10, 0, 0, 0, time.UTC),
		LockedRateReference: "lock-payment-1",
	})
	if err != nil {
		t.Fatal(err)
	}
	if converted.Currency != "USD" || repo.record == nil || repo.record.ID != record.ID {
		t.Fatalf("conversion was not recorded: converted=%+v record=%+v stored=%+v", converted, record, repo.record)
	}
}
