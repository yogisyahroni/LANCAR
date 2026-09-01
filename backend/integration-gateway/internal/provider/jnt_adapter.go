package provider

import (
	"context"
	"crypto/md5"
	"encoding/base64"
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

type JNTProvider struct {
	apiAccount   string
	privateKey   string
	customerCode string
	baseURL      string
	httpClient   *http.Client
	cb           *CircuitBreaker
}

func (p *JNTProvider) Identity() domain.ProviderIdentity {
	return domain.ProviderIdentity{ID: "jnt", Code: "JNT", Name: "J&T Express"}
}

func (p *JNTProvider) Capabilities() []domain.Capability {
	return []domain.Capability{
		domain.CapabilityTariff,
		domain.CapabilityShipment,
		domain.CapabilityTrackingPull,
	}
}

func NewJNTProvider() *JNTProvider {
	baseURL := os.Getenv("JNT_BASE_URL")
	if baseURL == "" {
		baseURL = "https://vipapi.jntexpress.co.id:10101"
	}
	fail, succ, to := getCircuitBreakerConfig("JNT")
	return &JNTProvider{
		apiAccount:   os.Getenv("JNT_API_ACCOUNT"),
		privateKey:   os.Getenv("JNT_PRIVATE_KEY"),
		customerCode: os.Getenv("JNT_CUSTOMER_CODE"),
		baseURL:      strings.TrimRight(baseURL, "/"),
		httpClient:   &http.Client{Timeout: 15 * time.Second},
		cb:           NewCircuitBreaker("jnt_api", fail, succ, to),
	}
}

func (p *JNTProvider) generateDigest(data string) string {
	hash := md5.Sum([]byte(data + p.privateKey))
	return base64.StdEncoding.EncodeToString(hash[:])
}

// CheckTariff checks estimated shipping cost with J&T Express
func (p *JNTProvider) CheckTariff(ctx context.Context, req domain.TariffRequest) (*domain.TariffResponse, error) {
	if p.apiAccount == "" || p.privateKey == "" {
		return nil, errors.New("J&T Express API credentials are not configured")
	}

	endpoint := fmt.Sprintf("%s/jts-id-open-api/api/tariff/query", p.baseURL)

	payloadObj := map[string]any{
		"senderAreaCode":   req.OriginCode,
		"receiverAreaCode": req.DestinationCode,
		"weight":           req.WeightKG,
		"customerCode":     p.customerCode,
	}
	payloadBytes, _ := json.Marshal(payloadObj)
	payloadStr := string(payloadBytes)
	digest := p.generateDigest(payloadStr)

	formData := url.Values{}
	formData.Set("logistics_interface", payloadStr)
	formData.Set("data_digest", digest)
	formData.Set("msg_type", "TARIFF_QUERY")
	formData.Set("eccompanyid", p.apiAccount)

	if err := p.cb.Allow(); err != nil {
		return nil, fmt.Errorf("J&T circuit breaker open: %w", err)
	}

	resp, err := doHTTPWithRetry(ctx, p.httpClient, func() (*http.Request, error) {
		httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, strings.NewReader(formData.Encode()))
		if err != nil {
			return nil, fmt.Errorf("failed to create J&T tariff request: %w", err)
		}
		httpReq.Header.Set("Content-Type", "application/x-www-form-urlencoded")
		return httpReq, nil
	})
	if err != nil {
		p.cb.RecordFailure()
		return nil, fmt.Errorf("J&T tariff HTTP request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 500 {
		p.cb.RecordFailure()
	} else {
		p.cb.RecordSuccess()
	}

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read J&T tariff response body: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("J&T tariff check returned status %d: %s", resp.StatusCode, string(bodyBytes))
	}

	var jntResp struct {
		Code string `json:"code"`
		Msg  string `json:"msg"`
		Data []struct {
			ProductType string `json:"productType"`
			Price       string `json:"price"`
		} `json:"data"`
	}

	if err := json.Unmarshal(bodyBytes, &jntResp); err != nil {
		return nil, fmt.Errorf("failed to decode J&T tariff response: %w", err)
	}

	if jntResp.Code != "1" || len(jntResp.Data) == 0 {
		return nil, fmt.Errorf("J&T tariff check failed: %s", jntResp.Msg)
	}

	var services []domain.TariffServiceOption
	for _, item := range jntResp.Data {
		priceVal, _ := strconv.ParseFloat(item.Price, 64)
		services = append(services, domain.TariffServiceOption{
			ServiceCode:   item.ProductType,
			ServiceName:   item.ProductType,
			TariffGross:   int64(priceVal), // Konversi float64 → int64 (IDR)
			EstimatedDays: "1-3 hari",
		})
	}

	return &domain.TariffResponse{
		Provider: "J&T Express",
		Services: services,
	}, nil
}

