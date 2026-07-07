package infrastructure

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"time"

	"tembus/order-service/internal/domain"
)

// IntegrationGatewayClient adalah implementasi domain.AWBClient yang
// berkomunikasi ke integration-gateway melalui HTTP internal.
// Autentikasi menggunakan header X-Internal-Api-Key dari env INTERNAL_API_KEY.
type IntegrationGatewayClient struct {
	baseURL    string
	apiKey     string
	httpClient *http.Client
	configRepo domain.ConfigRepository
}

// NewIntegrationGatewayClient membuat client baru.
// baseURL diambil dari env INTEGRATION_GATEWAY_URL.
// apiKey diambil dari env INTERNAL_API_KEY.
func NewIntegrationGatewayClient(configRepo domain.ConfigRepository) *IntegrationGatewayClient {
	baseURL := os.Getenv("INTEGRATION_GATEWAY_URL")
	if baseURL == "" {
		baseURL = "http://integration-gateway:8085"
	}
	apiKey := os.Getenv("INTERNAL_API_KEY")

	return &IntegrationGatewayClient{
		baseURL:    baseURL,
		apiKey:     apiKey,
		configRepo: configRepo,
		httpClient: &http.Client{
			Timeout: 15 * time.Second,
		},
	}
}

// createAWBRequest adalah struktur JSON yang dikirim ke integration-gateway.
type createAWBRequest struct {
	Provider        string  `json:"provider"`
	ReferenceID     string  `json:"reference_id"`
	SenderName      string  `json:"sender_name"`
	SenderPhone     string  `json:"sender_phone"`
	SenderAddress   string  `json:"sender_address"`
	SenderCity      string  `json:"sender_city"`
	SenderZipCode   string  `json:"sender_zip_code"`
	ReceiverName    string  `json:"receiver_name"`
	ReceiverPhone   string  `json:"receiver_phone"`
	ReceiverAddress string  `json:"receiver_address"`
	ReceiverCity    string  `json:"receiver_city"`
	ReceiverZipCode string  `json:"receiver_zip_code"`
	OriginCode      string  `json:"origin_code"`
	DestinationCode string  `json:"destination_code"`
	WeightKG        float64 `json:"weight_kg"`
	ItemDescription string  `json:"item_description"`
	ItemValue       float64 `json:"item_value"`
	ServiceType     string  `json:"service_type"`
}

// createAWBResponseData adalah field data dalam respons integration-gateway.
type createAWBResponseData struct {
	AWBNumber   string `json:"awb_number"`
	Provider    string `json:"provider"`
	ServiceType string `json:"service_type"`
	BookingCode string `json:"booking_code"`
	TotalAmount float64 `json:"total_amount"`
}

// createAWBResponseEnvelope adalah wrapper respons standar integration-gateway.
type createAWBResponseEnvelope struct {
	Success bool                  `json:"success"`
	Message string                `json:"message"`
	Data    *createAWBResponseData `json:"data"`
}

// CreateAWB mengirim request pembuatan AWB ke integration-gateway.
func (c *IntegrationGatewayClient) CreateAWB(ctx context.Context, req domain.AWBRequest) (*domain.AWBResponse, error) {
	payload := createAWBRequest{
		Provider:        req.Provider,
		ReferenceID:     req.ReferenceID,
		SenderName:      req.SenderName,
		SenderPhone:     req.SenderPhone,
		SenderAddress:   req.SenderAddress,
		SenderCity:      req.SenderCity,
		SenderZipCode:   req.SenderZipCode,
		ReceiverName:    req.ReceiverName,
		ReceiverPhone:   req.ReceiverPhone,
		ReceiverAddress: req.ReceiverAddress,
		ReceiverCity:    req.ReceiverCity,
		ReceiverZipCode: req.ReceiverZipCode,
		OriginCode:      req.OriginCode,
		DestinationCode: req.DestinationCode,
		WeightKG:        req.WeightKG,
		ItemDescription: req.ItemDescription,
		ItemValue:       req.ItemValue,
		ServiceType:     req.ServiceType,
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("awb_client: marshal request: %w", err)
	}

	url := c.baseURL + "/api/internal/logistics/create-order"
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("awb_client: create http request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("X-Internal-Api-Key", c.apiKey)

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("awb_client: http do: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("awb_client: read response body: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		slog.ErrorContext(ctx, "awb_client: integration-gateway returned non-200",
			"status", resp.StatusCode, "body", string(respBody))
		return nil, fmt.Errorf("awb_client: integration-gateway error (status %d): %s", resp.StatusCode, string(respBody))
	}

	var envelope createAWBResponseEnvelope
	if err := json.Unmarshal(respBody, &envelope); err != nil {
		return nil, fmt.Errorf("awb_client: unmarshal response: %w", err)
	}

	if !envelope.Success || envelope.Data == nil {
		return nil, fmt.Errorf("awb_client: integration-gateway reported failure: %s", envelope.Message)
	}

	trackingURLTemplate := c.configRepo.GetStringConfig(ctx, "awb_tracking_url_template", "https://cekresi.com/?noresi=%s")
	trackingURL := fmt.Sprintf(trackingURLTemplate, envelope.Data.AWBNumber)

	return &domain.AWBResponse{
		AWBNumber:   envelope.Data.AWBNumber,
		Provider:    envelope.Data.Provider,
		ServiceType: envelope.Data.ServiceType,
		BookingCode: envelope.Data.BookingCode,
		TrackingURL: trackingURL,
	}, nil
}

// waPayload adalah body untuk endpoint OTP/WhatsApp di integration-gateway.
type waPayload struct {
	To      string `json:"to"`
	Message string `json:"message"`
}

type waResponseEnvelope struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
}

