package service

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"math/big"
	"strings"
	"tembus/order-service/internal/domain"
)

type verifiedPaymentNotice struct {
	PaymentNumber     string
	ProviderReference string
	AmountIDR         int64
	AmountMinor       int64
	Currency          string
	Status            domain.PaymentStatus
	TransactionStatus string
	Payload           []byte
}

// parsePaymentNotice runs only after the gateway's cryptographic verification.
func parsePaymentNotice(payload []byte) (*verifiedPaymentNotice, error) {
	dec := json.NewDecoder(bytes.NewReader(payload))
	dec.UseNumber()
	var data map[string]any
	if err := dec.Decode(&data); err != nil {
		return nil, err
	}
	var trailing any
	if err := dec.Decode(&trailing); err != io.EOF {
		return nil, fmt.Errorf("invalid trailing provider payload")
	}
	str := func(key string) string { v, _ := data[key].(string); return strings.TrimSpace(v) }
	currency := strings.ToUpper(str("currency"))
	if currency == "" {
		currency = "IDR"
	}
	n := &verifiedPaymentNotice{PaymentNumber: str("order_id"), ProviderReference: str("transaction_id"), Currency: currency, TransactionStatus: str("transaction_status"), Payload: payload}
	if n.PaymentNumber == "" || n.ProviderReference == "" {
		return nil, fmt.Errorf("missing payment number or provider transaction")
	}
	var amountString string
	switch v := data["gross_amount"].(type) {
	case string:
		amountString = v
	case json.Number:
		amountString = v.String()
	default:
		return nil, fmt.Errorf("invalid provider amount")
	}
	amount, ok := new(big.Rat).SetString(amountString)
	if !ok || !amount.IsInt() || !amount.Num().IsInt64() || amount.Sign() <= 0 {
		return nil, fmt.Errorf("invalid provider amount")
	}
	n.AmountIDR = amount.Num().Int64()
	n.AmountMinor = n.AmountIDR
	code, fraud := str("status_code"), strings.ToLower(str("fraud_status"))
	switch n.TransactionStatus {
	case "settlement", "capture":
		if code != "200" || (fraud != "" && fraud != "accept") {
			return nil, fmt.Errorf("provider payment is not accepted")
		}
		n.Status = domain.PaymentStatusPaid
	case "deny", "cancel", "expire":
		if code == "200" {
			return nil, fmt.Errorf("inconsistent provider status")
		}
		n.Status = domain.PaymentStatusFailed
		if n.TransactionStatus == "expire" {
			n.Status = domain.PaymentStatusExpired
		}
	case "pending":
		if code != "201" {
			return nil, fmt.Errorf("inconsistent pending payment")
		}
		n.Status = domain.PaymentStatusPending
	default:
		return nil, fmt.Errorf("unsupported provider transaction status %q: reconciliation required", n.TransactionStatus)
	}
	return n, nil
}
