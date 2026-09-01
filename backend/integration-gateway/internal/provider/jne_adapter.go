package provider

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"tembus/integration-gateway/internal/domain"
	"time"
)

type JNEProvider struct {
	apiKey     string
	username   string
	baseURL    string
	httpClient *http.Client
	cb         *CircuitBreaker
}

func NewJNEProvider() *JNEProvider {
	baseURL := os.Getenv("JNE_BASE_URL")
	if baseURL == "" {
		baseURL = "https://apiv2.jne.co.id:10102"
	}
	fail, succ, to := getCircuitBreakerConfig("JNE")
	return &JNEProvider{
		apiKey:     os.Getenv("JNE_API_KEY"),
		username:   os.Getenv("JNE_USERNAME"),
		baseURL:    strings.TrimRight(baseURL, "/"),
		httpClient: &http.Client{Timeout: 15 * time.Second},
		cb:         NewCircuitBreaker("jne_api", fail, succ, to),
	}
}

// CheckTariff checks estimated shipping cost between origin and destination
func (p *JNEProvider) CheckTariff(ctx context.Context, req domain.TariffRequest) (*domain.TariffResponse, error) {
	if p.apiKey == "" || p.username == "" {
		return nil, errors.New("JNE API credentials are not configured")
	}

	endpoint := fmt.Sprintf("%s/tracing/api/pricedev", p.baseURL)
	formData := url.Values{}
	formData.Set("username", p.username)
	formData.Set("api_key", p.apiKey)
	formData.Set("from", req.OriginCode)
	formData.Set("thru", req.DestinationCode)
	formData.Set("weight", fmt.Sprintf("%.2f", req.WeightKG))

	if err := p.cb.Allow(); err != nil {
		return nil, fmt.Errorf("JNE circuit breaker open: %w", err)
	}

	resp, err := doHTTPWithRetry(ctx, p.httpClient, func() (*http.Request, error) {
		httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, strings.NewReader(formData.Encode()))
		if err != nil {
			return nil, fmt.Errorf("failed to create JNE tariff request: %w", err)
		}
		httpReq.Header.Set("Content-Type", "application/x-www-form-urlencoded")
		return httpReq, nil
	})
	if err != nil {
		p.cb.RecordFailure()
		return nil, fmt.Errorf("JNE tariff HTTP request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 500 {
		p.cb.RecordFailure()
	} else {
		p.cb.RecordSuccess()
	}

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read JNE tariff response body: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("JNE tariff check returned status %d: %s", resp.StatusCode, string(bodyBytes))
	}

	var jneResp struct {
		Price []struct {
			ServiceDisplay string `json:"service_display"`
			ServiceCode    string `json:"service_code"`
			Price          string `json:"price"`
			EtdFrom        string `json:"etd_from"`
			EtdThru        string `json:"etd_thru"`
		} `json:"price"`
	}

	if err := json.Unmarshal(bodyBytes, &jneResp); err != nil {
		return nil, fmt.Errorf("failed to decode JNE tariff response: %w", err)
	}

	if len(jneResp.Price) == 0 {
		return nil, errors.New("no tariff available for specified route")
	}

	var services []domain.TariffServiceOption
	for _, item := range jneResp.Price {
		priceVal, _ := strconv.ParseFloat(item.Price, 64)
		etd := fmt.Sprintf("%s-%s hari", item.EtdFrom, item.EtdThru)
		services = append(services, domain.TariffServiceOption{
			ServiceCode:   item.ServiceCode,
			ServiceName:   item.ServiceDisplay,
			TariffGross:   int64(priceVal), // Konversi float64 → int64 (IDR, tidak ada desimal)
			EstimatedDays: etd,
		})
	}

	return &domain.TariffResponse{
		Provider: "JNE",
		Source:   "jne_api",
		Services: services,
	}, nil
}

