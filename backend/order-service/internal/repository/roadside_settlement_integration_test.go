package repository

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"github.com/jmoiron/sqlx"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	_ "github.com/lib/pq"
	"tembus/order-service/internal/domain"
)

// These tests require a real PostgreSQL 15 database with all migrations applied.
// CI must supply the DSN; an omitted DSN is an explicit skip, never a fake pass.
func roadsideTestDB(t *testing.T) *sql.DB {
	t.Helper()
	dsn := os.Getenv("TEMBUS_ORDER_SERVICE_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEMBUS_ORDER_SERVICE_TEST_DATABASE_URL is required")
	}
	db, err := sql.Open("postgres", dsn)
	if err != nil {
		t.Fatal(err)
	}
	db.SetMaxOpenConns(12)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err = db.PingContext(ctx); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	return db
}
func roadsideExec(t *testing.T, db *sql.DB, q string, args ...any) {
	t.Helper()
	if _, err := db.Exec(q, args...); err != nil {
		t.Fatal(err)
	}
}
func roadsideExpectReject(t *testing.T, db *sql.DB, q string, args ...any) {
	t.Helper()
	if _, err := db.Exec(q, args...); err == nil {
		t.Fatalf("unsafe SQL accepted: %s", q)
	}
}

type roadsideFixture struct {
	db                                                      *sql.DB
	order, customer, courier, profile, leg, report, payment string
	ctx                                                     context.Context
}

func newRoadsideFixture(t *testing.T) roadsideFixture {
	t.Helper()
	db := roadsideTestDB(t)
	f := roadsideFixture{db: db, order: uuid.NewString(), customer: uuid.NewString(), courier: uuid.NewString(), profile: uuid.NewString(), leg: uuid.NewString(), report: uuid.NewString(), payment: uuid.NewString(), ctx: context.Background()}
	for _, u := range []struct{ id, role string }{{f.customer, "customer"}, {f.courier, "courier"}} {
		roadsideExec(t, db, `INSERT INTO users(id,phone_number,full_name,role) VALUES($1,$2,'Roadside integration fixture',$3)`, u.id, "+628"+strings.ReplaceAll(u.id, "-", "")[:12], u.role)
	}
	roadsideExec(t, db, `INSERT INTO courier_profiles(id,user_id,vehicle_type,vehicle_plate) VALUES($1,$2,'matic',$3)`, f.profile, f.courier, "TST"+f.profile[:8])
	roadsideExec(t, db, `INSERT INTO orders(id,order_number,customer_id,model,status,pickup_location,pickup_address,dropoff_location,dropoff_address,base_price_idr,total_price_idr,ppn_idr,mdr_idr,service_category,service_sub_type,service_code,distance_fee_idr,pricing_snapshot)
 VALUES($1,$2,$3,'p2p','delivering',ST_SetSRID(ST_MakePoint(106.8,-6.2),4326),'test pickup',ST_SetSRID(ST_MakePoint(106.81,-6.21),4326),'test dropoff',50000,120000,0,0,'tambal_ban','tambal_ban_motor','tambal_ban_motor',20000,'{"insurance_fee_idr":5000}'::jsonb)`, f.order, "TIRE-"+f.order[:12], f.customer)
	roadsideExec(t, db, `INSERT INTO order_legs(id,order_id,leg_number,courier_id,status,assigned_fee_idr) VALUES($1,$2,1,$3,'delivering',70000)`, f.leg, f.order, f.courier)
	// Payment begins pending and is verified through the authoritative repository.
	roadsideExec(t, db, `INSERT INTO payments(id,order_id,payment_number,provider,method,status,amount_idr,mdr_amount_idr,ppn_amount_idr,weather_reserve_idr,net_operational_idr,provider_reference,expires_at)
 VALUES($1,$2,$3,'midtrans','qris','pending',120000,1200,1200,0,117600,$4,NOW()+INTERVAL '15 minutes')`, f.payment, f.order, "PAY"+f.payment[:12], "provider-"+f.payment)

	t.Cleanup(func() {
		// Keep immutable accounting fixtures in a rolled-back isolated database only.
		// CI uses a disposable database; no production cleanup bypasses financial guards.
	})
	return f
}
func (f roadsideFixture) reportProof(t *testing.T) {
	t.Helper()
	roadsideExec(t, f.db, `INSERT INTO tambal_ban_reports(id,order_id,courier_id,tire_condition_before,tire_photo_before_url,service_duration_minutes,materials_used,tire_condition_after,tire_photo_after_url,completed_at) VALUES($1,$2,$3,'bocor','s3://test/before',30,'[]','baik','s3://test/after',NOW())`, f.report, f.order, f.profile)
}
func (f roadsideFixture) delivered(t *testing.T) {
	t.Helper()
	roadsideExec(t, f.db, `UPDATE orders SET status='delivered' WHERE id=$1`, f.order)
}

