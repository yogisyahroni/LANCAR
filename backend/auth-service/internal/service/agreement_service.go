package service

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"html/template"
	"os"
	"path/filepath"
	"strings"
	"time"
	"tembus/auth-service/internal/domain"
	"tembus/auth-service/pkg/logger"

	"github.com/redis/go-redis/v9"
)

type AgreementService struct {
	repo       domain.AgreementRepository
	storageSvc StorageService
	baseURL    string
	redisClient *redis.Client
}

type RedisPublisher interface {
	Publish(ctx context.Context, channel string, message interface{}) *redis.IntCmd
}

func NewAgreementService(repo domain.AgreementRepository, storageSvc StorageService, baseURL string) *AgreementService {
	return &AgreementService{
		repo:       repo,
		storageSvc: storageSvc,
		baseURL:    baseURL,
	}
}

// SetRedisClient attaches Redis for real-time notification push
func (s *AgreementService) SetRedisClient(rdb *redis.Client) {
	s.redisClient = rdb
}

// notifyAdmins creates admin notifications and triggers real-time push
func (s *AgreementService) notifyAdmins(ctx context.Context, agreement *domain.Agreement, userName, agreementTypeLabel string) {
	title := "Perjanjian Baru"
	body := fmt.Sprintf("%s menandatangani %s", userName, agreementTypeLabel)
	deepLink := "/agreements"
	metadata := map[string]interface{}{
		"agreement_id":   agreement.ID,
		"agreement_type": string(agreement.AgreementType),
		"user_name":      userName,
	}

	// Insert into DB for all admin users
	ids, err := s.repo.InsertAdminNotification(ctx, title, body, "agreement", deepLink, metadata)
	if err != nil {
		logger.Warn("Failed to notify admins about new agreement", "error", err)
		return
	}
	if len(ids) == 0 {
		logger.Debug("No admin users to notify about new agreement")
		return
	}

	// Real-time push via Redis pub/sub (consumed by admin-service WebSocket)
	if s.redisClient != nil {
		payload, _ := json.Marshal(map[string]interface{}{
			"title":   title,
			"body":    body,
			"type":    "agreement",
			"deep_link": deepLink,
			"metadata":  metadata,
			"created_at": time.Now().Format(time.RFC3339),
		})
		err := s.redisClient.Publish(ctx, "tembus:notification:new", payload).Err()
		if err != nil {
			logger.Warn("Failed to publish notification to Redis", "error", err)
		}
	}
}

