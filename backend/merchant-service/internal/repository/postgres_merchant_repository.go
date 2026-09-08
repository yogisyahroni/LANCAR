package repository

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"tembus/merchant-service/internal/domain"

	"github.com/lib/pq"
)

// postgresMerchantRepository — implementasi domain.MerchantRepository.
// Semua service LANCAR berbagi 1 database (tembus), jadi merchant-service
// bisa akses merchants + orders langsung (pola sama seperti payment-service).
type postgresMerchantRepository struct {
	db     *sql.DB
	readDB *sql.DB
}

func NewPostgresMerchantRepository(db, readDB *sql.DB) domain.MerchantRepository {
	return &postgresMerchantRepository{db: db, readDB: readDB}
}

func (r *postgresMerchantRepository) Create(ctx context.Context, m *domain.Merchant, docs []domain.MerchantDocument) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	var lokasi sql.NullString
	if m.LokasiLat != nil && m.LokasiLng != nil {
		lokasi = sql.NullString{String: fmt.Sprintf("POINT(%v %v)", *m.LokasiLng, *m.LokasiLat), Valid: true}
	}
	var jamBuka, jamTutup sql.NullString
	if m.JamBuka != nil {
		jamBuka = sql.NullString{String: *m.JamBuka, Valid: true}
	}
	if m.JamTutup != nil {
		jamTutup = sql.NullString{String: *m.JamTutup, Valid: true}
	}
	halalNo := nullableStr(m.HalalCertNumber)
	halalExp := nullableDate(m.HalalExpiryDate)
	sppNo := nullableStr(m.SppIrtNumber)
	sppExp := nullableDate(m.SppIrtExpiryDate)
	bpomNo := nullableStr(m.BpomNumber)
	bpomExp := nullableDate(m.BpomExpiryDate)

	err = tx.QueryRowContext(ctx, `
		INSERT INTO merchants (
			id, user_id, nama_toko, alamat, lokasi, jam_buka, jam_tutup,
			verification_status, onboarding_status, market_code, business_type, onboarding_submitted_at,
			halal_cert_number, halal_expiry_date, spp_irt_number, spp_irt_expiry_date, bpom_number, bpom_expiry_date,
			operating_timezone
		)
		VALUES (
			$1, $2, $3, $4, $5::geography, $6, $7,
			'pending', $8::text, $9::text, $10::text, NOW(),
			$11, $12::date, $13, $14::date, $15, $16::date,
			COALESCE(NULLIF($17, ''), 'Asia/Jakarta')
		)
		RETURNING created_at, updated_at`,
		m.ID, m.UserID, m.NamaToko, m.Alamat, lokasi, jamBuka, jamTutup,
		m.OnboardingStatus, m.MarketCode, m.BusinessType,
		halalNo, halalExp, sppNo, sppExp, bpomNo, bpomExp,
		m.OperatingTimezone,
	).Scan(&m.CreatedAt, &m.UpdatedAt)
	if err != nil {
		return fmt.Errorf("insert merchant: %w", err)
	}

	for _, doc := range docs {
		_, err = tx.ExecContext(ctx, `
			INSERT INTO merchant_documents (merchant_id, doc_type, file_url)
			VALUES ($1, $2, $3)`,
			m.ID, doc.DocType, doc.FileURL,
		)
		if err != nil {
			return fmt.Errorf("insert document %s: %w", doc.DocType, err)
		}
	}

	registrationReference := sql.NullString{}
	for _, doc := range docs {
		if doc.DocType == "nib" {
			registrationReference = sql.NullString{String: "merchant_document:nib", Valid: true}
			break
		}
	}
	if _, err = tx.ExecContext(ctx, `
		INSERT INTO merchant_legal_profiles (
			merchant_id, legal_entity_type, legal_name, registration_reference,
			tax_identifier, owner_user_id, operator_user_id, market_code, payout_account_reference
		) VALUES ($1, $2, $3, $4, $5, $6, $6, $7, $8)`,
		m.ID, m.BusinessType, m.NamaToko, registrationReference, m.NPWP, m.UserID,
		m.MarketCode, "merchant_bank_account:"+m.ID,
	); err != nil {
		return fmt.Errorf("insert merchant legal profile: %w", err)
	}

	if _, err = tx.ExecContext(ctx, `
		INSERT INTO merchant_onboarding_reviews (merchant_id, from_status, to_status, actor_id, metadata)
		VALUES ($1, 'DRAFT', 'SUBMITTED', $2, jsonb_build_object('source', 'merchant_registration'))`,
		m.ID, m.UserID,
	); err != nil {
		return fmt.Errorf("insert merchant onboarding submission audit: %w", err)
	}

	return tx.Commit()
}

