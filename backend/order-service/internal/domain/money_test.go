package domain

import (
	"testing"
	"time"
)

func TestMoneyUsesCurrencyExponentAndDecimalRounding(t *testing.T) {
	usd, err := NewMoney("usd", 105)
	if err != nil {
		t.Fatal(err)
	}
	if usd.Currency != "USD" || usd.MinorUnit != 2 {
		t.Fatalf("unexpected USD metadata: %+v", usd)
	}
	got, err := usd.MultiplyDecimal("0.105")
	if err != nil {
		t.Fatal(err)
	}
	if got.AmountMinor != 11 {
		t.Fatalf("decimal rate was not rounded half up: %+v", got)
	}
	if _, err := NewMoney("ZZZ", 1); err == nil {
		t.Fatal("unknown currency accepted")
	}
}

func TestMoneyRejectsCrossCurrencyArithmeticWithoutFX(t *testing.T) {
	idr := LegacyIDR(1000)
	usd, err := NewMoney("USD", 100)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := idr.Add(usd); err == nil {
		t.Fatal("cross-currency addition accepted")
	}
}

func TestScaleAmountUsesIntegerSafeExactRatio(t *testing.T) {
	got, err := ScaleAmount(9_000_000_000, 3, 2)
	if err != nil {
		t.Fatal(err)
	}
	if got != 13_500_000_000 {
		t.Fatalf("unexpected scaled amount: %d", got)
	}
	got, err = ScaleAmount(5, 1, 2)
	if err != nil {
		t.Fatal(err)
	}
	if got != 3 {
		t.Fatalf("half-up rounding failed: %d", got)
	}
}

func TestMultiplyPercentUsesDecimalSafeRounding(t *testing.T) {
	money := LegacyIDR(101)
	got, err := money.MultiplyPercent(2.5)
	if err != nil {
		t.Fatalf("MultiplyPercent returned error: %v", err)
	}
	if got.AmountMinor != 3 {
		t.Fatalf("expected half-up 3 IDR, got %d", got.AmountMinor)
	}
}

func TestDivideByMarkupPercentUsesDecimalSafeRounding(t *testing.T) {
	money := LegacyIDR(103)
	got, err := money.DivideByMarkupPercent(2.5)
	if err != nil {
		t.Fatalf("DivideByMarkupPercent returned error: %v", err)
	}
	if got.AmountMinor != 100 {
		t.Fatalf("expected 100 IDR before markup, got %d", got.AmountMinor)
	}
}

func TestConvertMoneyRecordsLockedRateContext(t *testing.T) {
	converted, record, err := ConvertMoney(FXConversionRequest{
		ReferenceType:       "order",
		ReferenceID:         "order-1",
		Source:              LegacyIDR(150000),
		TargetCurrency:      "USD",
		FXRate:              "0.000061",
		RateSource:          "treasury-rate-v1",
		RateTimestamp:       time.Date(2026, 9, 8, 10, 0, 0, 0, time.UTC),
		SpreadMinor:         1,
		FeeMinor:            2,
		LockedRateReference: "fx-lock-order-1",
	})
	if err != nil {
		t.Fatal(err)
	}
	if converted.Currency != "USD" || converted.MinorUnit != 2 || converted.AmountMinor != 6 {
		t.Fatalf("unexpected converted money: %+v", converted)
	}
	if record.SourceCurrency != "IDR" || record.TargetCurrency != "USD" || record.FXRate != "0.000061" || record.LockedRateReference == "" {
		t.Fatalf("FX context was not retained: %+v", record)
	}
}