func (s *AgreementService) CreateCourierAgreement(ctx context.Context, userID, fullName, nik, phone, email, ipAddress, userAgent string) (*domain.Agreement, error) {
	now := time.Now()

	// Generate HTML content from template
	htmlContent, err := s.renderAgreementHTML("mitra_agreement", map[string]interface{}{
		"NamaLengkap": fullName,
		"NIK":         nik,
		"NomorHP":     phone,
		"Email":       email,
		"Tanggal":     now.Format("2 January 2006"),
		"Waktu":       now.Format("15:04 WIB"),
		"Platform":    "TEMBUS",
		"PT":          "PT TEMBUS LINTAS TEKNOLOGI",
	})
	if err != nil {
		logger.Error("Failed to render courier agreement HTML", "error", err)
		return nil, fmt.Errorf("failed to render agreement: %w", err)
	}

	// Save HTML to file
	agreementDir := filepath.Join("agreements", "courier", userID)
	htmlFilename := fmt.Sprintf("mitra_agreement_%s.html", now.Format("20060102_150405"))
	pdfFilename := fmt.Sprintf("mitra_agreement_%s.pdf", now.Format("20060102_150405"))

	// Store via storage service
	_, err = s.storageSvc.Save(ctx, filepath.Join(agreementDir, htmlFilename), strings.NewReader(htmlContent))
	if err != nil {
		logger.Error("Failed to save agreement HTML", "error", err)
		return nil, fmt.Errorf("failed to save agreement: %w", err)
	}

	// Create agreement record
	var ipPtr *string
	if ipAddress != "" {
		ipPtr = &ipAddress
	}
	var uaPtr *string
	if userAgent != "" {
		uaPtr = &userAgent
	}

	htmlCopy := htmlContent
	agreement := &domain.Agreement{
		UserID:        userID,
		UserType:      "courier",
		AgreementType: domain.AgreementMitra,
		AgreedAt:      now,
		AgreedIP:      ipPtr,
		UserAgent:     uaPtr,
		HTMLContent:   &htmlCopy,
		CreatedAt:     now,
		UpdatedAt:     now,
	}

	if err := s.repo.Create(ctx, agreement); err != nil {
		return nil, fmt.Errorf("failed to create agreement record: %w", err)
	}

	// Generate PDF from HTML (async or sync)
	pdfPath := filepath.Join(agreementDir, pdfFilename)
	pdfFullPath := filepath.Join(s.getStoragePath(), pdfPath)
	if err := s.generatePDF(htmlContent, pdfFullPath); err != nil {
		logger.Warn("Failed to generate PDF for agreement", "id", agreement.ID, "error", err)
		// Non-fatal — agreement record still exists
	} else {
		// Update PDF path in DB
		_ = s.repo.UpdatePDFPath(ctx, agreement.ID, pdfPath)
		agreement.PDFPath = &pdfPath
	}

	// Notify admin users
	label := "Perjanjian Mitra Kurir"
	s.notifyAdmins(ctx, agreement, fullName, label)

	return agreement, nil
}

func (s *AgreementService) CreateCustomerAgreement(ctx context.Context, userID, fullName, phone, email, ipAddress, userAgent string) (*domain.Agreement, error) {
	now := time.Now()

	htmlContent, err := s.renderAgreementHTML("customer_tos", map[string]interface{}{
		"NamaLengkap": fullName,
		"NomorHP":     phone,
		"Email":       email,
		"Tanggal":     now.Format("2 January 2006"),
		"Waktu":       now.Format("15:04 WIB"),
		"Platform":    "TEMBUS",
		"PT":          "PT TEMBUS LINTAS TEKNOLOGI",
	})
	if err != nil {
		return nil, fmt.Errorf("failed to render agreement: %w", err)
	}

	agreementDir := filepath.Join("agreements", "customer", userID)
	pdfFilename := fmt.Sprintf("customer_tos_%s.pdf", now.Format("20060102_150405"))

	_, err = s.storageSvc.Save(ctx, filepath.Join(agreementDir, fmt.Sprintf("customer_tos_%s.html", now.Format("20060102_150405"))), strings.NewReader(htmlContent))
	if err != nil {
		return nil, fmt.Errorf("failed to save agreement: %w", err)
	}

	var ipPtr *string
	if ipAddress != "" {
		ipPtr = &ipAddress
	}
	var uaPtr *string
	if userAgent != "" {
		uaPtr = &userAgent
	}

	htmlCopy := htmlContent
	agreement := &domain.Agreement{
		UserID:        userID,
		UserType:      "customer",
		AgreementType: domain.AgreementCustomerTOS,
		AgreedAt:      now,
		AgreedIP:      ipPtr,
		UserAgent:     uaPtr,
		HTMLContent:   &htmlCopy,
		CreatedAt:     now,
		UpdatedAt:     now,
	}

	if err := s.repo.Create(ctx, agreement); err != nil {
		return nil, fmt.Errorf("failed to create agreement record: %w", err)
	}

	pdfPath := filepath.Join(agreementDir, pdfFilename)
	if err := s.generatePDF(htmlContent, filepath.Join(s.getStoragePath(), pdfPath)); err != nil {
		logger.Warn("Failed to generate PDF", "id", agreement.ID, "error", err)
	} else {
		_ = s.repo.UpdatePDFPath(ctx, agreement.ID, pdfPath)
		agreement.PDFPath = &pdfPath
	}

	// Notify admin users
	label := "Syarat & Ketentuan Pelanggan"
	s.notifyAdmins(ctx, agreement, fullName, label)

	return agreement, nil
}