func (r *postgresMerchantRepository) Resubmit(ctx context.Context, m *domain.Merchant, docs []domain.MerchantDocument) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin onboarding resubmission tx: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	var lokasi sql.NullString
	if m.LokasiLat != nil && m.LokasiLng != nil {
		lokasi = sql.NullString{String: fmt.Sprintf("POINT(%v %v)", *m.LokasiLng, *m.LokasiLat), Valid: true}
	}
	var jamBuka, jamTutup sql.NullString
	if m.JamBuka != nil {
		jamBuka = sql.NullString{String: *m.JamBuka, Valid: true}
	}
	if m.JamTutup != nil {
		jamTutup = sql.NullString{String: *m.JamTutup, Valid: true}
	}
	if _, err = tx.ExecContext(ctx, `
		UPDATE merchants
		   SET nama_toko = $2::text,
		       alamat = $3::text,
		       lokasi = $4::geography,
		       jam_buka = $5::time,
		       jam_tutup = $6::time,
		       market_code = $7::text,
		       business_type = $8::text,
		       updated_at = NOW()
		 WHERE id = $1::uuid AND user_id = $9::uuid`,
		m.ID, m.NamaToko, m.Alamat, lokasi, jamBuka, jamTutup, m.MarketCode, m.BusinessType, m.UserID,
	); err != nil {
		return fmt.Errorf("update merchant onboarding facts: %w", err)
	}

	for _, doc := range docs {
		if _, err = tx.ExecContext(ctx, `DELETE FROM merchant_documents WHERE merchant_id = $1::uuid AND doc_type = $2::text`, m.ID, doc.DocType); err != nil {
			return fmt.Errorf("delete previous onboarding document %s: %w", doc.DocType, err)
		}
		if _, err = tx.ExecContext(ctx, `INSERT INTO merchant_documents (merchant_id, doc_type, file_url) VALUES ($1::uuid, $2::text, $3::text)`, m.ID, doc.DocType, doc.FileURL); err != nil {
			return fmt.Errorf("insert resubmitted onboarding document %s: %w", doc.DocType, err)
		}
	}

	registrationReference := sql.NullString{}
	for _, doc := range docs {
		if doc.DocType == "nib" {
			registrationReference = sql.NullString{String: "merchant_document:nib", Valid: true}
			break
		}
	}
	if _, err = tx.ExecContext(ctx, `
		UPDATE merchant_legal_profiles
		   SET legal_entity_type = $2::text,
		       legal_name = $3::text,
		       registration_reference = $4,
		       tax_identifier = $5,
		       owner_user_id = $6::uuid,
		       operator_user_id = $6::uuid,
		       market_code = $7::text,
		       payout_account_reference = $8::text,
		       updated_at = NOW()
		 WHERE merchant_id = $1::uuid`,
		m.ID, m.BusinessType, m.NamaToko, registrationReference, m.NPWP, m.UserID, m.MarketCode, "merchant_bank_account:"+m.ID,
	); err != nil {
		return fmt.Errorf("update merchant legal profile: %w", err)
	}

	if _, err = tx.ExecContext(ctx, `
		SELECT transition_merchant_onboarding($1::uuid, 'SUBMITTED', $2::uuid, NULL, jsonb_build_object('source', 'merchant_resubmission'))`,
		m.ID, m.UserID,
	); err != nil {
		return fmt.Errorf("transition merchant onboarding to submitted: %w", err)
	}
	return tx.Commit()
}

const merchantColumns = `m.id, m.user_id,
	COALESCE(u.email, ''), COALESCE(u.phone_number, ''),
	m.nama_toko, m.alamat,
	ST_Y(m.lokasi::geometry), ST_X(m.lokasi::geometry),
	to_char(m.jam_buka, 'HH24:MI'), to_char(m.jam_tutup, 'HH24:MI'),
	m.is_open, m.operating_state, m.operating_state_reason, m.operating_state_until, m.operating_state_updated_by,
	m.operating_state_source, m.operating_state_version, m.operating_timezone,
	m.paused_until, m.busy_until, m.busy_extra_prep_minutes, m.min_order_idr, m.completion_rate_pct, m.verification_status,
	m.avg_rating, m.rating_count,
	m.halal_cert_number, to_char(m.halal_expiry_date, 'YYYY-MM-DD'),
	m.spp_irt_number, to_char(m.spp_irt_expiry_date, 'YYYY-MM-DD'),
	m.bpom_number, to_char(m.bpom_expiry_date, 'YYYY-MM-DD'),
	m.halal_status,
	m.bank_name, m.bank_account_number, m.bank_account_holder, m.bank_account_verified,
	m.bank_account_changed_at, m.bank_account_cooldown_until, m.bank_account_version,
	m.business_type,
	m.payout_schedule, m.npwp,
	m.onboarding_status, m.market_code,
	m.created_at, m.updated_at`

