package repository

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"strings"

	"github.com/google/uuid"
	"tembus/order-service/internal/domain"
)

// FinalizeRoadsideSettlement is the single authority for roadside accrual.
// Every read, the immutable settlement, journal and payout reservation commit
// together under the order lock. No gateway call is made inside this transaction.
func (r *roadsideSettlementSourceRepo) FinalizeRoadsideSettlement(ctx context.Context, orderID, actorID, actorRole string, configRepo domain.SettlementRepository, taxPolicy domain.RoadsideSettlementTaxPolicy) (*domain.RoadsideSettlementRecord, error) {
	if _, err := uuid.Parse(orderID); err != nil {
		return nil, domain.ErrRoadsideSettlementNotFound
	}
	if configRepo == nil || taxPolicy == nil {
		return nil, fmt.Errorf("roadside settlement configuration unavailable")
	}
	if strings.TrimSpace(actorID) == "" || (actorRole != "admin" && actorRole != "super_admin" && actorRole != "system") {
		return nil, domain.ErrForbidden
	}
	if actorRole == "system" {
		actorID = uuid.Nil.String()
	} else if _, err := uuid.Parse(actorID); err != nil {
		return nil, domain.ErrForbidden
	}
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	var lockedID string
	if err = tx.QueryRowContext(ctx, `SELECT id::text FROM orders WHERE id=$1 FOR UPDATE`, orderID).Scan(&lockedID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, domain.ErrRoadsideSettlementNotFound
		}
		return nil, err
	}
	// A replay returns the original frozen result, never recalculates current rates.
	old, err := loadRoadsideSettlementRecord(ctx, tx, orderID)
	if err == nil {
		return old, tx.Commit()
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return nil, err
	}
	source, err := loadRoadsideSettlementSource(ctx, tx, orderID)
	if err != nil {
		return nil, err
	}
	if err = domain.ValidateRoadsideSettlementSource(source); err != nil {
		return nil, err
	}
	// Existing legacy accruals or payout reservations need an explicit reversal/
	// reconciliation. Never silently replace them with another payable.
	var legacy bool
	err = tx.QueryRowContext(ctx, `SELECT EXISTS(
  SELECT 1 FROM ledger_journals WHERE reference_type='order' AND reference_id=$1
   AND (journal_type IN ('order_delivered','courier_payout_accrual') OR idempotency_key LIKE 'LEDGER-DELIVERED-%')
  UNION ALL SELECT 1 FROM payout_records WHERE order_id=$2
  UNION ALL SELECT 1 FROM payout_records p JOIN order_legs l ON l.id=p.order_leg_id WHERE l.order_id=$2
  UNION ALL SELECT 1 FROM courier_earnings_ledger WHERE order_id=$2
  UNION ALL SELECT 1 FROM ledger_journals j JOIN payout_records p ON j.reference_type='payout_record' AND j.reference_id=p.id::text WHERE p.order_id=$2
 )`, orderID, source.OrderID).Scan(&legacy)
	if err != nil {
		return nil, err
	}
	if legacy {
		return nil, fmt.Errorf("%w: existing legacy financial records require reconciliation", domain.ErrRoadsideSettlementCollectionRequired)
	}
	code := strings.TrimSpace(source.ServiceCode)
	if code == "" {
		code = source.ServiceSubType
	}
	// Fail closed if a configuration repository cannot participate in this transaction.
	configReader, ok := configRepo.(interface {
		GetSettlementConfigForSettlement(context.Context, *sql.Tx, string) (*domain.SettlementConfig, error)
	})
	if !ok {
		return nil, fmt.Errorf("roadside settlement requires transactional configuration reader")
	}
	config, err := configReader.GetSettlementConfigForSettlement(ctx, tx, code)
	if err != nil {
		return nil, err
	}
	result, err := domain.CalculateRoadsideSettlement(source, config)
	if err != nil {
		return nil, err
	}
	taxSnapshot, err := loadRoadsideWithholdingSnapshot(ctx, tx, source.AssignedCourierID)
	if err != nil {
		return nil, err
	}
	withholding, err := taxPolicy.CalculateWithholdingFromRate(result.EstimatedNetEarnings, taxSnapshot.RatePct)
	if err != nil {
		return nil, err
	}
	net := result.EstimatedNetEarnings
	if withholding < 0 || withholding > net || net > math.MaxInt32 || source.GrossTotalIDR > math.MaxInt32 {
		return nil, fmt.Errorf("%w: payout amount or withholding invalid", domain.ErrInvalidServiceReport)
	}

	// Freeze actual report, quote, financial components and payment references.
	var reportJSON, quoteJSON, paymentsJSON, adjustmentsJSON string
	err = tx.QueryRowContext(ctx, `SELECT to_jsonb(r)::text,COALESCE(o.pricing_snapshot::text,'{}')
  FROM tambal_ban_reports r JOIN orders o ON o.id=r.order_id
  WHERE r.id=$1 AND o.id=$2 FOR SHARE OF r`, source.ReportID, orderID).Scan(&reportJSON, &quoteJSON)
	if err != nil {
		return nil, err
	}
	err = tx.QueryRowContext(ctx, `SELECT COALESCE(jsonb_agg(jsonb_build_object(
  'id',id,'payment_number',payment_number,'purpose',purpose,'amount_idr',amount_idr,
  'provider',provider,'provider_reference',provider_reference,'paid_at',paid_at,
  'provider_verified_at',provider_verified_at,'service_adjustment_id',service_adjustment_id) ORDER BY created_at),'[]'::jsonb)::text
  FROM payments WHERE order_id=$1 AND status IN ('paid','settled') AND provider_verified_at IS NOT NULL`, orderID).Scan(&paymentsJSON)
	if err != nil {
		return nil, err
	}
	err = tx.QueryRowContext(ctx, `SELECT COALESCE(jsonb_agg(to_jsonb(a) ORDER BY created_at),'[]'::jsonb)::text
  FROM service_adjustments a WHERE order_id=$1`, orderID).Scan(&adjustmentsJSON)
	if err != nil {
		return nil, err
	}
	proofHash := sha256.Sum256([]byte(reportJSON))
	sourceJSON, err := json.Marshal(map[string]any{
		"source": source, "config": config, "quote": json.RawMessage(quoteJSON), "report": json.RawMessage(reportJSON),
		"payments": json.RawMessage(paymentsJSON), "adjustments": json.RawMessage(adjustmentsJSON), "withholding_idr": withholding, "withholding_policy": taxSnapshot,
	})
	if err != nil {
		return nil, err
	}
	resultJSON, err := json.Marshal(result)
	if err != nil {
		return nil, err
	}
	journalID := uuid.NewString()
	settlementID := uuid.NewString()
	metadata, _ := json.Marshal(map[string]any{"order_id": orderID, "settlement_id": settlementID, "report_id": source.ReportID, "evidence_hash": hex.EncodeToString(proofHash[:]), "withholding_idr": withholding})
	err = tx.QueryRowContext(ctx, `INSERT INTO ledger_journals
  (id,journal_type,reference_type,reference_id,idempotency_key,reason,metadata,created_by,actor_role)
  VALUES($1,'roadside_settlement','order',$2,$3,'Authoritative roadside settlement after final proof and collection',$4::jsonb,$5,$6)
  RETURNING id::text`, journalID, orderID, "ROADSIDE-SETTLEMENT-"+orderID, string(metadata), actorID, actorRole).Scan(&journalID)
	if err != nil {
		return nil, fmt.Errorf("create roadside accrual journal: %w", err)
	}
	entries := []domain.LedgerEntry{
		{AccountName: "unearned_revenue", DebitIDR: result.GrossTotal},
		{AccountName: "delivery_revenue", CreditIDR: result.GrossTotal},
	}
	if net > 0 {
		entries = append(entries, domain.LedgerEntry{AccountName: "courier_payout_expense", DebitIDR: net})
		if net-withholding > 0 {
			entries = append(entries, domain.LedgerEntry{AccountName: "courier_payable", CreditIDR: net - withholding})
		}
		if withholding > 0 {
			entries = append(entries, domain.LedgerEntry{AccountName: "tax_payable_pph21", CreditIDR: withholding})
		}
	}
	if err = domain.ValidateLedgerEntries(entries); err != nil {
		return nil, err
	}
	for _, entry := range entries {
		if _, err = tx.ExecContext(ctx, `INSERT INTO ledger_entries(journal_id,account_name,debit_idr,credit_idr) VALUES($1,$2,$3,$4)`, journalID, entry.AccountName, entry.DebitIDR, entry.CreditIDR); err != nil {
			return nil, err
		}
	}
	record := &domain.RoadsideSettlementRecord{ID: settlementID, OrderID: orderID, CourierID: source.AssignedCourierID, ReportID: source.ReportID, Result: *result, LedgerJournalID: journalID, Status: "finalized", WithholdingIDR: withholding, DisbursementNetIDR: net - withholding}
	err = tx.QueryRowContext(ctx, `INSERT INTO roadside_settlements
  (id,order_id,courier_id,report_id,source_snapshot,result_snapshot,evidence_hash,gross_idr,courier_net_idr,withholding_idr,ledger_journal_id)
  VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8,$9,$10,$11) RETURNING created_at`,
		settlementID, orderID, source.AssignedCourierID, source.ReportID, string(sourceJSON), string(resultJSON), hex.EncodeToString(proofHash[:]), result.GrossTotal, net, withholding, journalID).Scan(&record.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("freeze roadside settlement: %w", err)
	}
	if net-withholding > 0 {
		var legID string
		err = tx.QueryRowContext(ctx, `SELECT id::text FROM order_legs WHERE order_id=$1 AND leg_number=1 AND courier_id=$2`, orderID, source.AssignedCourierID).Scan(&legID)
		if err != nil {
			return nil, err
		}
		payoutID := uuid.NewString()
		err = tx.QueryRowContext(ctx, `INSERT INTO payout_records
   (id,courier_id,order_id,order_leg_id,type,gross_idr,penalty_idr,idle_compensation_idr,net_idr,pph21_idr,disbursement_status,batch_date)
   VALUES($1,$2,$3,$4,'leg_fee',$5,0,0,$5,$6,'pending',CURRENT_DATE) RETURNING id::text`,
			payoutID, source.AssignedCourierID, orderID, legID, net, withholding).Scan(&payoutID)
		if err != nil {
			return nil, fmt.Errorf("reserve roadside payout: %w", err)
		}
		if _, err = tx.ExecContext(ctx, `UPDATE roadside_settlements SET payout_record_id=$2 WHERE id=$1`, settlementID, payoutID); err != nil {
			return nil, err
		}
		record.PayoutRecordID = payoutID
	}
	audit, _ := json.Marshal(map[string]any{"order_id": orderID, "report_id": source.ReportID, "settlement_id": settlementID, "journal_id": journalID, "payout_record_id": record.PayoutRecordID, "gross_idr": result.GrossTotal, "courier_net_idr": net, "withholding_idr": withholding})
	if _, err = tx.ExecContext(ctx, `INSERT INTO audit_logs(actor_id,action,target_id,payload) VALUES(NULLIF($1,'')::uuid,'roadside_settlement.finalized',$2,$3::jsonb)`, actorID, settlementID, string(audit)); err != nil {
		return nil, err
	}
	if err = tx.Commit(); err != nil {
		return nil, err
	}
	return record, nil
}

