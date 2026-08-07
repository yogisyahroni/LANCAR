package repository

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"tembus/merchant-service/internal/domain"
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
		INSERT INTO merchants (id, user_id, nama_toko, alamat, lokasi, jam_buka, jam_tutup, verification_status,
			halal_cert_number, halal_expiry_date, spp_irt_number, spp_irt_expiry_date, bpom_number, bpom_expiry_date)
		VALUES ($1, $2, $3, $4, $5::geography, $6, $7, 'pending',
			$8, $9::date, $10, $11::date, $12, $13::date)
		RETURNING created_at, updated_at`,
		m.ID, m.UserID, m.NamaToko, m.Alamat, lokasi, jamBuka, jamTutup,
		halalNo, halalExp, sppNo, sppExp, bpomNo, bpomExp,
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

	return tx.Commit()
}

const merchantColumns = `id, user_id, nama_toko, alamat,
	ST_Y(lokasi::geometry), ST_X(lokasi::geometry),
	to_char(jam_buka, 'HH24:MI'), to_char(jam_tutup, 'HH24:MI'),
	is_open, completion_rate_pct, verification_status,
	halal_cert_number, to_char(halal_expiry_date, 'YYYY-MM-DD'),
	spp_irt_number, to_char(spp_irt_expiry_date, 'YYYY-MM-DD'),
	bpom_number, to_char(bpom_expiry_date, 'YYYY-MM-DD'),
	created_at, updated_at`

func scanMerchant(row interface{ Scan(...any) error }) (*domain.Merchant, error) {
	var m domain.Merchant
	var lat, lng sql.NullFloat64
	var jamBuka, jamTutup sql.NullString
	var halalNo, halalExp, sppNo, sppExp, bpomNo, bpomExp sql.NullString
	err := row.Scan(
		&m.ID, &m.UserID, &m.NamaToko, &m.Alamat,
		&lat, &lng,
		&jamBuka, &jamTutup,
		&m.IsOpen, &m.CompletionRatePct, &m.VerificationStatus,
		&halalNo, &halalExp, &sppNo, &sppExp, &bpomNo, &bpomExp,
		&m.CreatedAt, &m.UpdatedAt,
	)
	if err != nil {
		return nil, err
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
	return &m, nil
}

func (r *postgresMerchantRepository) GetByID(ctx context.Context, id string) (*domain.Merchant, error) {
	row := r.readDB.QueryRowContext(ctx, `SELECT `+merchantColumns+` FROM merchants WHERE id = $1`, id)
	m, err := scanMerchant(row)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return m, err
}

func (r *postgresMerchantRepository) GetByUserID(ctx context.Context, userID string) (*domain.Merchant, error) {
	row := r.readDB.QueryRowContext(ctx, `SELECT `+merchantColumns+` FROM merchants WHERE user_id = $1`, userID)
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
			updated_at = NOW()
		WHERE id = $1`,
		m.ID, m.NamaToko, m.Alamat, lokasi, jamBuka, jamTutup,
	)
	return err
}

func (r *postgresMerchantRepository) UpdateVerification(ctx context.Context, id, status string) error {
	res, err := r.db.ExecContext(ctx, `
		UPDATE merchants
		SET verification_status = $2, updated_at = NOW()
		WHERE id = $1`, id, status)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return sql.ErrNoRows
	}
	return nil
}

func (r *postgresMerchantRepository) ToggleOpen(ctx context.Context, id string, isOpen bool) error {
	_, err := r.db.ExecContext(ctx, `
		UPDATE merchants SET is_open = $2, updated_at = NOW() WHERE id = $1`, id, isOpen)
	return err
}

func (r *postgresMerchantRepository) ListByVerificationStatus(ctx context.Context, status string, limit, offset int) ([]*domain.Merchant, error) {
	rows, err := r.readDB.QueryContext(ctx, `
		SELECT `+merchantColumns+` FROM merchants
		WHERE ($1 = 'all' OR verification_status = $1)
		ORDER BY created_at DESC
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
			updated_at = NOW()
		WHERE id = $1`,
		m.ID, halalNo, halalExp, sppNo, sppExp, bpomNo, bpomExp,
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

// ListOpenWithExpiredFoodDocs — FB-092: merchant yang toko-nya buka tapi
// dokumen pangan sudah kedaluwarsa → kandidat auto-suspend oleh worker.
func (r *postgresMerchantRepository) ListOpenWithExpiredFoodDocs(ctx context.Context) ([]*domain.Merchant, error) {
	rows, err := r.readDB.QueryContext(ctx, `
		SELECT `+merchantColumns+` FROM merchants
		WHERE is_open = true AND (
			(halal_cert_number IS NOT NULL AND halal_expiry_date IS NOT NULL AND halal_expiry_date < CURRENT_DATE)
			OR (spp_irt_number IS NOT NULL AND spp_irt_expiry_date IS NOT NULL AND spp_irt_expiry_date < CURRENT_DATE)
			OR (bpom_number IS NOT NULL AND bpom_expiry_date IS NOT NULL AND bpom_expiry_date < CURRENT_DATE)
		)`)
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
