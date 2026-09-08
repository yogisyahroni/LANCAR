package domain

import (
	"fmt"
	"math"
	"math/big"
	"strconv"
	"strings"
)

// Money is the canonical financial representation used by transaction
// boundaries. Amount is always an integer number of the currency's minor
// units; no binary floating point value is stored or used for the result.
type Money struct {
	AmountMinor int64  `json:"amount_minor"`
	Currency    string `json:"currency"`
	MinorUnit   int    `json:"minor_unit"`
}

// ISO4217MinorUnit contains the currencies supported by the platform's
// money contract. The map intentionally includes zero- and three-decimal
// currencies so callers cannot silently assume two decimals.
var ISO4217MinorUnit = map[string]int{
	"AED": 2, "ARS": 2, "AUD": 2, "BDT": 2, "BHD": 3, "BRL": 2,
	"CAD": 2, "CHF": 2, "CLP": 0, "CNY": 2, "COP": 2, "CZK": 2,
	"DKK": 2, "DOP": 2, "EGP": 2, "EUR": 2, "GBP": 2, "HKD": 2,
	"HUF": 2, "IDR": 0, "ILS": 2, "INR": 2, "ISK": 0, "JOD": 3,
	"JPY": 0, "KES": 2, "KRW": 0, "KWD": 3, "KZT": 2, "LKR": 2,
	"MAD": 2, "MMK": 2, "MOP": 2, "MXN": 2, "MYR": 2, "NGN": 2,
	"NOK": 2, "NPR": 2, "NZD": 2, "OMR": 3, "PEN": 2, "PHP": 2,
	"PKR": 2, "PLN": 2, "QAR": 2, "RON": 2, "RSD": 2, "RUB": 2,
	"SAR": 2, "SEK": 2, "SGD": 2, "THB": 2, "TND": 3, "TRY": 2,
	"TWD": 2, "TZS": 2, "UAH": 2, "UGX": 0, "USD": 2, "UYU": 2,
	"VND": 0, "XAF": 0, "XOF": 0, "ZAR": 2, "ZMW": 2,
}

func NormalizeCurrency(code string) (string, int, error) {
	code = strings.ToUpper(strings.TrimSpace(code))
	minorUnit, ok := ISO4217MinorUnit[code]
	if !ok {
		return "", 0, fmt.Errorf("unsupported ISO-4217 currency %q", code)
	}
	return code, minorUnit, nil
}

func NewMoney(currency string, amountMinor int64) (Money, error) {
	code, minorUnit, err := NormalizeCurrency(currency)
	if err != nil {
		return Money{}, err
	}
	return Money{AmountMinor: amountMinor, Currency: code, MinorUnit: minorUnit}, nil
}

func LegacyIDR(amount int64) Money {
	return Money{AmountMinor: amount, Currency: "IDR", MinorUnit: 0}
}

func (m Money) Validate() error {
	code, minorUnit, err := NormalizeCurrency(m.Currency)
	if err != nil {
		return err
	}
	if code != m.Currency || minorUnit != m.MinorUnit {
		return fmt.Errorf("currency metadata mismatch: %s/%d", m.Currency, m.MinorUnit)
	}
	return nil
}

func (m Money) Add(other Money) (Money, error) {
	if err := m.Validate(); err != nil {
		return Money{}, err
	}
	if err := other.Validate(); err != nil {
		return Money{}, err
	}
	if m.Currency != other.Currency {
		return Money{}, fmt.Errorf("cannot add %s to %s without FX conversion", m.Currency, other.Currency)
	}
	if (other.AmountMinor > 0 && m.AmountMinor > int64(^uint64(0)>>1)-other.AmountMinor) ||
		(other.AmountMinor < 0 && m.AmountMinor < -int64(^uint64(0)>>1)-1-other.AmountMinor) {
		return Money{}, fmt.Errorf("money amount overflow")
	}
	m.AmountMinor += other.AmountMinor
	return m, nil
}

func (m Money) Sub(other Money) (Money, error) {
	other.AmountMinor = -other.AmountMinor
	return m.Add(other)
}

// MultiplyDecimal multiplies an amount by a decimal rate and rounds half up.
// The rate is parsed as text, which keeps the arithmetic decimal-safe even
// when a legacy configuration source exposes the value as float64.
func (m Money) MultiplyDecimal(rate string) (Money, error) {
	if err := m.Validate(); err != nil {
		return Money{}, err
	}
	r, ok := new(big.Rat).SetString(strings.TrimSpace(rate))
	if !ok || r.Sign() < 0 {
		return Money{}, fmt.Errorf("invalid non-negative decimal rate %q", rate)
	}
	product := new(big.Rat).Mul(new(big.Rat).SetInt64(m.AmountMinor), r)
	rounded, err := roundHalfUp(product)
	if err != nil {
		return Money{}, err
	}
	m.AmountMinor = rounded
	return m, nil
}

