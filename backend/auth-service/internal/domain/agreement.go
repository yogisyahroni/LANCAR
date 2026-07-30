package domain

import (
	"context"
	"time"
)

type AgreementType string

const (
	AgreementMitra        AgreementType = "mitra_agreement"
	AgreementCustomerTOS  AgreementType = "customer_tos"
	AgreementPrivacy      AgreementType = "privacy_policy"
)

type Agreement struct {
	ID            string        `json:"id" db:"id"`
	UserID        string        `json:"user_id" db:"user_id"`
	UserType      string        `json:"user_type" db:"user_type"` // courier, customer
	AgreementType AgreementType `json:"agreement_type" db:"agreement_type"`
	AgreedAt      time.Time     `json:"agreed_at" db:"agreed_at"`
	AgreedIP      *string       `json:"agreed_ip,omitempty" db:"agreed_ip"`
	UserAgent     *string       `json:"user_agent,omitempty" db:"user_agent"`
	PDFPath       *string       `json:"pdf_path,omitempty" db:"pdf_path"`
	HTMLContent   *string       `json:"html_content,omitempty" db:"html_content"`
	Metadata      []byte        `json:"metadata,omitempty" db:"metadata"`
	CreatedAt     time.Time     `json:"created_at" db:"created_at"`
	UpdatedAt     time.Time     `json:"updated_at" db:"updated_at"`

	// Joined fields (for admin display)
	UserName  string `json:"user_name,omitempty" db:"user_name"`
	UserEmail string `json:"user_email,omitempty" db:"user_email"`
	UserPhone string `json:"user_phone,omitempty" db:"user_phone"`
}

type AgreementRepository interface {
	Create(ctx context.Context, agreement *Agreement) error
	GetByID(ctx context.Context, id string) (*Agreement, error)
	GetByUserID(ctx context.Context, userID string, userType string) ([]*Agreement, error)
	List(ctx context.Context, limit, offset int, userType, agreementType string) ([]*Agreement, int, error)
	UpdatePDFPath(ctx context.Context, id, pdfPath string) error
	InsertAdminNotification(ctx context.Context, title, body, notifType, deepLink string, metadata map[string]interface{}) ([]string, error)
}