func mapJNTExpressType(serviceType string) string {
	svc := strings.ToUpper(strings.TrimSpace(serviceType))
	switch svc {
	case "J&T ECO", "ECO":
		return "2"
	case "J&T SUPER", "SUPER":
		return "3"
	case "EZ", "REG", "REGULAR":
		return "1"
	default:
		// Default to EZ if unknown
		return "1"
	}
}

// CreateOrder registers a shipment with J&T Express and retrieves airwaybill
func (p *JNTProvider) CreateOrder(ctx context.Context, req domain.LogisticsOrderRequest) (*domain.LogisticsOrderResponse, error) {
	if p.apiAccount == "" || p.privateKey == "" {
		return nil, errors.New("J&T Express API credentials are not configured")
	}

	endpoint := fmt.Sprintf("%s/jts-id-open-api/api/order/create", p.baseURL)

	expressType := mapJNTExpressType(req.ServiceType)

	payloadObj := map[string]any{
		"txlogisticid": req.ReferenceID,
		"actiontype":   "add",
		"sendertype":   "0",
		"ordertype":    "1",
		"sender": map[string]any{
			"name":     req.SenderName,
			"mobile":   req.SenderPhone,
			"address":  req.SenderAddress,
			"areacode": req.OriginCode,
		},
		"receiver": map[string]any{
			"name":     req.ReceiverName,
			"mobile":   req.ReceiverPhone,
			"address":  req.ReceiverAddress,
			"areacode": req.DestinationCode,
		},
		"weight":       req.WeightKG,
		"itemname":     req.ItemDescription,
		"itemvalue":    req.ItemValue,
		"servicetype":  "1",
		"expresstype":  expressType,
		"customerCode": p.customerCode,
	}
	payloadBytes, _ := json.Marshal(payloadObj)
	payloadStr := string(payloadBytes)
	digest := p.generateDigest(payloadStr)

	formData := url.Values{}
	formData.Set("logistics_interface", payloadStr)
	formData.Set("data_digest", digest)
	formData.Set("msg_type", "ORDERCREATE")
	formData.Set("eccompanyid", p.apiAccount)

	if err := p.cb.Allow(); err != nil {
		return nil, fmt.Errorf("J&T circuit breaker open: %w", err)
	}

	resp, err := doHTTPWithRetry(ctx, p.httpClient, func() (*http.Request, error) {
		httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, strings.NewReader(formData.Encode()))
		if err != nil {
			return nil, fmt.Errorf("failed to create J&T order request: %w", err)
		}
		httpReq.Header.Set("Content-Type", "application/x-www-form-urlencoded")
		return httpReq, nil
	})
	if err != nil {
		p.cb.RecordFailure()
		return nil, fmt.Errorf("J&T order HTTP request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 500 {
		p.cb.RecordFailure()
	} else {
		p.cb.RecordSuccess()
	}

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read J&T order response body: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("J&T order creation failed with status %d: %s", resp.StatusCode, string(bodyBytes))
	}

	var jntResp struct {
		Code             string `json:"code"`
		Msg              string `json:"msg"`
		Billcode         string `json:"billcode"`
		Txlogisticid     string `json:"txlogisticid"`
		Sortingcode      string `json:"sortingcode"`
		Totalshippingfee string `json:"totalshippingfee"`
	}

	if err := json.Unmarshal(bodyBytes, &jntResp); err != nil {
		return nil, fmt.Errorf("failed to decode J&T order response: %w", err)
	}

	if jntResp.Code != "1" || jntResp.Billcode == "" {
		return nil, fmt.Errorf("J&T failed to generate AWB: %s", jntResp.Msg)
	}

	feeVal, _ := strconv.ParseFloat(jntResp.Totalshippingfee, 64)

	return &domain.LogisticsOrderResponse{
		ReferenceID: req.ReferenceID,
		AWBNumber:   jntResp.Billcode,
		Provider:    "J&T Express",
		ServiceType: req.ServiceType,
		BookingCode: jntResp.Sortingcode,
		TotalAmount: int64(feeVal),
	}, nil
}

