package infrastructure

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/smtp"
	"os"
	"time"

	"tembus/merchant-service/internal/domain"
)

// staffNotifierImpl — implementasi domain.StaffNotifier.
// Kirim email via SMTP + WA via integration-gateway.
type staffNotifierImpl struct {
	emailHost     string
	emailPort     string
	emailUser     string
	emailPass     string
	emailFrom     string
	waGatewayURL  string
	waInternalKey string
	httpClient    *http.Client
}

// NewStaffNotifier bikin notifier dari env.
// Env wajib: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM,
// INTEGRATION_GATEWAY_URL, INTERNAL_API_KEY
func NewStaffNotifier() domain.StaffNotifier {
	return &staffNotifierImpl{
		emailHost:     os.Getenv("SMTP_HOST"),
		emailPort:     os.Getenv("SMTP_PORT"),
		emailUser:     os.Getenv("SMTP_USER"),
		emailPass:     os.Getenv("SMTP_PASS"),
		emailFrom:     os.Getenv("SMTP_FROM"),
		waGatewayURL:  os.Getenv("INTEGRATION_GATEWAY_URL"),
		waInternalKey: os.Getenv("INTERNAL_API_KEY"),
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

// SendInviteEmail kirim token undangan via SMTP.
// Kalau SMTP tidak dikonfigurasi -> log ke stdout (dev mode) tapi return nil agar flow tidak terhenti.
func (n *staffNotifierImpl) SendInviteEmail(ctx context.Context, email, staffName, token, merchantName string) error {
	if n.emailHost == "" || n.emailPort == "" {
		log.Printf("[StaffInvite] EMAIL MOCK to=%s name=%s token=%s merchant=%s", email, staffName, token, merchantName)
		return nil
	}

	subject := fmt.Sprintf("Undangan Staff %s", merchantName)
	body := fmt.Sprintf(`Halo %s,

Kamu diundang jadi staff toko "%s".

Token undangan: %s

Gunakan token ini di aplikasi TEMBUS Merchant (menu Staff -> Terima Undangan) untuk mulai bekerja. Token berlaku 7 hari.

- Tim TEMBUS`, staffName, merchantName, token)

	// Simple SMTP send
	auth := smtp.PlainAuth("", n.emailUser, n.emailPass, n.emailHost)
	to := []string{email}
	msg := []byte("To: " + email + "\r\n" +
		"Subject: " + subject + "\r\n" +
		"\r\n" + body + "\r\n")

	err := smtp.SendMail(n.emailHost+":"+n.emailPort, auth, n.emailFrom, to, msg)
	if err != nil {
		log.Printf("[StaffInvite] EMAIL FAILED to=%s err=%v", email, err)
		return fmt.Errorf("kirim email gagal: %w", err)
	}
	log.Printf("[StaffInvite] EMAIL SENT to=%s", email)
	return nil
}

// SendInviteWhatsApp kirim token undangan via integration-gateway.
func (n *staffNotifierImpl) SendInviteWhatsApp(ctx context.Context, phone, staffName, token, merchantName string) error {
	if n.waGatewayURL == "" || n.waInternalKey == "" {
		log.Printf("[StaffInvite] WA MOCK to=%s name=%s token=%s merchant=%s", phone, staffName, token, merchantName)
		return nil
	}

	// Format nomor WA: pastikan diawali 62 (Indonesia) tanpa +/0 di depan
	waTo := normalizeWA(phone)
	if waTo == "" {
		return fmt.Errorf("nomor WA tidak valid: %s", phone)
	}

	message := fmt.Sprintf(`Halo %s, kamu diundang jadi staff toko "%s".

Token: %s

Buka aplikasi TEMBUS Merchant -> Staff -> Terima Undangan.
Token berlaku 7 hari.

- Tim TEMBUS`, staffName, merchantName, token)

	payload := map[string]string{
		"to":      waTo,
		"message": message,
	}
	body, _ := json.Marshal(payload)

	url := n.waGatewayURL + "/api/internal/otp/send-wa"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("buat request WA: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Internal-Api-Key", n.waInternalKey)

	resp, err := n.httpClient.Do(req)
	if err != nil {
		log.Printf("[StaffInvite] WA HTTP ERROR to=%s err=%v", phone, err)
		return fmt.Errorf("kirim WA gagal: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		respBody, _ := io.ReadAll(resp.Body)
		log.Printf("[StaffInvite] WA NON-200 to=%s status=%d body=%s", phone, resp.StatusCode, string(respBody))
		return fmt.Errorf("WA gateway error status %d", resp.StatusCode)
	}

	log.Printf("[StaffInvite] WA SENT to=%s", phone)
	return nil
}

// normalizeWA bersihkan nomor ke format 62xxx (tanpa +/0 di depan).
func normalizeWA(phone string) string {
	// Hapus non-digit
	digits := ""
	for _, r := range phone {
		if r >= '0' && r <= '9' {
			digits += string(r)
		}
	}
	// Hapus leading 0/+62
	if len(digits) > 0 && digits[0] == '0' {
		digits = "62" + digits[1:]
	} else if len(digits) > 2 && digits[:2] == "62" {
		// sudah benar
	} else if len(digits) > 0 {
		digits = "62" + digits
	}
	return digits
}