type roadsideTestTax struct{}

func (roadsideTestTax) CalculateWithholding(_ context.Context, _ string, net int64) (int64, error) {
	return domain.RoadsidePercent(net, 3)
}
func (roadsideTestTax) CalculateWithholdingFromRate(net int64, rate float64) (int64, error) {
	return domain.RoadsidePercent(net, rate)
}
func (f roadsideFixture) initialNotice(status domain.PaymentStatus, amount int64) domain.VerifiedPaymentUpdate {
	number := "PAY" + f.payment[:12]
	ref := "provider-" + f.payment
	payload := fmt.Sprintf(`{"order_id":%q,"transaction_id":%q,"status_code":"200","transaction_status":"settlement","gross_amount":"%d.00"}`, number, ref, amount)
	return domain.VerifiedPaymentUpdate{PaymentID: f.payment, PaymentNumber: number, ProviderReference: ref, AmountIDR: amount, Status: status, Payload: []byte(payload)}
}
func (f roadsideFixture) verifyInitial(t *testing.T) {
	t.Helper()
	_, err := NewPostgresPaymentRepo(sqlx.NewDb(f.db, "postgres")).ApplyVerifiedPayment(f.ctx, f.initialNotice(domain.PaymentStatusPaid, 120000))
	if err != nil {
		t.Fatal(err)
	}
}
func (f roadsideFixture) finalize(t *testing.T) (*domain.RoadsideSettlementRecord, error) {
	t.Helper()
	repo := NewRoadsideSettlementSourceRepository(f.db)
	cfg := NewSettlementRepository(f.db)
	tax := roadsideTestTax{}
	return repo.(domain.RoadsideSettlementWriteRepository).FinalizeRoadsideSettlement(f.ctx, f.order, f.customer, "admin", cfg, tax)
}
func TestRoadsideDatabaseProofCollectionAndConcurrentFinalize(t *testing.T) {
	f := newRoadsideFixture(t)
	_, err := f.finalize(t)
	if !errors.Is(err, domain.ErrRoadsideSettlementNotDelivered) {
		t.Fatalf("early finalization: %v", err)
	}
	f.delivered(t)
	_, err = f.finalize(t)
	if !errors.Is(err, domain.ErrRoadsideSettlementProofRequired) {
		t.Fatalf("missing proof: %v", err)
	}
	f.reportProof(t)
	_, err = f.finalize(t)
	if !errors.Is(err, domain.ErrRoadsideSettlementCollectionRequired) {
		t.Fatalf("uncollected: %v", err)
	}
	f.verifyInitial(t)
	// Concurrent clients must receive the same immutable settlement and journal.
	var wg sync.WaitGroup
	results := make([]*domain.RoadsideSettlementRecord, 8)
	errs := make([]error, 8)
	for i := range results {
		wg.Add(1)
		go func(i int) { defer wg.Done(); results[i], errs[i] = f.finalize(t) }(i)
	}
	wg.Wait()
	for i, err := range errs {
		if err != nil {
			t.Fatalf("finalize %d: %v", i, err)
		}
		if results[i].ID != results[0].ID || results[i].LedgerJournalID != results[0].LedgerJournalID {
			t.Fatal("retry created a second financial fact")
		}
	}
	result := results[0]
	if result.PayoutRecordID == "" || result.Result.GrossTotal != 120000 || result.DisbursementNetIDR <= 0 {
		t.Fatalf("incomplete settlement: %+v", result)
	}
	var settlements, journals, payouts int
	if err := f.db.QueryRow(`SELECT count(*) FROM roadside_settlements WHERE order_id=$1`, f.order).Scan(&settlements); err != nil {
		t.Fatal(err)
	}
	if err := f.db.QueryRow(`SELECT count(*) FROM ledger_journals WHERE reference_type='order' AND reference_id=$1`, f.order).Scan(&journals); err != nil {
		t.Fatal(err)
	}
	if err := f.db.QueryRow(`SELECT count(*) FROM payout_records WHERE order_id=$1`, f.order).Scan(&payouts); err != nil {
		t.Fatal(err)
	}
	if settlements != 1 || journals != 1 || payouts != 1 {
		t.Fatalf("duplicate records: settlement=%d journal=%d payout=%d", settlements, journals, payouts)
	}
	var debit, credit int64
	if err := f.db.QueryRow(`SELECT SUM(debit_idr),SUM(credit_idr) FROM ledger_entries WHERE journal_id=$1`, result.LedgerJournalID).Scan(&debit, &credit); err != nil {
		t.Fatal(err)
	}
	if debit != credit || debit != 120000+result.Result.EstimatedNetEarnings {
		t.Fatalf("unbalanced journal debit=%d credit=%d", debit, credit)
	}
	roadsideExpectReject(t, f.db, `UPDATE payout_records SET disbursement_status='completed' WHERE id=$1`, result.PayoutRecordID)
	roadsideExpectReject(t, f.db, `UPDATE payout_records SET gross_idr=gross_idr+1 WHERE id=$1`, result.PayoutRecordID)
	roadsideExpectReject(t, f.db, `DELETE FROM payout_records WHERE id=$1`, result.PayoutRecordID)
	roadsideExpectReject(t, f.db, `UPDATE orders SET total_price_idr=total_price_idr+1 WHERE id=$1`, f.order)
	roadsideExpectReject(t, f.db, `UPDATE payments SET amount_idr=amount_idr+1 WHERE id=$1`, f.payment)
	roadsideExpectReject(t, f.db, `DELETE FROM payments WHERE id=$1`, f.payment)
}