func (s *AgreementService) GetAgreement(ctx context.Context, id string) (*domain.Agreement, error) {
	return s.repo.GetByID(ctx, id)
}

func (s *AgreementService) ListAgreements(ctx context.Context, limit, offset int, userType, agreementType string) ([]*domain.Agreement, int, error) {
	return s.repo.List(ctx, limit, offset, userType, agreementType)
}

func (s *AgreementService) GetAgreementsByUser(ctx context.Context, userID, userType string) ([]*domain.Agreement, error) {
	return s.repo.GetByUserID(ctx, userID, userType)
}

func (s *AgreementService) GetAgreementPDFPath(ctx context.Context, id string) (string, error) {
	a, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return "", err
	}
	if a.PDFPath == nil {
		return "", fmt.Errorf("PDF not yet generated for agreement %s", id)
	}
	return *a.PDFPath, nil
}

func (s *AgreementService) renderAgreementHTML(agreementType string, data map[string]interface{}) (string, error) {
	funcMap := template.FuncMap{
		"replace": func(old, new, src string) string {
			return strings.ReplaceAll(src, old, new)
		},
	}
	tmpl, err := template.New("agreement").Funcs(funcMap).Parse(s.getAgreementTemplate(agreementType))
	if err != nil {
		return "", fmt.Errorf("failed to parse template: %w", err)
	}
	var buf bytes.Buffer
	if err := tmpl.Execute(&buf, data); err != nil {
		return "", err
	}
	return buf.String(), nil
}

func (s *AgreementService) getStoragePath() string {
	path := os.Getenv("UPLOAD_PATH")
	if path == "" {
		path = "./uploads"
	}
	return path
}

func (s *AgreementService) generatePDF(htmlContent, outputPath string) error {
	// Simple approach: create an HTML file with print CSS
	// The browser's print-to-PDF on the admin dashboard is the primary PDF delivery
	// For server-side PDF, we save the HTML which the browser can print as PDF
	// In production, integrate with wkhtmltopdf or chromedp for true PDF generation

	// Create directory
	dir := filepath.Dir(outputPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("failed to create directory: %w", err)
	}

	// For now, save a copy of the HTML with print-ready CSS as the "PDF"
	// The actual PDF will be generated when admin clicks print/export
	pdfHTML := fmt.Sprintf(`<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Perjanjian Mitra TEMBUS</title>
<style>
  @page { size: A4; margin: 2cm; }
  body { font-family: 'Times New Roman', serif; font-size: 12pt; line-height: 1.6; color: #000; }
  h1 { font-size: 16pt; text-align: center; margin-bottom: 24pt; }
  h2 { font-size: 13pt; margin-top: 18pt; margin-bottom: 8pt; }
  p { text-align: justify; margin-bottom: 6pt; }
  table { width: 100%%; border-collapse: collapse; margin: 12pt 0; }
  th, td { border: 1px solid #000; padding: 4pt 8pt; text-align: left; font-size: 10pt; }
  th { background: #f0f0f0; }
  .signature { margin-top: 36pt; }
  .signature-line { width: 200pt; border-top: 1px solid #000; margin-top: 36pt; }
  @media print { body { margin: 0; padding: 0; } }
</style></head><body>
%s
</body></html>`, htmlContent)

	return os.WriteFile(outputPath, []byte(pdfHTML), 0644)
}

func (s *AgreementService) getAgreementTemplate(agreementType string) string {
	switch agreementType {
	case "mitra_agreement":
		return mitraAgreementTemplate
	case "customer_tos":
		return customerTOSTemplate
	default:
		return customerTOSTemplate
	}
}

