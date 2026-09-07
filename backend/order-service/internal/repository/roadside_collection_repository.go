package repository

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"strings"
	"time"

	"github.com/google/uuid"
	"tembus/order-service/internal/domain"
)

type roadsideCollectionRepo struct{ db *sql.DB }

func NewRoadsideCollectionRepository(db *sql.DB) domain.RoadsideCollectionRepository {
	return &roadsideCollectionRepo{db: db}
}

// ReserveRoadsideAdjustmentPayment reserves exactly one provider intent for an
// approved adjustment. The order lock serializes approval, collection and accrual.
func (r *roadsideCollectionRepo) ReserveRoadsideAdjustmentPayment(ctx context.Context, adjustmentID, customerID string) (*domain.Payment, bool, error) {
	if _, err := uuid.Parse(adjustmentID); err != nil {
		return nil, false, domain.ErrServiceAdjustmentNotFound
	}
	if _, err := uuid.Parse(customerID); err != nil {
		return nil, false, domain.ErrServiceAdjustmentForbidden
	}
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, false, err
	}
	defer tx.Rollback()
	var orderID, ownerID, category, status string
	err = tx.QueryRowContext(ctx, `SELECT o.id::text,o.customer_id::text,COALESCE(o.service_category,''),o.status
  FROM orders o JOIN service_adjustments a ON a.order_id=o.id WHERE a.id=$1 FOR UPDATE OF o`, adjustmentID).Scan(&orderID, &ownerID, &category, &status)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, false, domain.ErrServiceAdjustmentNotFound
	}
	if err != nil {
		return nil, false, err
	}
	if ownerID != customerID {
		return nil, false, domain.ErrServiceAdjustmentForbidden
	}
	if category != "tambal_ban" {
		return nil, false, domain.ErrServiceAdjustmentConflict
	}
	if status == "cancelled" || status == "failed" || status == "rejected" {
		return nil, false, domain.ErrServiceAdjustmentConflict
	}
	var approved, financial string
	var amount int64
	err = tx.QueryRowContext(ctx, `SELECT status,financial_state,approved_delta_idr FROM service_adjustments WHERE id=$1 FOR UPDATE`, adjustmentID).Scan(&approved, &financial, &amount)
	if err != nil {
		return nil, false, err
	}
	if approved != "approved" || (financial != "pending_collection" && financial != "collected") || amount <= 0 || amount > math.MaxInt32 {
		return nil, false, domain.ErrServiceAdjustmentConflict
	}
	var blocked bool
	err = tx.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM roadside_settlements WHERE order_id=$1)
  OR EXISTS(SELECT 1 FROM refunds WHERE order_id=$1)
  OR EXISTS(SELECT 1 FROM disputes WHERE order_id=$1 AND status NOT IN ('resolved','closed','rejected'))
  OR NOT EXISTS(SELECT 1 FROM payments WHERE order_id=$1 AND purpose='order' AND status IN ('paid','settled') AND paid_at IS NOT NULL AND provider_verified_at IS NOT NULL)`, orderID).Scan(&blocked)
	if err != nil {
		return nil, false, err
	}
	if blocked {
		return nil, false, domain.ErrServiceAdjustmentConflict
	}
	var p domain.Payment
	err = tx.QueryRowContext(ctx, `SELECT `+paymentColumns+` FROM payments WHERE service_adjustment_id=$1 FOR UPDATE`, adjustmentID).Scan(paymentScanArgs(&p)...)
	if err == nil {
		return &p, false, tx.Commit()
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return nil, false, err
	}
	if financial == "collected" {
		return nil, false, domain.ErrServiceAdjustmentConflict
	}
	now := time.Now().UTC()
	p = domain.Payment{
		ID: uuid.NewString(), OrderID: orderID, PaymentNumber: "RADJ" + strings.ReplaceAll(adjustmentID, "-", ""),
		Purpose: "service_adjustment", ServiceAdjustmentID: &adjustmentID, Provider: domain.ProviderMidtrans, Method: "qris",
		Status: domain.PaymentStatusPending, AmountIDR: int(amount), NetOperationalIDR: int(amount), ExpiresAt: now.Add(15 * time.Minute), CreatedAt: now, UpdatedAt: now,
	}
	_, err = tx.ExecContext(ctx, `INSERT INTO payments(id,order_id,payment_number,provider,method,status,purpose,service_adjustment_id,
   amount_idr,mdr_amount_idr,ppn_amount_idr,weather_reserve_idr,insurance_reserve_idr,net_operational_idr,expires_at,created_at,updated_at)
  VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,0,0,0,0,$9,$10,$11,$11)`, p.ID, p.OrderID, p.PaymentNumber, p.Provider, p.Method, p.Status, p.Purpose, adjustmentID, p.AmountIDR, p.ExpiresAt, now)
	if err != nil {
		return nil, false, err
	}
	if err = tx.Commit(); err != nil {
		return nil, false, err
	}
	return &p, true, nil
}

func paymentScanArgs(p *domain.Payment) []any { // exactly paymentColumns order
	return []any{&p.ID, &p.OrderID, &p.PaymentNumber, &p.Provider, &p.Method, &p.Status, &p.Purpose, &p.ServiceAdjustmentID, &p.AmountIDR,
		&p.MDRAmountIDR, &p.PPNAmountIDR, &p.WeatherReserveIDR, &p.InsuranceReserveIDR, &p.NetOperationalIDR, &p.ProviderReference, &p.QRCodeURL, &p.QRCodeString,
		&p.WebhookPayload, &p.ExpiresAt, &p.PaidAt, &p.CreatedAt, &p.UpdatedAt, &p.SnapToken, &p.RedirectURL, &p.ClientKey, &p.SnapJSURL, &p.BatchID,
		&p.ProviderVerifiedAt, &p.TaxRuleCode, &p.PPNRateEffectivePct, &p.PPNRateStatutoryPct, &p.DPPIDR, &p.TaxInvoiceRequired, &p.TaxInvoiceStatus}
}

func (r *roadsideCollectionRepo) SaveRoadsideGatewayResult(ctx context.Context, paymentID string, result domain.PaymentGatewayResponse, mdrIDR, ppnIDR int64) (*domain.Payment, error) {
	if strings.TrimSpace(result.ProviderReference) == "" || strings.TrimSpace(result.QRCodeURL) == "" {
		return nil, fmt.Errorf("provider did not return a valid payment intent")
	}
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	var p domain.Payment
	err = tx.QueryRowContext(ctx, `SELECT `+paymentColumns+` FROM payments WHERE id=$1 FOR UPDATE`, paymentID).Scan(paymentScanArgs(&p)...)
	if err != nil {
		return nil, err
	}
	if p.Purpose != "service_adjustment" || (p.ProviderReference != nil && *p.ProviderReference != result.ProviderReference) {
		return nil, domain.ErrServiceAdjustmentConflict
	}
	if p.Status != domain.PaymentStatusPending {
		if p.Status == domain.PaymentStatusPaid && p.ProviderReference != nil && *p.ProviderReference == result.ProviderReference {
			return &p, tx.Commit()
		}
		return nil, domain.ErrServiceAdjustmentConflict
	}
	if mdrIDR < 0 || ppnIDR < 0 || mdrIDR > int64(p.AmountIDR) || ppnIDR > int64(p.AmountIDR)-mdrIDR {
		return nil, domain.ErrServiceAdjustmentConflict
	}
	_, err = tx.ExecContext(ctx, `UPDATE payments SET provider_reference=$2,qr_code_url=$3,qr_code_string=$4,
  mdr_amount_idr=$5,ppn_amount_idr=$6,net_operational_idr=amount_idr-$5-$6,updated_at=NOW()
  WHERE id=$1 AND purpose='service_adjustment'`, paymentID, result.ProviderReference, result.QRCodeURL, result.QRCodeString, mdrIDR, ppnIDR)
	if err != nil {
		return nil, err
	}
	p.ProviderReference = &result.ProviderReference
	p.QRCodeURL = &result.QRCodeURL
	p.QRCodeString = &result.QRCodeString
	p.MDRAmountIDR = int(mdrIDR)
	p.PPNAmountIDR = int(ppnIDR)
	p.NetOperationalIDR = p.AmountIDR - int(mdrIDR) - int(ppnIDR)
	return &p, tx.Commit()
}

// ApplyRoadsideAdjustmentWebhook is called only after the payment gateway's
// cryptographic signature, amount, transaction ID and fraud status are checked.
func (r *roadsideCollectionRepo) ApplyRoadsideAdjustmentWebhook(ctx context.Context, paymentNumber string, status domain.PaymentStatus, amountIDR int64, providerRef string, payload []byte) error {
	if status != domain.PaymentStatusPaid && status != domain.PaymentStatusFailed && status != domain.PaymentStatusExpired {
		return domain.ErrServiceAdjustmentConflict
	}
	if strings.TrimSpace(providerRef) == "" || !json.Valid(payload) {
		return domain.ErrServiceAdjustmentConflict
	}
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var orderID string
	err = tx.QueryRowContext(ctx, `SELECT o.id::text FROM orders o JOIN payments p ON p.order_id=o.id
  WHERE p.payment_number=$1 AND p.purpose='service_adjustment' FOR UPDATE OF o`, paymentNumber).Scan(&orderID)
	if err != nil {
		return err
	}
	var p domain.Payment
	err = tx.QueryRowContext(ctx, `SELECT `+paymentColumns+` FROM payments WHERE payment_number=$1 FOR UPDATE`, paymentNumber).Scan(paymentScanArgs(&p)...)
	if err != nil {
		return err
	}
	if p.Purpose != "service_adjustment" || p.ServiceAdjustmentID == nil || int64(p.AmountIDR) != amountIDR || (p.ProviderReference != nil && *p.ProviderReference != providerRef) {
		return domain.ErrServiceAdjustmentConflict
	}
	if p.Status == domain.PaymentStatusPaid || p.Status == domain.PaymentStatusSettled {
		if status != domain.PaymentStatusPaid {
			return domain.ErrServiceAdjustmentConflict
		}
		if p.ProviderReference != nil && *p.ProviderReference == providerRef && p.ProviderVerifiedAt != nil {
			return tx.Commit()
		}
		return domain.ErrServiceAdjustmentConflict
	}
	if err = domain.ValidatePaymentTransition(p.Status, status); err != nil {
		return domain.ErrServiceAdjustmentConflict
	}
	var approved, financial, orderStatus string
	var approvedDelta int64
	err = tx.QueryRowContext(ctx, `SELECT a.status,a.financial_state,a.approved_delta_idr,o.status
   FROM service_adjustments a JOIN orders o ON o.id=a.order_id WHERE a.id=$1 FOR UPDATE OF a`, *p.ServiceAdjustmentID).Scan(&approved, &financial, &approvedDelta, &orderStatus)
	if err != nil {
		return err
	}
	if approved != "approved" || approvedDelta != amountIDR || financial != "pending_collection" && financial != "waived" && financial != "reversed" {
		return domain.ErrServiceAdjustmentConflict
	}
	var paidAt any
	if status == domain.PaymentStatusPaid {
		paidAt = time.Now().UTC()
	}
	_, err = tx.ExecContext(ctx, `UPDATE payments SET status=$2,paid_at=$3,provider_reference=$4,webhook_payload=$5::jsonb,
   provider_verified_at=NOW(),updated_at=NOW() WHERE id=$1`, p.ID, status, paidAt, providerRef, string(payload))
	if err != nil {
		return err
	}
	held := orderStatus == "cancelled" || orderStatus == "failed" || orderStatus == "rejected" || financial == "waived" || financial == "reversed"
	if status == domain.PaymentStatusPaid && !held && financial == "pending_collection" {
		_, err = tx.ExecContext(ctx, `UPDATE service_adjustments SET financial_state='collected',updated_at=NOW() WHERE id=$1`, *p.ServiceAdjustmentID)
		if err != nil {
			return err
		}
	}
	if status == domain.PaymentStatusPaid && held {
		if _, err = tx.ExecContext(ctx, `INSERT INTO finance_reconciliation_exceptions
    (exception_key,service_sub_type,provider,reference_type,reference_id,expected_idr,actual_idr,difference_idr,reason,metadata)
    VALUES($1,'tambal_ban','midtrans','payment',$2,$3,$3,0,$4,$5::jsonb) ON CONFLICT(exception_key) DO NOTHING`,
			"roadside-late-payment:"+p.ID, p.ID, amountIDR, "Verified payment received after order/adjustment became ineligible for collection", string(payload)); err != nil {
			return err
		}
	}
	audit, _ := json.Marshal(map[string]any{"order_id": orderID, "adjustment_id": *p.ServiceAdjustmentID, "payment_id": p.ID, "amount_idr": amountIDR, "status": status, "provider_reference": providerRef, "held": held})
	if _, err = tx.ExecContext(ctx, `INSERT INTO audit_logs(actor_id,action,target_id,payload) VALUES($1,'roadside_collection.verified',$2,$3::jsonb)`, uuid.Nil.String(), p.ID, string(audit)); err != nil {
		return err
	}
	return tx.Commit()
}

var _ domain.RoadsideCollectionRepository = (*roadsideCollectionRepo)(nil)
