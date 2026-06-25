package provider

import (
	"context"
	"errors"
	"fmt"
	"os"
	"tembus/integration-gateway/internal/domain"
)

type XenditProvider struct {
	secretKey string
}

func NewXenditProvider() *XenditProvider {
	return &XenditProvider{
		secretKey: os.Getenv("XENDIT_SECRET_KEY"),
	}
}

func (x *XenditProvider) CreateInvoice(ctx context.Context, req domain.InvoiceRequest) (*domain.InvoiceResponse, error) {
	if x.secretKey == "" {
		return nil, errors.New("XENDIT_SECRET_KEY is not configured")
	}

	// TODO: Implement Xendit Create Invoice API Call
	// E.g., POST https://api.xendit.co/v2/invoices
	// Using Basic Auth: username=secretKey, password=""

	fmt.Printf("[integration-gateway] Mock Xendit CreateInvoice called for amount %f\n", req.Amount)

	return &domain.InvoiceResponse{
		Token:      "xnd_mock_token",
		InvoiceURL: "https://checkout.xendit.co/web/mock",
	}, nil
}

func (x *XenditProvider) CreateDisbursement(ctx context.Context, req domain.DisbursementRequest) (*domain.DisbursementResponse, error) {
	if x.secretKey == "" {
		return nil, errors.New("XENDIT_SECRET_KEY is not configured")
	}

	// TODO: Implement Xendit Disbursement API Call
	// E.g., POST https://api.xendit.co/disbursements

	fmt.Printf("[integration-gateway] Mock Xendit CreateDisbursement called for amount %f\n", req.Amount)

	return &domain.DisbursementResponse{
		Status: "pending",
	}, nil
}