func (m Money) MultiplyFloatRate(rate float64) (Money, error) {
	if math.IsNaN(rate) || math.IsInf(rate, 0) || rate < 0 {
		return Money{}, fmt.Errorf("rate must be non-negative and finite")
	}
	return m.MultiplyDecimal(strconv.FormatFloat(rate, 'f', -1, 64))
}

// MultiplyPercent applies a percentage expressed in human units (for
// example, 2.5 means 2.5%), then rounds half up in minor units. The percent
// is converted to decimal text before the rational calculation so the
// resulting amount never depends on binary floating-point multiplication.
func (m Money) MultiplyPercent(percent float64) (Money, error) {
	if math.IsNaN(percent) || math.IsInf(percent, 0) || percent < 0 {
		return Money{}, fmt.Errorf("percent must be non-negative and finite")
	}
	if err := m.Validate(); err != nil {
		return Money{}, err
	}
	rate := new(big.Rat).SetFrac64(1, 100)
	percentRate, ok := new(big.Rat).SetString(strconv.FormatFloat(percent, 'f', -1, 64))
	if !ok {
		return Money{}, fmt.Errorf("invalid percent %q", strconv.FormatFloat(percent, 'f', -1, 64))
	}
	rate.Mul(rate, percentRate)
	product := new(big.Rat).Mul(new(big.Rat).SetInt64(m.AmountMinor), rate)
	rounded, err := roundHalfUp(product)
	if err != nil {
		return Money{}, err
	}
	m.AmountMinor = rounded
	return m, nil
}

// DivideByMarkupPercent reverses a percentage markup using decimal-safe
// rational arithmetic. It is used when a customer-facing amount must be
// decomposed into a provider net amount without float division.
func (m Money) DivideByMarkupPercent(percent float64) (Money, error) {
	if math.IsNaN(percent) || math.IsInf(percent, 0) || percent < 0 {
		return Money{}, fmt.Errorf("markup percent must be non-negative and finite")
	}
	if err := m.Validate(); err != nil {
		return Money{}, err
	}
	percentRate, ok := new(big.Rat).SetString(strconv.FormatFloat(percent, 'f', -1, 64))
	if !ok {
		return Money{}, fmt.Errorf("invalid markup percent %q", strconv.FormatFloat(percent, 'f', -1, 64))
	}
	denominator := new(big.Rat).Add(big.NewRat(1, 1), new(big.Rat).Quo(percentRate, big.NewRat(100, 1)))
	product := new(big.Rat).Quo(new(big.Rat).SetInt64(m.AmountMinor), denominator)
	rounded, err := roundHalfUp(product)
	if err != nil {
		return Money{}, err
	}
	m.AmountMinor = rounded
	return m, nil
}

// ScaleAmount applies an exact rational ratio and rounds half up. It is used
// for refunds and revenue splits where a policy ratio is represented by
// integer numerator/denominator rather than a floating-point percentage.
func ScaleAmount(amount, numerator, denominator int64) (int64, error) {
	if denominator <= 0 || numerator < 0 {
		return 0, fmt.Errorf("invalid amount ratio")
	}
	numeratorBig := new(big.Int).Mul(big.NewInt(amount), big.NewInt(numerator))
	value := new(big.Rat).SetFrac(numeratorBig, big.NewInt(denominator))
	return roundHalfUpSigned(value)
}

func roundHalfUp(value *big.Rat) (int64, error) {
	if !value.IsInt() {
		// Quotient/remainder on positive values is enough here because all
		// rates passed to this helper are non-negative.
		q := new(big.Int).Quo(value.Num(), value.Denom())
		r := new(big.Int).Mod(value.Num(), value.Denom())
		if new(big.Int).Mul(r, big.NewInt(2)).Cmp(value.Denom()) >= 0 {
			q.Add(q, big.NewInt(1))
		}
		value = new(big.Rat).SetInt(q)
	}
	if !value.Num().IsInt64() {
		return 0, fmt.Errorf("money amount overflow")
	}
	return value.Num().Int64(), nil
}

func roundHalfUpSigned(value *big.Rat) (int64, error) {
	if value.Sign() >= 0 {
		return roundHalfUp(value)
	}
	positive := new(big.Rat).Neg(value)
	result, err := roundHalfUp(positive)
	if err != nil {
		return 0, err
	}
	if result == -int64(^uint64(0)>>1)-1 {
		return result, nil
	}
	return -result, nil
}

func (m Money) IsZero() bool { return m.AmountMinor == 0 }