// TrackOrder checks real-time shipment status with J&T Express
func (p *JNTProvider) TrackOrder(ctx context.Context, awb string) (*domain.TrackingResponse, error) {
	if p.apiAccount == "" || p.privateKey == "" {
		return nil, errors.New("J&T Express API credentials are not configured")
	}

	endpoint := fmt.Sprintf("%s/jts-id-open-api/api/track/query", p.baseURL)

	payloadObj := map[string]any{
		"billcodes": awb,
	}
	payloadBytes, _ := json.Marshal(payloadObj)
	payloadStr := string(payloadBytes)
	digest := p.generateDigest(payloadStr)

	formData := url.Values{}
	formData.Set("logistics_interface", payloadStr)
	formData.Set("data_digest", digest)
	formData.Set("msg_type", "TRACKQUERY")
	formData.Set("eccompanyid", p.apiAccount)

	if err := p.cb.Allow(); err != nil {
		return nil, fmt.Errorf("J&T circuit breaker open: %w", err)
	}

	resp, err := doHTTPWithRetry(ctx, p.httpClient, func() (*http.Request, error) {
		httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, strings.NewReader(formData.Encode()))
		if err != nil {
			return nil, fmt.Errorf("failed to create J&T track request: %w", err)
		}
		httpReq.Header.Set("Content-Type", "application/x-www-form-urlencoded")
		return httpReq, nil
	})
	if err != nil {
		p.cb.RecordFailure()
		return nil, fmt.Errorf("J&T track HTTP request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 500 {
		p.cb.RecordFailure()
	} else {
		p.cb.RecordSuccess()
	}

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read J&T track response body: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("J&T tracking returned status %d: %s", resp.StatusCode, string(bodyBytes))
	}

	var jntResp struct {
		Code string `json:"code"`
		Msg  string `json:"msg"`
		Data []struct {
			Billcode string `json:"billcode"`
			Details  []struct {
				ScanDate string `json:"scanDate"`
				Desc     string `json:"desc"`
				ScanType string `json:"scanType"`
			} `json:"details"`
		} `json:"data"`
	}

	if err := json.Unmarshal(bodyBytes, &jntResp); err != nil {
		return nil, fmt.Errorf("failed to decode J&T track response: %w", err)
	}

	if jntResp.Code != "1" || len(jntResp.Data) == 0 {
		return nil, fmt.Errorf("J&T tracking query failed: %s", jntResp.Msg)
	}

	var events []domain.TrackingEvent
	var currentStatus string
	var currentDetail string

	for _, d := range jntResp.Data[0].Details {
		events = append(events, domain.TrackingEvent{
			Timestamp: d.ScanDate,
			Status:    d.ScanType,
			Note:      d.Desc,
		})
		currentStatus = d.ScanType
		currentDetail = d.Desc
	}

	stdStatus := "IN_TRANSIT"
	if strings.Contains(strings.ToUpper(currentDetail), "DELIVERED") || strings.Contains(strings.ToUpper(currentDetail), "TERTERIMA") || strings.EqualFold(currentStatus, "Signed") {
		stdStatus = "DELIVERED"
	} else if strings.Contains(strings.ToUpper(currentDetail), "PICKUP") || strings.EqualFold(currentStatus, "Picked up") {
		stdStatus = "MANIFESTED"
	}

	return &domain.TrackingResponse{
		AWBNumber:    awb,
		Provider:     "J&T Express",
		Status:       stdStatus,
		StatusDetail: currentDetail,
		History:      events,
	}, nil
}
