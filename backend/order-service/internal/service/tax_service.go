package service

import (
	"context"
	"crypto/sha256"
	"encoding/csv"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/google/uuid"
	"tembus/order-service/internal/domain"
)

type taxService struct {
	taxRepo    domain.TaxRepository
	configRepo domain.ConfigRepository
}

func NewTaxService(taxRepo domain.TaxRepository, configRepo domain.ConfigRepository) domain.TaxService {
	return &taxService{
		taxRepo:    taxRepo,
		configRepo: configRepo,
	}
}

// CalculateOrderTax calculates the tax based on the rule configuration.
// If isAggregator is true, the DPP is the full amount (resale).
// If isAggregator is false, the DPP is only the service fee / platform fee.
func (s *taxService) CalculateOrderTax(ctx context.Context, totalGMVIDR int64, platformFeeIDR int64, isAggregator bool) (domain.TaxSnapshot, error) {
	rule, err := s.taxRepo.GetDefaultPPNRule(ctx)
	if err != nil {
		return domain.TaxSnapshot{}, fmt.Errorf("tax rule configuration is missing, cannot calculate tax dynamically: %w", err)
	}

	var dppIDR int64
	switch rule.DPPFormula {
	case "FULL":
		dppIDR = totalGMVIDR
	case "SERVICE_FEE_ONLY":
		dppIDR = platformFeeIDR
	case "COMMISSION_ONLY":
		dppIDR = platformFeeIDR
	default:
		// Default behavior based on the classification ADR
		if isAggregator {
			dppIDR = totalGMVIDR
		} else {
			dppIDR = platformFeeIDR
		}
	}

	return domain.CalculateTaxSnapshot(*rule, domain.LegacyIDR(dppIDR), s.taxJurisdiction(ctx))
}

// CalculatePaymentMDRTax calculates PPN on the Payment Gateway MDR fee.
// The DPP is the MDR amount itself.
func (s *taxService) CalculatePaymentMDRTax(ctx context.Context, mdrAmountIDR int64) (domain.TaxSnapshot, error) {
	rule, err := s.taxRepo.GetDefaultPPNRule(ctx)
	if err != nil {
		return domain.TaxSnapshot{}, fmt.Errorf("tax rule configuration is missing for MDR tax calculation: %w", err)
	}

	return domain.CalculateTaxSnapshot(*rule, domain.LegacyIDR(mdrAmountIDR), s.taxJurisdiction(ctx))
}

func (s *taxService) taxJurisdiction(ctx context.Context) string {
	if s.configRepo == nil {
		return "ID"
	}
	return s.configRepo.GetStringConfig(ctx, "tax_jurisdiction", "ID")
}

func (s *taxService) CalculateOrderTaxMoney(ctx context.Context, total, platformFee domain.Money, isAggregator bool, jurisdiction string) (domain.TaxSnapshot, error) {
	if err := total.Validate(); err != nil {
		return domain.TaxSnapshot{}, err
	}
	if err := platformFee.Validate(); err != nil {
		return domain.TaxSnapshot{}, err
	}
	if total.Currency != platformFee.Currency {
		return domain.TaxSnapshot{}, fmt.Errorf("tax inputs must use one currency")
	}
	rule, err := s.taxRepo.GetDefaultPPNRule(ctx)
	if err != nil {
		return domain.TaxSnapshot{}, fmt.Errorf("tax rule configuration is missing, cannot calculate tax dynamically: %w", err)
	}
	var taxable domain.Money
	switch rule.DPPFormula {
	case "FULL":
		taxable = total
	case "SERVICE_FEE_ONLY", "COMMISSION_ONLY":
		taxable = platformFee
	default:
		if isAggregator {
			taxable = total
		} else {
			taxable = platformFee
		}
	}
	if jurisdiction == "" {
		jurisdiction = s.taxJurisdiction(ctx)
	}
	return domain.CalculateTaxSnapshot(*rule, taxable, jurisdiction)
}

func (s *taxService) CalculatePaymentMDRTaxMoney(ctx context.Context, mdr domain.Money, jurisdiction string) (domain.TaxSnapshot, error) {
	if err := mdr.Validate(); err != nil {
		return domain.TaxSnapshot{}, err
	}
	rule, err := s.taxRepo.GetDefaultPPNRule(ctx)
	if err != nil {
		return domain.TaxSnapshot{}, fmt.Errorf("tax rule configuration is missing for MDR tax calculation: %w", err)
	}
	if jurisdiction == "" {
		jurisdiction = s.taxJurisdiction(ctx)
	}
	return domain.CalculateTaxSnapshot(*rule, mdr, jurisdiction)
}