const mitraAgreementTemplate = `
<h1>PERJANJIAN MITRA KURIR {{.Platform}}</h1>

<p style="text-align:center;margin-bottom:18pt;">
  <strong>Nomor:</strong> {{.Platform}}/KURIR/{{.Tanggal | replace " " ""}}/001<br>
  <strong>Tanggal:</strong> {{.Tanggal}}
</p>

<h2>PARA PIHAK</h2>

<p><strong>{{.PT}}</strong>, berkedudukan di Indonesia, selanjutnya disebut <strong>PIHAK PERTAMA</strong> (Platform).</p>

<p><strong>Dengan:</strong></p>

<table>
  <tr><td>Nama Lengkap</td><td><strong>{{.NamaLengkap}}</strong></td></tr>
  <tr><td>NIK</td><td>{{.NIK}}</td></tr>
  <tr><td>Nomor HP</td><td>{{.NomorHP}}</td></tr>
  <tr><td>Email</td><td>{{.Email}}</td></tr>
</table>

<p>Selanjutnya disebut <strong>PIHAK KEDUA</strong> (Mitra Kurir).</p>

<h2>PASAL 1 — STATUS HUKUM</h2>
<p>Para Pihak SEPAKAT bahwa hubungan PIHAK KEDUA dengan PIHAK PERTAMA adalah <strong>hubungan kemitraan/kontrak</strong>, BUKAN hubungan kerja (bukan karyawan/pekerja). PIHAK KEDUA bertindak sebagai mitra independen dan tidak terikat jam kerja, seragam, atau instruksi harian dari PIHAK PERTAMA.</p>

<h2>PASAL 2 — HAK & KEWAJIBAN MITRA</h2>
<p>PIHAK KEDUA berhak menerima komisi atas Order yang diselesaikan dan berhak menolak Order. PIHAK KEDUA wajib menyelesaikan Order tepat waktu, memiliki SIM aktif dan STNK berlaku, berperilaku sopan, menjaga kerahasiaan data Pengguna, dan tidak melakukan kecurangan dalam bentuk apa pun.</p>

<h2>PASAL 3 — LARANGAN & KONSEKUENSI HUKUM</h2>
<p><strong>Setiap tindak pidana yang dilakukan PIHAK KEDUA akan diproses sesuai hukum yang berlaku di Negara Republik Indonesia. Tidak ada pendekatan kekeluargaan dalam penegakan sanksi.</strong></p>
<p>Pelanggaran berat meliputi: mencuri/menggelapkan barang kiriman (Pasal 362/372 KUHP — ancaman pidana 5 tahun), melakukan kekerasan/pengancaman (Pasal 351/335 KUHP), menggunakan identitas palsu (Pasal 263 KUHP), melakukan fraud sistem (UU ITE — ancaman 12 tahun), dan menyalahgunakan data pengguna (UU PDP — ancaman 5 tahun).</p>
<p>Selain proses hukum, PIHAK PERTAMA berhak mempublikasikan identitas PIHAK KEDUA yang terbukti secara inkrah melakukan pencurian/penggelapan barang kiriman melalui media sosial dan kanal publik Platform.</p>

<h2>PASAL 4 — KOMISI & PEMBAYARAN</h2>
<p>Komisi dibayarkan secara mingguan melalui transfer bank ke rekening atas nama PIHAK KEDUA. Platform berhak menahan pembayaran jika terdapat indikasi fraud atau pelanggaran yang sedang dalam proses investigasi.</p>

<h2>PASAL 5 — PENYELESAIAN SENGKETA</h2>
<p>Para Pihak sepakat untuk menyelesaikan sengketa secara musyawarah terlebih dahulu. Jika tidak tercapai, sengketa akan diselesaikan melalui Pengadilan Negeri yang berwenang. Para Pihak memilih <strong>hukum Negara Republik Indonesia</strong> sebagai hukum yang berlaku.</p>

<div class="signature">
  <p>Dengan ini, PIHAK KEDUA menyatakan telah membaca, memahami, dan menyetujui seluruh ketentuan dalam Perjanjian Mitra ini.</p>

  <table style="margin-top:36pt;">
    <tr>
      <td style="border:none;width:50%;text-align:center;">
        <p><strong>PIHAK PERTAMA</strong></p>
        <p>{{.PT}}</p>
        <div class="signature-line"></div>
        <p>(Direktur)</p>
      </td>
      <td style="border:none;width:50%;text-align:center;">
        <p><strong>PIHAK KEDUA</strong></p>
        <p>{{.NamaLengkap}}</p>
        <div class="signature-line"></div>
        <p style="font-size:9pt;">NIK: {{.NIK}}</p>
      </td>
    </tr>
  </table>

  <p style="margin-top:24pt;font-size:9pt;color:#666;">
    Ditandatangani secara elektronik pada {{.Tanggal}} pukul {{.Waktu}}.<br>
    Dokumen ini sah dan mengikat secara hukum.
  </p>
</div>
`

