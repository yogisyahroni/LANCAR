package repository

import (
	"context"
	"database/sql"
	"fmt"
	"tembus/order-service/internal/domain"
	"time"
)

type paymentLinkRepositoryImpl struct {
	db *sql.DB
}

func NewPaymentLinkRepository(db *sql.DB) domain.PaymentLinkRepository {
	return &paymentLinkRepositoryImpl{db: db}
}

func (r *paymentLinkRepositoryImpl) Create(ctx context.Context, link *domain.PaymentLink) error {
	query := `
		INSERT INTO payment_links (
			id, merchant_id, item_name, item_price, item_image_url, 
			merchant_fee_amount, dropoff_address, dropoff_city, dropoff_zip_code, dropoff_lat, dropoff_lng, 
			status, expired_at, estimate_id, pickup_address, pickup_city, pickup_zip_code, pickup_lat, pickup_lng,
			delivery_fee_amount, service_code, order_id, recipient_phone, recipient_name,
			logistics_provider, logistics_service_type,
			created_at, updated_at
		) VALUES (
			$1, $2, $3, $4, $5, 
			$6, $7, $8, $9, $10, $11, 
			$12, $13, $14, $15, $16, $17, $18, $19,
			$20, $21, $22, $23, $24,
			$25, $26,
			$27, $28
		)
	`
	_, err := r.db.ExecContext(ctx, query,
		link.ID, link.MerchantID, link.ItemName, link.ItemPrice, link.ItemImageURL,
		link.MerchantFeeAmount, link.DropoffAddress, link.DropoffCity, link.DropoffZipCode, link.DropoffLat, link.DropoffLng,
		link.Status, link.ExpiredAt, link.EstimateID, link.PickupAddress, link.PickupCity, link.PickupZipCode, link.PickupLat, link.PickupLng,
		link.DeliveryFeeAmount, link.ServiceCode, link.OrderID, link.RecipientPhone, link.RecipientName,
		link.LogisticsProvider, link.LogisticsServiceType,
		link.CreatedAt, link.UpdatedAt,
	)
	if err != nil {
		return fmt.Errorf("failed to create payment link: %w", err)
	}
	return nil
}

func (r *paymentLinkRepositoryImpl) GetByID(ctx context.Context, id string) (*domain.PaymentLink, error) {
	query := `
		SELECT pl.id, pl.merchant_id, pl.item_name, pl.item_price, pl.item_image_url, 
		       pl.merchant_fee_amount, pl.dropoff_address, COALESCE(pl.dropoff_city, ''), COALESCE(pl.dropoff_zip_code, ''), pl.dropoff_lat, pl.dropoff_lng, 
		       pl.status, pl.expired_at, pl.deleted_at, pl.estimate_id, pl.pickup_address, COALESCE(pl.pickup_city, ''), COALESCE(pl.pickup_zip_code, ''), pl.pickup_lat, pl.pickup_lng,
		       pl.delivery_fee_amount, pl.service_code, pl.order_id,
		       COALESCE(pl.recipient_phone, ''), COALESCE(pl.recipient_name, ''),
		       COALESCE(pl.logistics_provider, ''), COALESCE(pl.logistics_service_type, ''),
		       pl.created_at, pl.updated_at, u.store_name
		FROM payment_links pl
		LEFT JOIN users u ON pl.merchant_id = u.id
		WHERE pl.id = $1
	`
	row := r.db.QueryRowContext(ctx, query, id)
	var link domain.PaymentLink
	var estimateID sql.NullString
	var pickupAddress sql.NullString
	var pickupCity sql.NullString
	var pickupZipCode sql.NullString
	var pickupLat sql.NullFloat64
	var pickupLng sql.NullFloat64
	var deliveryFee sql.NullInt64
	var serviceCode sql.NullString
	var orderID sql.NullString
	var storeName sql.NullString

	err := row.Scan(
		&link.ID, &link.MerchantID, &link.ItemName, &link.ItemPrice, &link.ItemImageURL,
		&link.MerchantFeeAmount, &link.DropoffAddress, &link.DropoffCity, &link.DropoffZipCode, &link.DropoffLat, &link.DropoffLng,
		&link.Status, &link.ExpiredAt, &link.DeletedAt, &estimateID, &pickupAddress, &pickupCity, &pickupZipCode, &pickupLat, &pickupLng,
		&deliveryFee, &serviceCode, &orderID, &link.RecipientPhone, &link.RecipientName,
		&link.LogisticsProvider, &link.LogisticsServiceType,
		&link.CreatedAt, &link.UpdatedAt, &storeName,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to get payment link: %w", err)
	}

	link.EstimateID = estimateID.String
	link.PickupAddress = pickupAddress.String
	link.PickupLat = pickupLat.Float64
	link.PickupLng = pickupLng.Float64
	link.DeliveryFeeAmount = deliveryFee.Int64
	link.ServiceCode = serviceCode.String
	link.OrderID = orderID.String
	link.StoreName = storeName.String
	return &link, nil
}

func (r *paymentLinkRepositoryImpl) UpdateStatus(ctx context.Context, id string, status domain.PaymentLinkStatus) error {
	query := `UPDATE payment_links SET status = $1, updated_at = NOW() WHERE id = $2`
	_, err := r.db.ExecContext(ctx, query, status, id)
	return err
}