func scanMerchant(row interface{ Scan(...any) error }) (*domain.Merchant, error) {
	var m domain.Merchant
	var lat, lng sql.NullFloat64
	var jamBuka, jamTutup sql.NullString
	var pausedUntil sql.NullTime
	var busyUntil sql.NullTime
	var avgRating sql.NullFloat64
	var ratingCount sql.NullInt64
	var halalNo, halalExp, sppNo, sppExp, bpomNo, bpomExp sql.NullString
	var halalStatus sql.NullString
	var bankName, bankAccountNumber, bankAccountHolder sql.NullString
	var bankAccountChangedAt, bankAccountCooldownUntil sql.NullTime
	var bankAccountVersion sql.NullInt64
	var businessType sql.NullString
	var payoutSchedule sql.NullString
	var npwp sql.NullString
	var operatingState, operatingStateReason, operatingStateUpdatedBy, operatingStateSource, operatingTimezone sql.NullString
	var operatingStateUntil sql.NullTime
	var operatingStateVersion sql.NullInt64
	err := row.Scan(
		&m.ID, &m.UserID, &m.OwnerEmail, &m.OwnerPhone, &m.NamaToko, &m.Alamat,
		&lat, &lng,
		&jamBuka, &jamTutup,
		&m.IsOpen, &operatingState, &operatingStateReason, &operatingStateUntil, &operatingStateUpdatedBy,
		&operatingStateSource, &operatingStateVersion, &operatingTimezone,
		&pausedUntil, &busyUntil, &m.BusyExtraPrepMinutes, &m.MinOrderIDR, &m.CompletionRatePct, &m.VerificationStatus,
		&avgRating, &ratingCount,
		&halalNo, &halalExp, &sppNo, &sppExp, &bpomNo, &bpomExp,
		&halalStatus,
		&bankName, &bankAccountNumber, &bankAccountHolder, &m.BankAccountVerified,
		&bankAccountChangedAt, &bankAccountCooldownUntil, &bankAccountVersion,
		&businessType,
		&payoutSchedule, &npwp,
		&m.OnboardingStatus, &m.MarketCode,
		&m.CreatedAt, &m.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	if halalStatus.Valid {
		m.HalalStatus = halalStatus.String
	}
	if pausedUntil.Valid {
		m.PausedUntil = &pausedUntil.Time
	}
	if busyUntil.Valid {
		m.BusyUntil = &busyUntil.Time
	}
	if operatingState.Valid {
		m.OperatingState = operatingState.String
	}
	if operatingStateReason.Valid {
		m.OperatingStateReason = &operatingStateReason.String
	}
	if operatingStateUntil.Valid {
		m.OperatingStateUntil = &operatingStateUntil.Time
	}
	if operatingStateUpdatedBy.Valid {
		m.OperatingStateUpdatedBy = &operatingStateUpdatedBy.String
	}
	if operatingStateSource.Valid {
		m.OperatingStateSource = operatingStateSource.String
	}
	if operatingStateVersion.Valid {
		m.OperatingStateVersion = operatingStateVersion.Int64
	}
	if operatingTimezone.Valid {
		m.OperatingTimezone = operatingTimezone.String
	}
	if avgRating.Valid {
		m.AvgRating = avgRating.Float64
	}
	if ratingCount.Valid {
		m.RatingCount = int(ratingCount.Int64)
	}
	if bankAccountChangedAt.Valid {
		m.BankAccountChangedAt = &bankAccountChangedAt.Time
	}
	if bankAccountCooldownUntil.Valid {
		m.BankAccountCooldownUntil = &bankAccountCooldownUntil.Time
	}
	if bankAccountVersion.Valid {
		m.BankAccountVersion = bankAccountVersion.Int64
	}
	if lat.Valid {
		m.LokasiLat = &lat.Float64
	}
	if lng.Valid {
		m.LokasiLng = &lng.Float64
	}
	if jamBuka.Valid {
		v := jamBuka.String
		m.JamBuka = &v
	}
	if jamTutup.Valid {
		v := jamTutup.String
		m.JamTutup = &v
	}
	if halalNo.Valid {
		v := halalNo.String
		m.HalalCertNumber = &v
	}
	if halalExp.Valid {
		v := halalExp.String
		m.HalalExpiryDate = &v
	}
	if sppNo.Valid {
		v := sppNo.String
		m.SppIrtNumber = &v
	}
	if sppExp.Valid {
		v := sppExp.String
		m.SppIrtExpiryDate = &v
	}
	if bpomNo.Valid {
		v := bpomNo.String
		m.BpomNumber = &v
	}
	if bpomExp.Valid {
		v := bpomExp.String
		m.BpomExpiryDate = &v
	}
	if bankName.Valid {
		v := bankName.String
		m.BankName = &v
	}
	if bankAccountNumber.Valid {
		v := bankAccountNumber.String
		m.BankAccountNumber = &v
	}
	if bankAccountHolder.Valid {
		v := bankAccountHolder.String
		m.BankAccountHolder = &v
	}
	if businessType.Valid {
		m.BusinessType = businessType.String
	}
	if payoutSchedule.Valid {
		m.PayoutSchedule = payoutSchedule.String
	}
	if npwp.Valid {
		value := npwp.String
		m.NPWP = &value
	}
	return &m, nil
}

func (r *postgresMerchantRepository) GetByID(ctx context.Context, id string) (*domain.Merchant, error) {
	row := r.readDB.QueryRowContext(ctx, `SELECT `+merchantColumns+` FROM merchants m JOIN users u ON u.id = m.user_id WHERE m.id = $1`, id)
	m, err := scanMerchant(row)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return m, err
}

func (r *postgresMerchantRepository) GetByUserID(ctx context.Context, userID string) (*domain.Merchant, error) {
	row := r.readDB.QueryRowContext(ctx, `SELECT `+merchantColumns+` FROM merchants m JOIN users u ON u.id = m.user_id WHERE m.user_id = $1`, userID)
	m, err := scanMerchant(row)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return m, err
}

func (r *postgresMerchantRepository) Update(ctx context.Context, m *domain.Merchant) error {
	var lokasi sql.NullString
	if m.LokasiLat != nil && m.LokasiLng != nil {
		lokasi = sql.NullString{String: fmt.Sprintf("POINT(%v %v)", *m.LokasiLng, *m.LokasiLat), Valid: true}
	}
	var jamBuka, jamTutup sql.NullString
	if m.JamBuka != nil {
		jamBuka = sql.NullString{String: *m.JamBuka, Valid: true}
	}
	if m.JamTutup != nil {
		jamTutup = sql.NullString{String: *m.JamTutup, Valid: true}
	}
	_, err := r.db.ExecContext(ctx, `
		UPDATE merchants SET
			nama_toko = COALESCE(NULLIF($2, ''), nama_toko),
			alamat = COALESCE(NULLIF($3, ''), alamat),
			lokasi = CASE WHEN $4::text IS NULL THEN lokasi ELSE $4::geography END,
			jam_buka = CASE WHEN $5::text IS NULL THEN jam_buka ELSE $5::time END,
			jam_tutup = CASE WHEN $6::text IS NULL THEN jam_tutup ELSE $6::time END,
			min_order_idr = $7, -- FB-109 (0 = tanpa minimum)
			payout_schedule = COALESCE(NULLIF($8, ''), payout_schedule),
			npwp = CASE WHEN $9::text IS NULL THEN npwp ELSE NULLIF($9, '') END,
			operating_timezone = COALESCE(NULLIF($10, ''), operating_timezone),
			updated_at = NOW()
		WHERE id = $1`,
		m.ID, m.NamaToko, m.Alamat, lokasi, jamBuka, jamTutup, m.MinOrderIDR, m.PayoutSchedule, m.NPWP, m.OperatingTimezone,
	)
	return err
}

func (r *postgresMerchantRepository) UpdateBankAccount(ctx context.Context, merchantID string, req domain.UpdateBankAccountRequest, changed bool) error {
	// changed=false → data sama persis, jaga bank_account_verified tetap TRUE.
	var verifiedClause string
	if changed {
		verifiedClause = "bank_account_verified = FALSE,"
	} else {
		verifiedClause = ""
	}
	_, err := r.db.ExecContext(ctx, `
		UPDATE merchants SET
			bank_name = $2,
			bank_account_number = $3,
			bank_account_holder = $4,
			`+verifiedClause+`
			updated_at = NOW()
		WHERE id = $1`, merchantID, req.BankName, req.BankAccountNumber, req.BankAccountHolder)
	if err != nil {
		return err
	}
	// Foto buku tabungan baru (opsional) — upsert ke merchant_documents.
	if req.RekeningBankURL != "" {
		if _, err := r.db.ExecContext(ctx, `
			INSERT INTO merchant_documents (merchant_id, doc_type, file_url, created_at)
			VALUES ($1, 'rekening_bank', $2, NOW())
			ON CONFLICT (merchant_id, doc_type)
			DO UPDATE SET file_url = EXCLUDED.file_url, updated_at = NOW()`,
			merchantID, req.RekeningBankURL); err != nil {
			return err
		}
	}
	return nil
}

func (r *postgresMerchantRepository) UpdateVerification(ctx context.Context, id, status string) error {
	return fmt.Errorf("merchant verification status %q must transition through admin onboarding review", status)
}

func (r *postgresMerchantRepository) ToggleOpen(ctx context.Context, id string, isOpen bool) error {
	_, err := r.db.ExecContext(ctx, `
		UPDATE merchants SET
			is_open = $2,
			paused_until = NULL,
			busy_until = NULL,
			busy_extra_prep_minutes = 0,
			operating_state = CASE WHEN $2 THEN 'open' ELSE 'closed' END,
			operating_state_reason = NULL,
			operating_state_until = NULL,
			operating_state_updated_by = NULL,
			operating_state_source = 'merchant',
			operating_state_version = operating_state_version + 1,
			updated_at = NOW()
		WHERE id = $1`, id, isOpen)
	return err
}

// SetPaused (FB-107): pause sementara sampai waktu tertentu (nil = resume).
// ToggleOpen & pause saling independen — merchant bisa tutup permanen + pause,
// atau buka + pause 15 menit. Order-service cek paused_until > NOW() saat
// validasi order, jadi merchant pause otomatis tidak terima order baru.
func (r *postgresMerchantRepository) SetPaused(ctx context.Context, id string, until *time.Time) error {
	_, err := r.db.ExecContext(ctx, `
		UPDATE merchants SET
			paused_until = $2,
			busy_until = NULL,
			busy_extra_prep_minutes = 0,
			operating_state = CASE WHEN $2::timestamptz IS NULL
				THEN CASE WHEN is_open THEN 'open' ELSE 'closed' END
				ELSE 'paused' END,
			operating_state_reason = CASE WHEN $2::timestamptz IS NULL THEN NULL ELSE 'merchant_pause' END,
			operating_state_until = $2,
			operating_state_updated_by = NULL,
			operating_state_source = 'merchant',
			operating_state_version = operating_state_version + 1,
			updated_at = NOW()
		WHERE id = $1`,
		id, until)
	return err
}

// SetBusy stores the temporary busy policy without changing is_open. The
// order-service reads this same row when building the authoritative Food quote.
func (r *postgresMerchantRepository) SetBusy(ctx context.Context, id string, until *time.Time, extraPrepMinutes int) error {
	_, err := r.db.ExecContext(ctx, `
		UPDATE merchants
		SET busy_until = $2,
			busy_extra_prep_minutes = $3,
			paused_until = NULL,
			operating_state = CASE WHEN $2::timestamptz IS NULL
				THEN CASE WHEN is_open THEN 'open' ELSE 'closed' END
				ELSE 'busy' END,
			operating_state_reason = CASE WHEN $2::timestamptz IS NULL THEN NULL ELSE 'merchant_busy' END,
			operating_state_until = $2,
			operating_state_updated_by = NULL,
			operating_state_source = 'merchant',
			operating_state_version = operating_state_version + 1,
			updated_at = NOW()
		WHERE id = $1`, id, until, extraPrepMinutes)
	return err
}

// SetScheduledOperatingState applies the timezone-resolved schedule projection
// without overriding an active pause, busy window, or temporary closure.
func (r *postgresMerchantRepository) SetScheduledOperatingState(ctx context.Context, merchantID, state, reason string) error {
	_, err := r.db.ExecContext(ctx, `
		UPDATE merchants
		SET is_open = ($2 IN ('open', 'busy')),
			operating_state = $2,
			operating_state_reason = NULLIF($3, ''),
			operating_state_until = NULL,
			operating_state_updated_by = NULL,
			operating_state_source = 'schedule',
			operating_state_version = operating_state_version + 1,
			updated_at = NOW()
		WHERE id = $1
		  AND (
			operating_state NOT IN ('paused', 'busy', 'temp_closed')
			OR operating_state_until IS NULL
			OR operating_state_until <= NOW()
		  )
		  AND (operating_state_source <> 'admin_override'
			OR (operating_state_until IS NOT NULL AND operating_state_until <= NOW()))
		  AND (operating_state IS DISTINCT FROM $2 OR operating_state_source IS DISTINCT FROM 'schedule')`,
		merchantID, state, reason)
	return err
}

// SetOperatingStateOverride changes an operating state and its audit record in
// one transaction. It is intentionally separate from owner self-service APIs.
func (r *postgresMerchantRepository) SetOperatingStateOverride(ctx context.Context, merchantID, actorID, actorRole string, req domain.MerchantOperatingStateOverrideRequest) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	var previousState string
	if err := tx.QueryRowContext(ctx, `
		SELECT operating_state FROM merchants WHERE id = $1 FOR UPDATE`, merchantID).Scan(&previousState); err != nil {
		if err == sql.ErrNoRows {
			return fmt.Errorf("merchant tidak ditemukan")
		}
		return err
	}
	isOpen := req.State == domain.OperatingStateOpen || req.State == domain.OperatingStateBusy
	var stateVersion int64
	if err := tx.QueryRowContext(ctx, `
		UPDATE merchants SET
			is_open = $2,
			paused_until = NULL,
			busy_until = NULL,
			busy_extra_prep_minutes = 0,
			operating_state = $3,
			operating_state_reason = $4,
			operating_state_until = $5,
			operating_state_updated_by = $6::uuid,
			operating_state_source = 'admin_override',
			operating_state_version = operating_state_version + 1,
			updated_at = NOW()
		WHERE id = $1
		RETURNING operating_state_version`, merchantID, isOpen, req.State, req.Reason, req.Until, actorID).Scan(&stateVersion); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO merchant_operating_state_events
			(merchant_id, previous_state, state, reason, effective_until, actor_id, actor_role, source, state_version)
		VALUES ($1, $2, $3, $4, $5, $6::uuid, $7, 'admin_override', $8)`,
		merchantID, previousState, req.State, req.Reason, req.Until, actorID, actorRole, stateVersion); err != nil {
		return err
	}
	return tx.Commit()
}

func (r *postgresMerchantRepository) ListByVerificationStatus(ctx context.Context, status string, limit, offset int) ([]*domain.Merchant, error) {
	rows, err := r.readDB.QueryContext(ctx, `
		SELECT `+merchantColumns+` FROM merchants m JOIN users u ON u.id = m.user_id
		WHERE ($1 = 'all' OR m.verification_status = $1)
		ORDER BY m.created_at DESC
		LIMIT $2 OFFSET $3`, status, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []*domain.Merchant{}
	for rows.Next() {
		m, err := scanMerchant(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

func (r *postgresMerchantRepository) CountByVerificationStatus(ctx context.Context, status string) (int, error) {
	var n int
	err := r.readDB.QueryRowContext(ctx, `
		SELECT COUNT(*) FROM merchants
		WHERE ($1 = 'all' OR verification_status = $1)`, status).Scan(&n)
	return n, err
}

func (r *postgresMerchantRepository) ListDocuments(ctx context.Context, merchantID string) ([]domain.MerchantDocument, error) {
	rows, err := r.readDB.QueryContext(ctx, `
		SELECT id, merchant_id, doc_type, file_url, uploaded_at
		FROM merchant_documents WHERE merchant_id = $1 ORDER BY uploaded_at DESC`, merchantID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []domain.MerchantDocument{}
	for rows.Next() {
		var d domain.MerchantDocument
		if err := rows.Scan(&d.ID, &d.MerchantID, &d.DocType, &d.FileURL, &d.UploadedAt); err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

// nullableStr helper — string → sql.NullString.
func nullableStr(s *string) sql.NullString {
	if s == nil || *s == "" {
		return sql.NullString{}
	}
	return sql.NullString{String: *s, Valid: true}
}

// nullableDate helper — "YYYY-MM-DD" → sql.NullString (di-cast ::date di query).
func nullableDate(s *string) sql.NullString {
	if s == nil || *s == "" {
		return sql.NullString{}
	}
	return sql.NullString{String: *s, Valid: true}
}

// UpdateFoodDocs — FB-092: update nomor + masa berlaku dokumen pangan
// di merchants + upsert bukti dokumen (sertifikat_halal/spp_irt/izin_edar_bpom)
// dalam SATU transaksi (replace per doc_type, pola Create).
func (r *postgresMerchantRepository) UpdateFoodDocs(ctx context.Context, m *domain.Merchant, docs []domain.MerchantDocument) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	halalNo := nullableStr(m.HalalCertNumber)
	halalExp := nullableDate(m.HalalExpiryDate)
	sppNo := nullableStr(m.SppIrtNumber)
	sppExp := nullableDate(m.SppIrtExpiryDate)
	bpomNo := nullableStr(m.BpomNumber)
	bpomExp := nullableDate(m.BpomExpiryDate)

	_, err = tx.ExecContext(ctx, `
		UPDATE merchants SET
			halal_cert_number = $2, halal_expiry_date = $3::date,
			spp_irt_number = $4, spp_irt_expiry_date = $5::date,
			bpom_number = $6, bpom_expiry_date = $7::date,
			halal_status = $8,
			updated_at = NOW()
		WHERE id = $1`,
		m.ID, halalNo, halalExp, sppNo, sppExp, bpomNo, bpomExp, m.HalalStatus,
	)
	if err != nil {
		return fmt.Errorf("update food docs: %w", err)
	}

	for _, doc := range docs {
		// replace: hapus doc_type lama, insert baru (menghindari duplikat
		// ketika merchant re-upload dokumen yang sama)
		_, err = tx.ExecContext(ctx,
			`DELETE FROM merchant_documents WHERE merchant_id = $1 AND doc_type = $2`,
			m.ID, doc.DocType,
		)
		if err != nil {
			return fmt.Errorf("delete old document %s: %w", doc.DocType, err)
		}
		_, err = tx.ExecContext(ctx, `
			INSERT INTO merchant_documents (merchant_id, doc_type, file_url)
			VALUES ($1, $2, $3)`,
			m.ID, doc.DocType, doc.FileURL,
		)
		if err != nil {
			return fmt.Errorf("insert document %s: %w", doc.DocType, err)
		}
	}

	return tx.Commit()
}

// ListCertifiedWithExpiredHalal — ADR 003: merchant halal_certified dengan
// sertifikat halal yang sudah kedaluwarsa → kandidat auto-demote ke unknown
// oleh worker (badge hilang, toko TETAP jalan — pola GoFood).
func (r *postgresMerchantRepository) ListCertifiedWithExpiredHalal(ctx context.Context) ([]*domain.Merchant, error) {
	rows, err := r.readDB.QueryContext(ctx, `
		SELECT `+merchantColumns+` FROM merchants m JOIN users u ON u.id = m.user_id
		WHERE m.halal_status = 'halal_certified'
		  AND m.halal_cert_number IS NOT NULL AND m.halal_cert_number <> ''
		  AND m.halal_expiry_date IS NOT NULL AND m.halal_expiry_date < CURRENT_DATE`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []*domain.Merchant{}
	for rows.Next() {
		m, err := scanMerchant(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

// SetHalalStatus — ADR 003: ubah halal_status merchant.
func (r *postgresMerchantRepository) SetHalalStatus(ctx context.Context, id, status string) error {
	_, err := r.db.ExecContext(ctx,
		`UPDATE merchants SET halal_status = $2, updated_at = NOW() WHERE id = $1`,
		id, status)
	return err
}

// ListForOperatingHoursSync — FB-095: merchant approved dengan jadwal legacy
// atau jadwal per-hari → kandidat sinkronisasi canonical operating_state.
func (r *postgresMerchantRepository) ListForOperatingHoursSync(ctx context.Context) ([]*domain.Merchant, error) {
	rows, err := r.readDB.QueryContext(ctx, `
		SELECT `+merchantColumns+` FROM merchants m JOIN users u ON u.id = m.user_id
		WHERE m.verification_status = 'approved'
		  AND (m.jam_buka IS NOT NULL AND m.jam_tutup IS NOT NULL
		       OR EXISTS (SELECT 1 FROM merchant_operating_hours h WHERE h.merchant_id = m.id))`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []*domain.Merchant{}
	for rows.Next() {
		m, err := scanMerchant(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

func (r *postgresMerchantRepository) GetOperatingHours(ctx context.Context, merchantID string) ([]domain.MerchantOperatingHour, error) {
	rows, err := r.readDB.QueryContext(ctx, `
		SELECT merchant_id::text, weekday, is_open,
			TO_CHAR(opens_at, 'HH24:MI'), TO_CHAR(closes_at, 'HH24:MI'),
			last_order_minutes_before_close
		FROM merchant_operating_hours
		WHERE merchant_id = $1
		ORDER BY weekday`, merchantID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanOperatingHours(rows)
}

func (r *postgresMerchantRepository) ReplaceOperatingHours(ctx context.Context, merchantID string, hours []domain.MerchantOperatingHour) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	if _, err = tx.ExecContext(ctx, `DELETE FROM merchant_operating_hours WHERE merchant_id = $1`, merchantID); err != nil {
		return err
	}
	stmt, err := tx.PrepareContext(ctx, `
		INSERT INTO merchant_operating_hours (merchant_id, weekday, is_open, opens_at, closes_at, last_order_minutes_before_close)
		VALUES ($1, $2, $3, $4::time, $5::time, $6)`)
	if err != nil {
		return err
	}
	defer stmt.Close()
	for _, hour := range hours {
		if _, err = stmt.ExecContext(ctx, merchantID, hour.Weekday, hour.IsOpen, hour.OpensAt, hour.ClosesAt, hour.LastOrderMinutesBeforeClose); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func (r *postgresMerchantRepository) ListOperatingHoursForMerchants(ctx context.Context, merchantIDs []string) (map[string][]domain.MerchantOperatingHour, error) {
	result := make(map[string][]domain.MerchantOperatingHour, len(merchantIDs))
	if len(merchantIDs) == 0 {
		return result, nil
	}
	rows, err := r.readDB.QueryContext(ctx, `
		SELECT merchant_id::text, weekday, is_open,
			TO_CHAR(opens_at, 'HH24:MI'), TO_CHAR(closes_at, 'HH24:MI'),
			last_order_minutes_before_close
		FROM merchant_operating_hours
		WHERE merchant_id = ANY($1)
		ORDER BY merchant_id, weekday`, pq.Array(merchantIDs))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	hours, err := scanOperatingHours(rows)
	if err != nil {
		return nil, err
	}
	for _, hour := range hours {
		result[hour.MerchantID] = append(result[hour.MerchantID], hour)
	}
	return result, nil
}

func (r *postgresMerchantRepository) ListSpecialClosuresOn(ctx context.Context, merchantIDs []string, date string) (map[string]bool, error) {
	result := make(map[string]bool, len(merchantIDs))
	if len(merchantIDs) == 0 {
		return result, nil
	}
	rows, err := r.readDB.QueryContext(ctx, `
		SELECT merchant_id::text FROM merchant_special_closures
		WHERE merchant_id = ANY($1) AND closure_date = $2::date`, pq.Array(merchantIDs), date)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var merchantID string
		if err := rows.Scan(&merchantID); err != nil {
			return nil, err
		}
		result[merchantID] = true
	}
	return result, rows.Err()
}

func (r *postgresMerchantRepository) ListSpecialClosures(ctx context.Context, merchantID string) ([]domain.MerchantSpecialClosure, error) {
	rows, err := r.readDB.QueryContext(ctx, `
		SELECT id::text, TO_CHAR(closure_date, 'YYYY-MM-DD'), label
		FROM merchant_special_closures
		WHERE merchant_id = $1
		ORDER BY closure_date`, merchantID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	closures := make([]domain.MerchantSpecialClosure, 0)
	for rows.Next() {
		var closure domain.MerchantSpecialClosure
		if err := rows.Scan(&closure.ID, &closure.ClosureDate, &closure.Label); err != nil {
			return nil, err
		}
		closures = append(closures, closure)
	}
	return closures, rows.Err()
}

func (r *postgresMerchantRepository) CreateSpecialClosure(ctx context.Context, merchantID, date, label string) (*domain.MerchantSpecialClosure, error) {
	var closure domain.MerchantSpecialClosure
	err := r.db.QueryRowContext(ctx, `
		INSERT INTO merchant_special_closures (merchant_id, closure_date, label)
		VALUES ($1, $2::date, $3)
		RETURNING id::text, TO_CHAR(closure_date, 'YYYY-MM-DD'), label`, merchantID, date, label).
		Scan(&closure.ID, &closure.ClosureDate, &closure.Label)
	if err != nil {
		return nil, err
	}
	return &closure, nil
}

func (r *postgresMerchantRepository) DeleteSpecialClosure(ctx context.Context, merchantID, closureID string) error {
	result, err := r.db.ExecContext(ctx, `DELETE FROM merchant_special_closures WHERE id = $1 AND merchant_id = $2`, closureID, merchantID)
	if err != nil {
		return err
	}
	count, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if count == 0 {
		return sql.ErrNoRows
	}
	return nil
}

func scanOperatingHours(rows *sql.Rows) ([]domain.MerchantOperatingHour, error) {
	hours := make([]domain.MerchantOperatingHour, 0)
	for rows.Next() {
		var hour domain.MerchantOperatingHour
		var opensAt, closesAt sql.NullString
		if err := rows.Scan(&hour.MerchantID, &hour.Weekday, &hour.IsOpen, &opensAt, &closesAt, &hour.LastOrderMinutesBeforeClose); err != nil {
			return nil, err
		}
		if opensAt.Valid {
			hour.OpensAt = &opensAt.String
		}
		if closesAt.Valid {
			hour.ClosesAt = &closesAt.String
		}
		hours = append(hours, hour)
	}
	return hours, rows.Err()
}