// ApplyLegacyIDRCompatibility fills canonical minor-unit fields for records
// produced by pre-multi-currency callers. It never converts a non-IDR record
// from an IDR-shaped field.
func (o *Order) ApplyMoneyContract() {
	if o == nil {
		return
	}
	if strings.TrimSpace(o.Currency) == "" {
		o.Currency = "IDR"
	}
	if code, minorUnit, err := NormalizeCurrency(o.Currency); err == nil {
		o.Currency = code
		o.CurrencyMinorUnit = minorUnit
	}
	if o.Currency == "IDR" {
		o.BasePriceMinor = o.BasePriceIDR
		o.DistanceFeeMinor = o.DistanceFeeIDR
		o.VolumetricSurchargeMinor = o.VolumetricSurchargeIDR
		o.DynamicPriceMinor = o.DynamicPriceIDR
		o.DiscountMinor = o.DiscountIDR
		o.PlatformFeeMinor = o.PlatformFeeIDR
		o.PromoSubsidyMinor = o.PromoSubsidyIDR
		o.TotalPriceMinor = o.TotalPriceIDR
		o.DPPMinor = o.DPPIDR
		o.PPNMinor = o.PPNIDR
	}
}

func (q *PricingEstimateResponse) ApplyMoneyContract() {
	if q == nil {
		return
	}
	if strings.TrimSpace(q.Currency) == "" {
		q.Currency = "IDR"
	}
	if code, minorUnit, err := NormalizeCurrency(q.Currency); err == nil {
		q.Currency = code
		q.CurrencyMinorUnit = minorUnit
	}
	if q.Currency == "IDR" {
		q.BasePriceMinor = q.BasePriceIDR
		q.DistanceFeeMinor = q.DistanceFeeIDR
		q.VolumetricSurchargeMinor = q.VolumetricSurchargeIDR
		q.DynamicPriceMinor = q.DynamicPriceIDR
		q.DiscountMinor = q.DiscountIDR
		q.InsuranceFeeMinor = q.InsuranceFeeIDR
		q.PlatformFeeMinor = q.PlatformFeeIDR
		q.PromoSubsidyMinor = q.PromoSubsidyIDR
		q.TotalPriceMinor = q.TotalPriceIDR
		if q.PriceComponentsMinor == nil {
			q.PriceComponentsMinor = make(map[string]int64, len(q.PriceComponents))
		}
		for key, amount := range q.PriceComponents {
			q.PriceComponentsMinor[key] = amount
		}
	}
}

func (p *Payment) ApplyMoneyContract() {
	if p == nil {
		return
	}
	if strings.TrimSpace(p.Currency) == "" {
		p.Currency = "IDR"
	}
	if code, minorUnit, err := NormalizeCurrency(p.Currency); err == nil {
		p.Currency = code
		p.CurrencyMinorUnit = minorUnit
	}
	if p.Currency == "IDR" {
		p.AmountMinor = int64(p.AmountIDR)
		p.MDRAmountMinor = int64(p.MDRAmountIDR)
		p.PPNAmountMinor = int64(p.PPNAmountIDR)
		p.WeatherReserveMinor = int64(p.WeatherReserveIDR)
		p.InsuranceReserveMinor = int64(p.InsuranceReserveIDR)
		p.NetOperationalMinor = int64(p.NetOperationalIDR)
	}
}

func (p *PayoutRecord) ApplyMoneyContract() {
	if p == nil {
		return
	}
	if strings.TrimSpace(p.Currency) == "" {
		p.Currency = "IDR"
	}
	if code, minorUnit, err := NormalizeCurrency(p.Currency); err == nil {
		p.Currency = code
		p.CurrencyMinorUnit = minorUnit
	}
	if p.Currency == "IDR" {
		p.GrossMinor = int64(p.GrossIDR)
		p.PenaltyMinor = int64(p.PenaltyIDR)
		p.IdleCompensationMinor = int64(p.IdleCompensationIDR)
		p.NetMinor = int64(p.NetIDR)
		p.PPh21Minor = int64(p.PPh21IDR)
	}
}

func (r *RefundRecord) ApplyMoneyContract() {
	if r == nil {
		return
	}
	if strings.TrimSpace(r.Currency) == "" {
		r.Currency = "IDR"
	}
	if code, minorUnit, err := NormalizeCurrency(r.Currency); err == nil {
		r.Currency = code
		r.CurrencyMinorUnit = minorUnit
	}
	if r.Currency == "IDR" {
		r.AmountMinor = int64(r.AmountIDR)
		r.TaxReversalMinor = r.TaxReversalIDR
		r.PlatformFeeReversalMinor = r.PlatformFeeReversalIDR
		r.CancellationFeeMinor = r.CancellationFeeIDR
	}
}
