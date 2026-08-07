package service

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"

	"tembus/order-service/internal/domain"
)

// ErrVoucherInvalid — voucher tidak valid untuk konteks ini (pesan user-facing).
var ErrVoucherInvalid = errors.New("voucher tidak valid")

// VoucherService — FB-078: validasi & apply voucher di checkout.
// Zero-trust: harga dihitung server-side, client hanya kirim kode.
// (interface domain.VoucherService di domain/voucher.go)
type voucherServiceImpl struct {
	repo domain.VoucherRepository
}

func NewVoucherService(repo domain.VoucherRepository) domain.VoucherService {
	return &voucherServiceImpl{repo: repo}
}

// freeShippingValue — estimasi nilai free_shipping: Rp8.000 (tarif antar umum).
// Dipakai kalau voucher tipe free_shipping; nilai aktual dihitung saat create
// order dari deliveryFee yang diketahui.
const freeShippingValueIDR = int64(8000)

func (s *voucherServiceImpl) Validate(ctx context.Context, code, userID string, baseIDR int64, model string) (*domain.VoucherValidationResult, error) {
	if code == "" {
		return nil, errors.New("kode voucher kosong")
	}
	voucher, err := s.repo.GetActiveByCode(ctx, code)
	if err != nil {
		return nil, err
	}
	if voucher == nil {
		return &domain.VoucherValidationResult{Valid: false, Code: code, Error: "Kode voucher tidak ditemukan atau sudah nonaktif"}, nil
	}

	res, err := s.validateRules(ctx, voucher, userID, baseIDR, model)
	if err != nil {
		return nil, err
	}
	if !res.Valid {
		return res, nil
	}

	res.VoucherID = voucher.ID
	res.Code = voucher.Code
	res.Name = voucher.Name
	return res, nil
}

func (s *voucherServiceImpl) Apply(ctx context.Context, code, userID, orderID string, baseIDR int64, model string) (*domain.VoucherValidationResult, error) {
	res, err := s.Validate(ctx, code, userID, baseIDR, model)
	if err != nil {
		return nil, err
	}
	if !res.Valid {
		return res, nil
	}

	uid, err := uuid.Parse(userID)
	if err != nil {
		return nil, err
	}
	oid, err := uuid.Parse(orderID)
	if err != nil {
		return nil, err
	}
	err = s.repo.ApplyUsage(ctx, res.VoucherID, oid, uid, res.DiscountIDR)
	if err != nil {
		return nil, err
	}
	return res, nil
}

// RecordUsage — catat pemakaian setelah order sukses dibuat (tanpa validasi ulang).
func (s *voucherServiceImpl) RecordUsage(ctx context.Context, voucherID, orderID, userID uuid.UUID, discountIDR int64) error {
	return s.repo.ApplyUsage(ctx, voucherID, orderID, userID, discountIDR)
}

// validateRules — semua aturan bisnis voucher:
//   - masa berlaku (valid_from..valid_until)
//   - quota (used_count < quota)
//   - single use per user
//   - min_order_idr (base subtotal+delivery sebelum platform fee)
//   - applicable_models (NULL = semua model)
//   - hitung diskon: percentage (dari base, cap max_discount_idr) | fixed | free_shipping
func (s *voucherServiceImpl) validateRules(ctx context.Context, v *domain.Voucher, userID string, baseIDR int64, model string) (*domain.VoucherValidationResult, error) {
	res := &domain.VoucherValidationResult{Code: v.Code, Valid: false}

	now := time.Now()
	if now.Before(v.ValidFrom) {
		res.Error = "Voucher belum aktif"
		return res, nil
	}
	if v.ValidUntil != nil && now.After(*v.ValidUntil) {
		res.Error = "Voucher sudah kedaluwarsa"
		return res, nil
	}
	if v.Quota != nil && v.UsedCount >= *v.Quota {
		res.Error = "Kuota voucher sudah habis"
		return res, nil
	}
	if v.IsSingleUse {
		uid, err := uuid.Parse(userID)
		if err != nil {
			return nil, err
		}
		used, err := s.repo.HasUserUsed(ctx, v.ID, uid)
		if err != nil {
			return nil, err
		}
		if used {
			res.Error = "Voucher sudah pernah dipakai"
			return res, nil
		}
	}
	if baseIDR < int64(v.MinOrderIDR) {
		res.Error = "Minimal belanja belum terpenuhi untuk voucher ini"
		return res, nil
	}
	if len(v.ApplicableModels) > 0 {
		modelOK := false
		for _, m := range v.ApplicableModels {
			if m == model {
				modelOK = true
				break
			}
		}
		if !modelOK {
			res.Error = "Voucher tidak berlaku untuk layanan ini"
			return res, nil
		}
	}

	var discount int64
	switch v.Type {
	case "percentage":
		discount = baseIDR * int64(v.Value) / 100
		if v.MaxDiscountIDR != nil && discount > int64(*v.MaxDiscountIDR) {
			discount = int64(*v.MaxDiscountIDR)
		}
	case "fixed":
		discount = int64(v.Value)
	case "free_shipping":
		discount = freeShippingValueIDR
	default:
		res.Error = "Jenis voucher tidak didukung"
		return res, nil
	}
	if discount > baseIDR {
		discount = baseIDR // tidak boleh melebihi nilai order
	}
	if discount <= 0 {
		res.Error = "Nilai diskon voucher Rp0"
		return res, nil
	}

	res.Valid = true
	res.DiscountIDR = discount
	return res, nil
}