func loadRoadsideSettlementRecord(ctx context.Context, q roadsideQueryer, orderID string) (*domain.RoadsideSettlementRecord, error) {
	var r domain.RoadsideSettlementRecord
	var resultJSON string
	var payoutID sql.NullString
	err := q.QueryRowContext(ctx, `SELECT id::text,order_id::text,courier_id::text,report_id::text,result_snapshot::text,
  ledger_journal_id::text,payout_record_id::text,status,withholding_idr,courier_net_idr-withholding_idr,created_at
  FROM roadside_settlements WHERE order_id=$1`, orderID).Scan(&r.ID, &r.OrderID, &r.CourierID, &r.ReportID, &resultJSON, &r.LedgerJournalID, &payoutID, &r.Status, &r.WithholdingIDR, &r.DisbursementNetIDR, &r.CreatedAt)
	if err != nil {
		return nil, err
	}
	if payoutID.Valid {
		r.PayoutRecordID = payoutID.String
	}
	if err = json.Unmarshal([]byte(resultJSON), &r.Result); err != nil {
		return nil, err
	}
	return &r, nil
}

func (r *roadsideSettlementSourceRepo) ListReadyRoadsideOrders(ctx context.Context, limit int) ([]string, error) {
	if limit <= 0 || limit > 100 {
		limit = 100
	}
	rows, err := r.db.QueryContext(ctx, `SELECT o.id::text FROM orders o WHERE
  (o.service_category='tambal_ban' OR o.service_sub_type LIKE 'tambal_ban_%')
  AND o.status IN ('delivered','completed') AND NOT EXISTS(SELECT 1 FROM roadside_settlements s WHERE s.order_id=o.id)
  ORDER BY o.updated_at ASC LIMIT $1`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var ids []string
	for rows.Next() {
		var id string
		if err = rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

// Ensure the interface remains implemented when the source repository evolves.
var _ domain.RoadsideSettlementWriteRepository = (*roadsideSettlementSourceRepo)(nil)