func TestRoadsideDatabaseEvidenceAndPayoutGuards(t *testing.T) {
	f := newRoadsideFixture(t)
	f.reportProof(t)
	f.delivered(t)
	roadsideExpectReject(t, f.db, `UPDATE tambal_ban_reports SET tire_photo_after_url='changed' WHERE id=$1`, f.report)
	roadsideExpectReject(t, f.db, `DELETE FROM tambal_ban_reports WHERE id=$1`, f.report)
	roadsideExpectReject(t, f.db, `UPDATE order_legs SET courier_id=$2 WHERE id=$1`, f.leg, f.customer)
	roadsideExpectReject(t, f.db, `INSERT INTO ledger_journals(journal_type,reference_type,reference_id,idempotency_key) VALUES('order_delivered','order',$1,$2)`, f.order, "LEDGER-DELIVERED-"+f.order)
	roadsideExpectReject(t, f.db, `INSERT INTO payout_records(courier_id,order_id,order_leg_id,type,gross_idr,net_idr) VALUES($1,$2,$3,'leg_fee',96000,96000)`, f.courier, f.order, f.leg)
	// A delivered report is not sufficient for settlement without verified money.
	_, err := f.finalize(t)
	if !errors.Is(err, domain.ErrRoadsideSettlementCollectionRequired) {
		t.Fatalf("unverified money accepted: %v", err)
	}
}