func (s *taxService) GenerateEFakturExport(ctx context.Context, period string, requestedBy string) (*domain.TaxEFakturExport, error) {
	// Aggregate total DPP and PPN for the given period
	totalDPP, totalPPN, err := s.taxRepo.AggregateTaxByPeriod(ctx, period)
	if err != nil {
		return nil, err
	}

	fallbackNPWP := s.configRepo.GetStringConfig(ctx, "TAX_DEFAULT_NON_NPWP", "000000000000000")
	fallbackProviderAddr := s.configRepo.GetStringConfig(ctx, "TAX_PROVIDER_DEFAULT_ADDRESS", "Alamat Payment Gateway Default")

	// Fetch detailed records
	details, err := s.taxRepo.GetEFakturDetailsByPeriod(ctx, period, fallbackNPWP, fallbackProviderAddr)
	if err != nil {
		return nil, err
	}

	// Create exports directory if not exists
	exportDir := "./exports"
	if err := os.MkdirAll(exportDir, os.ModePerm); err != nil {
		return nil, fmt.Errorf("failed to create exports directory: %w", err)
	}

	// Generate CSV
	filePath := filepath.Join(exportDir, "efaktur_"+period+"_"+uuid.NewString()+".csv")
	file, err := os.Create(filePath)
	if err != nil {
		return nil, fmt.Errorf("failed to create CSV file: %w", err)
	}
	defer file.Close()

	writer := csv.NewWriter(file)
	defer writer.Flush()

	// 1. Write the mandatory eFaktur header for FK (Faktur Keluaran) and OF (Objek Faktur)
	headerFK := []string{
		"FK", "KD_JENIS_TRANSAKSI", "FG_PENGGANTI", "NOMOR_FAKTUR", "MASA_PAJAK", "TAHUN_PAJAK",
		"TANGGAL_FAKTUR", "NPWP", "NAMA", "ALAMAT_LENGKAP", "JUMLAH_DPP", "JUMLAH_PPN", "JUMLAH_PPNBM",
		"ID_KETERANGAN_TAMBAHAN", "FG_UANG_MUKA", "UANG_MUKA_DPP", "UANG_MUKA_PPN", "UANG_MUKA_PPNBM", "REFERENSI",
	}
	headerOF := []string{
		"OF", "KODE_OBJEK", "NAMA", "HARGA_SATUAN", "JUMLAH_BARANG", "HARGA_TOTAL", "DISKON", "DPP", "PPN", "TARIF_PPNBM", "PPNBM",
	}

	if err := writer.Write(headerFK); err != nil {
		return nil, fmt.Errorf("failed to write FK header: %w", err)
	}
	if err := writer.Write(headerOF); err != nil {
		return nil, fmt.Errorf("failed to write OF header: %w", err)
	}

	// Calculate checksum while writing
	hash := sha256.New()
	hash.Write([]byte(fmt.Sprintf("%v\n", headerFK)))
	hash.Write([]byte(fmt.Sprintf("%v\n", headerOF)))

	masaPajak := period[5:7]  // MM
	tahunPajak := period[0:4] // YYYY

	for _, d := range details {
		// Prepare NPWP
		npwp := d.CustomerNPWP
		if npwp == "" {
			npwp = "000000000000000"
		}

		// Prepare FK Row
		rowFK := []string{
			"FK",
			"04", // KD_JENIS_TRANSAKSI: 04 DPP Nilai Lain
			"0",  // FG_PENGGANTI
			"",   // NOMOR_FAKTUR (Placeholder to be assigned by DJP/Admin)
			masaPajak,
			tahunPajak,
			d.TransactionDate.Format("02/01/2006"), // TANGGAL_FAKTUR
			npwp,
			d.CustomerName,
			d.CustomerAddress,
			fmt.Sprintf("%d", d.DPP),
			fmt.Sprintf("%d", d.PPN),
			"0", // JUMLAH_PPNBM
			"",  // ID_KETERANGAN_TAMBAHAN
			"0", // FG_UANG_MUKA
			"0", // UANG_MUKA_DPP
			"0", // UANG_MUKA_PPN
			"0", // UANG_MUKA_PPNBM
			d.ReferenceNumber,
		}

		if err := writer.Write(rowFK); err != nil {
			return nil, fmt.Errorf("failed to write FK row: %w", err)
		}
		hash.Write([]byte(fmt.Sprintf("%v\n", rowFK)))

		// Prepare OF Row
		rowOF := []string{
			"OF",
			"JASA-LOGISTIK", // KODE_OBJEK
			"Layanan Pengiriman / Transaksi " + d.ReferenceNumber, // NAMA
			fmt.Sprintf("%d", d.DPP),                              // HARGA_SATUAN
			"1",                                                   // JUMLAH_BARANG
			fmt.Sprintf("%d", d.DPP),                              // HARGA_TOTAL
			"0",                                                   // DISKON
			fmt.Sprintf("%d", d.DPP),                              // DPP
			fmt.Sprintf("%d", d.PPN),                              // PPN
			"0",                                                   // TARIF_PPNBM
			"0",                                                   // PPNBM
		}

		if err := writer.Write(rowOF); err != nil {
			return nil, fmt.Errorf("failed to write OF row: %w", err)
		}
		hash.Write([]byte(fmt.Sprintf("%v\n", rowOF)))
	}

	writer.Flush()
	if err := writer.Error(); err != nil {
		return nil, fmt.Errorf("error flushing CSV writer: %w", err)
	}

	checksum := hex.EncodeToString(hash.Sum(nil))

	export := &domain.TaxEFakturExport{
		ID:           uuid.NewString(),
		TaxPeriod:    period,
		ExportStatus: "exported",
		TotalDPPIDR:  totalDPP,
		TotalPPNIDR:  totalPPN,
		ExportedBy:   &requestedBy,
		FilePath:     &filePath,
		Checksum:     &checksum,
		CreatedAt:    time.Now(),
		UpdatedAt:    time.Now(),
	}

	if err := s.taxRepo.SaveEFakturExport(ctx, export); err != nil {
		return nil, fmt.Errorf("failed to save export record: %w", err)
	}

	return export, nil
}

func (s *taxService) UpdateEFakturStatus(ctx context.Context, exportID string, status string) error {
	validStatuses := map[string]bool{"draft": true, "exported": true, "submitted": true, "accepted": true, "rejected": true}
	if !validStatuses[status] {
		return fmt.Errorf("invalid status: %s", status)
	}
	return s.taxRepo.UpdateEFakturExportStatus(ctx, exportID, status)
}