// AtomicMarkPaid mengubah status PENDING → PAID secara atomik.
// Menggunakan single UPDATE WHERE status='PENDING' RETURNING id untuk menghindari
// race condition pada concurrent webhook. Jika rows affected = 0, berarti link
// sudah diproses sebelumnya (idempotent safe).
func (r *paymentLinkRepositoryImpl) AtomicMarkPaid(ctx context.Context, id string) (bool, error) {
	query := `
		UPDATE payment_links 
		SET status = $1, updated_at = NOW() 
		WHERE id = $2 AND status = $3
		RETURNING id
	`
	var returnedID string
	err := r.db.QueryRowContext(ctx, query,
		domain.PaymentLinkStatusPaid,
		id,
		domain.PaymentLinkStatusPending,
	).Scan(&returnedID)

	if err == sql.ErrNoRows {
		// Link tidak ditemukan ATAU statusnya bukan PENDING (sudah diproses)
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("atomic_mark_paid: db error: %w", err)
	}

	return true, nil // Berhasil diupdate dari PENDING → PAID
}


func (r *paymentLinkRepositoryImpl) UpdateOrderID(ctx context.Context, id string, orderID string) error {
	query := `UPDATE payment_links SET order_id = $1, updated_at = NOW() WHERE id = $2`
	_, err := r.db.ExecContext(ctx, query, orderID, id)
	return err
}

	func (r *paymentLinkRepositoryImpl) ListByMerchantID(ctx context.Context, merchantID string, limit, offset int) ([]*domain.PaymentLink, error) {
	query := `
		SELECT id, merchant_id, item_name, item_price, item_image_url, 
		       merchant_fee_amount, dropoff_address, COALESCE(dropoff_city, ''), COALESCE(dropoff_zip_code, ''), dropoff_lat, dropoff_lng, 
		       status, expired_at, deleted_at, estimate_id, pickup_address, COALESCE(pickup_city, ''), COALESCE(pickup_zip_code, ''), pickup_lat, pickup_lng,
		       delivery_fee_amount, service_code, order_id,
		       COALESCE(logistics_provider, ''), COALESCE(logistics_service_type, ''),
		       created_at, updated_at
		FROM payment_links
		WHERE merchant_id = $1 AND deleted_at IS NULL
		ORDER BY created_at DESC
		LIMIT $2 OFFSET $3
	`
	rows, err := r.db.QueryContext(ctx, query, merchantID, limit, offset)
	if err != nil {
		return nil, fmt.Errorf("failed to list payment links: %w", err)
	}
	defer rows.Close()

	var links []*domain.PaymentLink
	for rows.Next() {
		var link domain.PaymentLink
		var estimateID sql.NullString
		var pickupAddress sql.NullString
		var pickupCity sql.NullString
		var pickupZipCode sql.NullString
		var pickupLat sql.NullFloat64
		var pickupLng sql.NullFloat64
		var deliveryFee sql.NullInt64
		var serviceCode sql.NullString
		var orderID sql.NullString

		if err := rows.Scan(
			&link.ID, &link.MerchantID, &link.ItemName, &link.ItemPrice, &link.ItemImageURL,
			&link.MerchantFeeAmount, &link.DropoffAddress, &link.DropoffCity, &link.DropoffZipCode, &link.DropoffLat, &link.DropoffLng,
			&link.Status, &link.ExpiredAt, &link.DeletedAt, &estimateID, &pickupAddress, &pickupCity, &pickupZipCode, &pickupLat, &pickupLng,
			&deliveryFee, &serviceCode, &orderID,
			&link.LogisticsProvider, &link.LogisticsServiceType,
			&link.CreatedAt, &link.UpdatedAt,
		); err != nil {
			return nil, err
		}

		if estimateID.Valid {
			link.EstimateID = estimateID.String
		}
		if pickupAddress.Valid {
			link.PickupAddress = pickupAddress.String
		}
		if pickupCity.Valid {
			link.PickupCity = pickupCity.String
		}
		if pickupZipCode.Valid {
			link.PickupZipCode = pickupZipCode.String
		}
		if pickupLat.Valid {
			link.PickupLat = pickupLat.Float64
		}
		if pickupLng.Valid {
			link.PickupLng = pickupLng.Float64
		}
		link.DeliveryFeeAmount = deliveryFee.Int64
		link.ServiceCode = serviceCode.String
		link.OrderID = orderID.String

		links = append(links, &link)
	}
	return links, nil
}

func (r *paymentLinkRepositoryImpl) MarkExpired(ctx context.Context, before time.Time) (int64, error) {
	query := `
		UPDATE payment_links 
		SET status = $1, updated_at = NOW() 
		WHERE status = $2 AND expired_at < $3
	`
	res, err := r.db.ExecContext(ctx, query, domain.PaymentLinkStatusExpired, domain.PaymentLinkStatusPending, before)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

func (r *paymentLinkRepositoryImpl) SoftDeleteExpiredLinks(ctx context.Context, olderThan time.Time) (int64, error) {
	query := `
		UPDATE payment_links 
		SET deleted_at = NOW(), updated_at = NOW() 
		WHERE status = $1 AND deleted_at IS NULL AND expired_at < $2
	`
	res, err := r.db.ExecContext(ctx, query, domain.PaymentLinkStatusExpired, olderThan)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}
