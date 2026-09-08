package service

import (
	"encoding/json"
	"strings"

	"tembus/order-service/internal/domain"
)

// CancellationDecision is the market/service policy snapshot used by both
// refund calculation and the customer-facing cancellation breakdown.
type CancellationDecision struct {
	PolicyVersion          string
	RefundRatio            float64
	RefundRatioNumerator   int64
	RefundRatioDenominator int64
	WithholdServiceFee     bool
	FeeReason              string
}

const (
	foodCancellationPolicyIDJakarta = "food-cancellation-ID-JK-v1"
	parcelCancellationPolicyGlobal  = "parcel-cancellation-global-v1"
)

func cancellationMarket(pricingSnapshot string) string {
	var snapshot struct {
		Market string `json:"market"`
	}
	if json.Unmarshal([]byte(pricingSnapshot), &snapshot) == nil {
		market := strings.ToUpper(strings.TrimSpace(snapshot.Market))
		if market != "" {
			return market
		}
	}
	return "ID-JK"
}

func cancellationDecision(order *domain.Order, status domain.OrderStatus, courierAssigned bool) CancellationDecision {
	isFood := order != nil && (order.ServiceSubType == "food_delivery" || order.MerchantID != nil)
	if isFood {
		policyVersion := foodCancellationPolicyIDJakarta
		if cancellationMarket(order.PricingSnapshot) != "ID-JK" {
			policyVersion = "food-cancellation-market-default-v1"
		}
		switch status {
		case domain.StatusPendingPayment, domain.StatusPendingMerchant, domain.StatusPreparing,
			domain.StatusReadyForPickup, domain.StatusPending, domain.StatusPendingAssignment,
			domain.StatusNoCourierFound, domain.StatusScheduled:
			return CancellationDecision{PolicyVersion: policyVersion, RefundRatio: 1, RefundRatioNumerator: 1, RefundRatioDenominator: 1, FeeReason: "Belum ada biaya operasional kurir yang timbul."}
		case domain.StatusSearching:
			if courierAssigned {
				return CancellationDecision{PolicyVersion: policyVersion, RefundRatio: 1, RefundRatioNumerator: 1, RefundRatioDenominator: 1, WithholdServiceFee: true, FeeReason: "Kurir sudah ditugaskan sehingga biaya layanan kurir telah timbul."}
			}
			return CancellationDecision{PolicyVersion: policyVersion, RefundRatio: 1, RefundRatioNumerator: 1, RefundRatioDenominator: 1, FeeReason: "Belum ada kurir yang ditugaskan."}
		case domain.StatusAccepted, domain.StatusPickingUp:
			return CancellationDecision{PolicyVersion: policyVersion, RefundRatio: 1, RefundRatioNumerator: 1, RefundRatioDenominator: 1, WithholdServiceFee: true, FeeReason: "Kurir sudah menerima/menjemput pesanan sehingga biaya layanan telah timbul."}
		default:
			return CancellationDecision{PolicyVersion: policyVersion, RefundRatio: 0, RefundRatioNumerator: 0, RefundRatioDenominator: 1, FeeReason: "Pesanan sudah melewati batas pembatalan customer."}
		}
	}

	switch status {
	case domain.StatusPendingPayment, domain.StatusPending, domain.StatusPendingAssignment,
		domain.StatusSearching, domain.StatusNoCourierFound, domain.StatusCancelled:
		return CancellationDecision{PolicyVersion: parcelCancellationPolicyGlobal, RefundRatio: 1, RefundRatioNumerator: 1, RefundRatioDenominator: 1, FeeReason: "Belum ada biaya operasional pengantaran yang timbul."}
	case domain.StatusAccepted, domain.StatusPickingUp:
		return CancellationDecision{PolicyVersion: parcelCancellationPolicyGlobal, RefundRatio: 0.8, RefundRatioNumerator: 4, RefundRatioDenominator: 5, FeeReason: "Sebagian biaya operasional pengantaran telah timbul."}
	default:
		return CancellationDecision{PolicyVersion: parcelCancellationPolicyGlobal, RefundRatio: 0, RefundRatioNumerator: 0, RefundRatioDenominator: 1, FeeReason: "Pesanan sudah melewati batas pembatalan customer."}
	}
}