func TestRoadsideDatabaseAdjustmentAndAftercare(t *testing.T) {
	f := newRoadsideFixture(t)
	f.verifyInitial(t)
	adjustment := uuid.NewString()
	roadsideExec(t, f.db, `INSERT INTO service_adjustments(id,order_id,customer_id,requested_by_courier_id,service_category,service_code,service_sub_type,reason,items,initial_quote_id,initial_pricing_snapshot,original_total_idr,delta_idr,proposed_total_idr,proposal_idempotency_key,proposal_request_hash)
 VALUES($1,$2,$3,$4,'tambal_ban','tambal_ban_motor','tambal_ban_motor','Additional tire material','[]','quote-test','{}',120000,20000,140000,$5,$6)`, adjustment, f.order, f.customer, f.courier, "proposal-"+adjustment, strings.Repeat("a", 64))
	roadsideExec(t, f.db, `UPDATE service_adjustments SET status='approved',approved_by_customer_id=$2,approved_at=NOW(),approved_delta_idr=20000,financial_state='pending_collection' WHERE id=$1`, adjustment, f.customer)
	roadsideExec(t, f.db, `UPDATE orders SET total_price_idr=140000 WHERE id=$1`, f.order)
	f.reportProof(t)
	f.delivered(t)
	_, err := f.finalize(t)
	if !errors.Is(err, domain.ErrRoadsideSettlementCollectionRequired) {
		t.Fatalf("uncollected adjustment: %v", err)
	}
	collection := NewRoadsideCollectionRepository(f.db)
	p, created, err := collection.ReserveRoadsideAdjustmentPayment(f.ctx, adjustment, f.customer)
	if err != nil || !created {
		t.Fatalf("reserve: %v created=%v", err, created)
	}
	replay, created, err := collection.ReserveRoadsideAdjustmentPayment(f.ctx, adjustment, f.customer)
	if err != nil || created || replay.ID != p.ID {
		t.Fatalf("reservation replay: %v created=%v", err, created)
	}
	_, err = collection.SaveRoadsideGatewayResult(f.ctx, p.ID, domain.PaymentGatewayResponse{ProviderReference: "provider-" + p.ID, QRCodeURL: "https://example.test/qr", QRCodeString: "qr"}, 200, 20)
	if err != nil {
		t.Fatal(err)
	}
	payload := func(amount int64) []byte {
		return []byte(fmt.Sprintf(`{"order_id":%q,"transaction_id":%q,"status_code":"200","transaction_status":"settlement","gross_amount":"%d.00"}`, p.PaymentNumber, "provider-"+p.ID, amount))
	}
	if err = collection.ApplyRoadsideAdjustmentWebhook(f.ctx, p.PaymentNumber, domain.PaymentStatusPaid, 19999, "provider-"+p.ID, payload(19999)); err == nil {
		t.Fatal("wrong amount accepted")
	}
	_, err = f.finalize(t)
	if !errors.Is(err, domain.ErrRoadsideSettlementCollectionRequired) {
		t.Fatalf("premature adjustment settlement: %v", err)
	}
	if err = collection.ApplyRoadsideAdjustmentWebhook(f.ctx, p.PaymentNumber, domain.PaymentStatusPaid, 20000, "provider-"+p.ID, payload(20000)); err != nil {
		t.Fatal(err)
	}
	if err = collection.ApplyRoadsideAdjustmentWebhook(f.ctx, p.PaymentNumber, domain.PaymentStatusPaid, 20000, "provider-"+p.ID, payload(20000)); err != nil {
		t.Fatalf("verified replay: %v", err)
	}
	if err = collection.ApplyRoadsideAdjustmentWebhook(f.ctx, p.PaymentNumber, domain.PaymentStatusFailed, 20000, "provider-"+p.ID, payload(20000)); err == nil {
		t.Fatal("failed notice downgraded paid adjustment")
	}
	record, err := f.finalize(t)
	if err != nil {
		t.Fatal(err)
	}
	if record.Result.GrossTotal != 140000 {
		t.Fatalf("adjustment ignored: %+v", record.Result)
	}
	roadsideExpectReject(t, f.db, `UPDATE service_adjustments SET approved_delta_idr=21000 WHERE id=$1`, adjustment)
	roadsideExpectReject(t, f.db, `UPDATE payments SET status='failed' WHERE id=$1`, p.ID)
	aftercare := NewRoadsideAftercareRepository(f.db)
	claimReq := &domain.SubmitRoadsideClaimRequest{OrderID: f.order, IssueType: "warranty", Description: "Tire is leaking again after the repair", IdempotencyKey: "claim-" + f.order, RequestFingerprint: strings.Repeat("b", 64)}
	claim, err := aftercare.SubmitClaim(f.ctx, claimReq, f.customer)
	if err != nil {
		t.Fatal(err)
	}
	again, err := aftercare.SubmitClaim(f.ctx, claimReq, f.customer)
	if err != nil || again.ID != claim.ID {
		t.Fatalf("claim replay: %v", err)
	}
	claimReq.RequestFingerprint = strings.Repeat("c", 64)
	if _, err = aftercare.SubmitClaim(f.ctx, claimReq, f.customer); !errors.Is(err, domain.ErrRoadsideAftercareIdempotency) {
		t.Fatalf("mismatched claim replay: %v", err)
	}
	ratingReq := &domain.SubmitRoadsideRatingRequest{OrderID: f.order, OverallRating: 4, TechnicianQualityRating: 5, Comment: "Careful repair", IdempotencyKey: "rating-" + f.order, RequestFingerprint: strings.Repeat("d", 64)}
	rating, err := aftercare.SubmitRating(f.ctx, ratingReq, f.customer)
	if err != nil {
		t.Fatal(err)
	}
	if rating.TechnicianQualityRating != 5 {
		t.Fatal("technician quality was lost")
	}
	roadsideExpectReject(t, f.db, `UPDATE roadside_service_claims SET description='changed' WHERE id=$1`, claim.ID)
	roadsideExpectReject(t, f.db, `UPDATE roadside_service_ratings SET technician_quality_rating=1 WHERE id=$1`, rating.ID)
	roadsideExpectReject(t, f.db, `DELETE FROM roadside_service_claims WHERE id=$1`, claim.ID)
}