// CreateOrder generates an airwaybill (connote) with JNE
func (p *JNEProvider) CreateOrder(ctx context.Context, req domain.LogisticsOrderRequest) (*domain.LogisticsOrderResponse, error) {
	if p.apiKey == "" || p.username == "" {
		return nil, errors.New("JNE API credentials are not configured")
	}

	endpoint := fmt.Sprintf("%s/tracing/api/generatecnote", p.baseURL)

	formData := url.Values{}
	formData.Set("username", p.username)
	formData.Set("api_key", p.apiKey)
	formData.Set("OLSHOP_BRANCH", req.OriginCode)
	formData.Set("OLSHOP_CUST", p.username)
	formData.Set("OLSHOP_ORDERID", req.ReferenceID)
	formData.Set("OLSHOP_SHIPPER_NAME", req.SenderName)
	formData.Set("OLSHOP_SHIPPER_ADDR1", req.SenderAddress)
	formData.Set("OLSHOP_SHIPPER_CITY", req.SenderCity)
	formData.Set("OLSHOP_SHIPPER_ZIP", req.SenderZipCode)
	formData.Set("OLSHOP_SHIPPER_PHONE", req.SenderPhone)
	formData.Set("OLSHOP_RECEIVER_NAME", req.ReceiverName)
	formData.Set("OLSHOP_RECEIVER_ADDR1", req.ReceiverAddress)
	formData.Set("OLSHOP_RECEIVER_CITY", req.ReceiverCity)
	formData.Set("OLSHOP_RECEIVER_ZIP", req.ReceiverZipCode)
	formData.Set("OLSHOP_RECEIVER_PHONE", req.ReceiverPhone)
	formData.Set("OLSHOP_QTY", "1")
	formData.Set("OLSHOP_WEIGHT", fmt.Sprintf("%.2f", req.WeightKG))
	formData.Set("OLSHOP_GOODSDESC", req.ItemDescription)
	formData.Set("OLSHOP_GOODSVALUE", fmt.Sprintf("%d", req.ItemValue))
	formData.Set("OLSHOP_GOODSTYPE", "1")
	formData.Set("OLSHOP_INS_FLAG", "N")
	formData.Set("OLSHOP_ORIG", req.OriginCode)
	formData.Set("OLSHOP_DEST", req.DestinationCode)
	formData.Set("OLSHOP_SERVICE", req.ServiceType)
	formData.Set("OLSHOP_COD_FLAG", "N")
	formData.Set("OLSHOP_COD_AMOUNT", "0")

	if err := p.cb.Allow(); err != nil {
		return nil, fmt.Errorf("JNE circuit breaker open: %w", err)
	}

	resp, err := doHTTPWithRetry(ctx, p.httpClient, func() (*http.Request, error) {
		httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, strings.NewReader(formData.Encode()))
		if err != nil {
			return nil, fmt.Errorf("failed to create JNE order request: %w", err)
		}
		httpReq.Header.Set("Content-Type", "application/x-www-form-urlencoded")
		return httpReq, nil
	})
	if err != nil {
		p.cb.RecordFailure()
		return nil, fmt.Errorf("JNE order HTTP request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 500 {
		p.cb.RecordFailure()
	} else {
		p.cb.RecordSuccess()
	}

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read JNE order response body: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("JNE order generation failed with status %d: %s", resp.StatusCode, string(bodyBytes))
	}

	var jneResp struct {
		Detail []struct {
			CnoteNo string `json:"cnote_no"`
			Status  string `json:"status"`
			Reason  string `json:"reason"`
			Amount  string `json:"amount"`
		} `json:"detail"`
	}

	if err := json.Unmarshal(bodyBytes, &jneResp); err != nil {
		return nil, fmt.Errorf("failed to decode JNE order response: %w", err)
	}

	if len(jneResp.Detail) == 0 || jneResp.Detail[0].CnoteNo == "" {
		return nil, fmt.Errorf("JNE failed to generate AWB: %s", string(bodyBytes))
	}

	amountVal, _ := strconv.ParseFloat(jneResp.Detail[0].Amount, 64)

	return &domain.LogisticsOrderResponse{
		ReferenceID: req.ReferenceID,
		AWBNumber:   jneResp.Detail[0].CnoteNo,
		Provider:    "JNE",
		ServiceType: req.ServiceType,
		BookingCode: jneResp.Detail[0].CnoteNo,
		TotalAmount: int64(amountVal),
	}, nil
}

// TrackOrder checks real-time tracking status of an airwaybill
func (p *JNEProvider) TrackOrder(ctx context.Context, awb string) (*domain.TrackingResponse, error) {
	if p.apiKey == "" || p.username == "" {
		return nil, errors.New("JNE API credentials are not configured")
	}

	endpoint := fmt.Sprintf("%s/tracing/api/list/v1/cnote/%s", p.baseURL, awb)

	formData := url.Values{}
	formData.Set("username", p.username)
	formData.Set("api_key", p.apiKey)

	if err := p.cb.Allow(); err != nil {
		return nil, fmt.Errorf("JNE circuit breaker open: %w", err)
	}

	resp, err := doHTTPWithRetry(ctx, p.httpClient, func() (*http.Request, error) {
		httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, strings.NewReader(formData.Encode()))
		if err != nil {
			return nil, fmt.Errorf("failed to create JNE track request: %w", err)
		}
		httpReq.Header.Set("Content-Type", "application/x-www-form-urlencoded")
		return httpReq, nil
	})
	if err != nil {
		p.cb.RecordFailure()
		return nil, fmt.Errorf("JNE track HTTP request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 500 {
		p.cb.RecordFailure()
	} else {
		p.cb.RecordSuccess()
	}

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read JNE track response body: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("JNE tracking returned status %d: %s", resp.StatusCode, string(bodyBytes))
	}

	var jneResp struct {
		History []struct {
			Date string `json:"date"`
			Desc string `json:"desc"`
			Code string `json:"code"`
		} `json:"history"`
	}

	if err := json.Unmarshal(bodyBytes, &jneResp); err != nil {
		return nil, fmt.Errorf("failed to decode JNE track response: %w", err)
	}

	var events []domain.TrackingEvent
	var currentStatus string
	var currentDetail string

	for _, h := range jneResp.History {
		events = append(events, domain.TrackingEvent{
			Timestamp: h.Date,
			Status:    h.Code,
			Note:      h.Desc,
		})
		currentStatus = h.Code
		currentDetail = h.Desc
	}

	// Standardize status mapping
	stdStatus := "IN_TRANSIT"
	if strings.Contains(strings.ToUpper(currentDetail), "DELIVERED") || strings.EqualFold(currentStatus, "D01") {
		stdStatus = "DELIVERED"
	} else if strings.Contains(strings.ToUpper(currentDetail), "MANIFESTED") {
		stdStatus = "MANIFESTED"
	}

	return &domain.TrackingResponse{
		AWBNumber:    awb,
		Provider:     "JNE",
		Status:       stdStatus,
		StatusDetail: currentDetail,
		History:      events,
	}, nil
}
