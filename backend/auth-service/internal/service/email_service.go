package service

import (
	"fmt"
	"net/smtp"
	"os"
)

type EmailService interface {
	SendPasswordResetOTP(email, code string) error
}

type smtpEmailService struct {
	host     string
	port     string
	user     string
	pass     string
	fromAddr string
}

func NewEmailService() EmailService {
	host := os.Getenv("SMTP_HOST")
	port := os.Getenv("SMTP_PORT")
	user := os.Getenv("SMTP_USER")
	pass := os.Getenv("SMTP_PASS")
	fromAddr := os.Getenv("SMTP_FROM")

	if fromAddr == "" {
		fromAddr = "noreply@tembus.id"
	}

	return &smtpEmailService{
		host:     host,
		port:     port,
		user:     user,
		pass:     pass,
		fromAddr: fromAddr,
	}
}

func (s *smtpEmailService) SendPasswordResetOTP(email, code string) error {
	// Fallback to console if SMTP is not configured
	if s.host == "" || s.port == "" {
		fmt.Printf("{\"event\":\"email_otp_issued\",\"recipient\":\"%s\",\"code\":\"%s\",\"message\":\"MOCKED_EMAIL_NO_SMTP_CONFIG\"}\n", email, code)
		return nil
	}

	auth := smtp.PlainAuth("", s.user, s.pass, s.host)
	to := []string{email}
	subject := "Reset Password - TEMBUS Mitra Kurir"
	body := fmt.Sprintf("Kode OTP untuk reset password Anda adalah: %s\n\nKode ini berlaku selama 5 menit.\nJangan berikan kode ini kepada siapapun.", code)

	msg := []byte("To: " + email + "\r\n" +
		"Subject: " + subject + "\r\n" +
		"\r\n" + body + "\r\n")

	err := smtp.SendMail(s.host+":"+s.port, auth, s.fromAddr, to, msg)
	if err != nil {
		fmt.Printf("{\"event\":\"email_otp_failed\",\"recipient\":\"%s\",\"error\":\"%s\"}\n", email, err.Error())
		return err
	}

	fmt.Printf("{\"event\":\"email_otp_sent\",\"recipient\":\"%s\"}\n", email)
	return nil
}