// SendWhatsApp mengirim pesan WhatsApp melalui integration-gateway.
func (c *IntegrationGatewayClient) SendWhatsApp(ctx context.Context, to, message string) error {
	payload := waPayload{To: to, Message: message}
	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("awb_client: marshal wa payload: %w", err)
	}

	url := c.baseURL + "/api/internal/otp/send-wa"
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("awb_client: create wa http request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("X-Internal-Api-Key", c.apiKey)

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return fmt.Errorf("awb_client: wa http do: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		respBody, _ := io.ReadAll(resp.Body)
		slog.WarnContext(ctx, "awb_client: wa non-200", "status", resp.StatusCode, "body", string(respBody))
		return fmt.Errorf("awb_client: wa error (status %d)", resp.StatusCode)
	}

	return nil
}

// CheckTariff meminta integration-gateway untuk mengecek tarif logistik.
// Response dari integration-gateway dibungkus dalam envelope {success, data}.
func (c *IntegrationGatewayClient) CheckTariff(ctx context.Context, req domain.CheckTariffRequest) (*domain.CheckTariffResponse, error) {
	// Query params harus sesuai dengan logistics_handler.go:
	// handler menggunakan: provider, origin, destination, weight
	tariffURL := fmt.Sprintf("%s/api/internal/logistics/tariff?provider=%s&origin=%s&destination=%s&weight=%.2f",
		c.baseURL, req.Provider, req.OriginCode, req.DestinationCode, req.WeightKG)

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodGet, tariffURL, nil)
	if err != nil {
		return nil, fmt.Errorf("awb_client: create tariff http request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("X-Internal-Api-Key", c.apiKey)

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("awb_client: tariff http do: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("awb_client: read tariff response body: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		slog.ErrorContext(ctx, "awb_client: integration-gateway returned non-200 for tariff",
			"status", resp.StatusCode, "body", string(respBody))
		return nil, fmt.Errorf("awb_client: integration-gateway error (status %d): %s", resp.StatusCode, string(respBody))
	}

	// integration-gateway membungkus respons dalam envelope {success, data}
	// Struktur data di dalam envelope menggunakan TariffResponse dari domain gateway
	// yang sudah menggunakan TariffGross int64 dengan JSON tag "tariff_gross".
	var envelope struct {
		Success bool `json:"success"`
		Message string `json:"message"`
		Data    *struct {
			Provider string `json:"provider"`
			Services []struct {
				ServiceCode   string `json:"service_code"`
				ServiceName   string `json:"service_name"`
				TariffGross   int64  `json:"tariff_gross"`   // ← field name setelah fix domain
				EstimatedDays string `json:"estimated_days"`
			} `json:"services"`
		} `json:"data"`
	}

	if err := json.Unmarshal(respBody, &envelope); err != nil {
		return nil, fmt.Errorf("awb_client: unmarshal tariff envelope: %w", err)
	}

	if !envelope.Success || envelope.Data == nil {
		return nil, fmt.Errorf("awb_client: tariff check failed: %s", envelope.Message)
	}

	// Map ke domain.CheckTariffResponse (order-service domain)
	result := &domain.CheckTariffResponse{
		Provider: envelope.Data.Provider,
		Origin:   req.OriginCode,
		Dest:     req.DestinationCode,
		Weight:   req.WeightKG,
	}
	for _, svc := range envelope.Data.Services {
		result.Services = append(result.Services, domain.TariffServiceOption{
			ServiceCode: svc.ServiceCode,
			ServiceName: svc.ServiceName,
			TariffGross: svc.TariffGross, // int64 sudah sesuai
			ETD:         svc.EstimatedDays,
		})
	}

	return result, nil
}