const customerTOSTemplate = `
<h1>SYARAT & KETENTUAN PENGGUNA {{.Platform}}</h1>

<p style="text-align:center;margin-bottom:18pt;">
  <strong>Tanggal Persetujuan:</strong> {{.Tanggal}} {{.Waktu}}
</p>

<h2>IDENTITAS PENGGUNA</h2>

<table>
  <tr><td>Nama Lengkap</td><td><strong>{{.NamaLengkap}}</strong></td></tr>
  <tr><td>Nomor HP</td><td>{{.NomorHP}}</td></tr>
  <tr><td>Email</td><td>{{.Email}}</td></tr>
</table>

<h2>PENGATURAN UMUM</h2>
<p>Dengan menyetujui Syarat & Ketentuan ini, Pengguna menyatakan tunduk pada seluruh ketentuan yang diatur oleh {{.PT}} ("Platform", "{{.Platform}}"). Platform hanya menghubungkan Pengguna dengan Mitra Kurir — Platform bukan penyedia jasa pengiriman.</p>

<h2>LARANGAN PENGIRIMAN</h2>
<p>Pengguna DILARANG KERAS mengirim barang-barang berikut melalui layanan {{.Platform}}:</p>
<p><strong>Narkotika, Psikotropika & Obat Terlarang</strong> — seluruh golongan narkotika (UU 35/2009), psikotropika (UU 5/1997), ganja, sabu, ekstasi, heroin, kokain.<br>
<strong>Minuman Beralkohol</strong> — semua minuman dengan kadar alkohol >1% (Inpres 3/1997).<br>
<strong>Senjata Tajam & Api</strong> — senjata api, senjata tajam (golok, celurit, badik, pisau belati), airsoft gun.<br>
<strong>Bahan Peledak & Berbahaya</strong> — dinamit, petasan, bahan kimia berbahaya (B3), bahan mudah terbakar, tabung gas.<br>
<strong>Barang Ilegal Lainnya</strong> — uang tunai >Rp10jt, emas tanpa dokumen, hewan hidup, barang bajakan.</p>
<p>Pelanggaran mengakibatkan pemblokiran akun permanen dan laporan kepada pihak berwajib.</p>

<h2>KETENTUAN LAIN</h2>
<p>Syarat & Ketentuan ini diatur oleh hukum Negara Republik Indonesia. Setiap sengketa akan diselesaikan musyawarah terlebih dahulu, dan jika tidak tercapai diselesaikan di Pengadilan Negeri yang berwenang.</p>

<div class="signature">
  <p>Dengan ini, Pengguna menyatakan telah membaca, memahami, dan menyetujui seluruh Syarat & Ketentuan {{.Platform}}.</p>

  <div style="margin-top:36pt;text-align:center;">
    <p><strong>{{.NamaLengkap}}</strong></p>
    <div class="signature-line" style="margin:36pt auto 0;"></div>
    <p style="font-size:9pt;margin-top:8pt;">Ditandatangani secara elektronik pada {{.Tanggal}} pukul {{.Waktu}}</p>
  </div>
</div>
`
