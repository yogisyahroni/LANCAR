package platform

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

type OrderClient struct {
	baseURL   string
	jwtSecret []byte
	client    *http.Client
}

func NewOrderClient(baseURL, jwtSecret string) *OrderClient {
	return &OrderClient{
		baseURL: strings.TrimRight(baseURL, "/"), jwtSecret: []byte(jwtSecret),
		client: &http.Client{Timeout: 12 * time.Second},
	}
}

func (c *OrderClient) userToken(userID string) (string, error) {
	if strings.TrimSpace(userID) == "" || len(c.jwtSecret) == 0 {
		return "", errors.New("developer order identity is not configured")
	}
	now := time.Now().UTC()
	claims := jwt.MapClaims{
		"user_id": userID, "role": "customer", "permissions": []string{"developer_api"},
		"iss": "tembus-auth-service", "sub": userID,
		"iat": now.Unix(), "exp": now.Add(5 * time.Minute).Unix(),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(c.jwtSecret)
}

func (c *OrderClient) request(ctx context.Context, method, path, ownerUserID string, body []byte, idempotencyKey string) (int, []byte, error) {
	var reader io.Reader
	if len(body) > 0 {
		reader = bytes.NewReader(body)
	}
	req, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, reader)
	if err != nil {
		return 0, nil, err
	}
	req.Header.Set("Accept", "application/json")
	if len(body) > 0 {
		req.Header.Set("Content-Type", "application/json")
	}
	if ownerUserID != "" {
		token, err := c.userToken(ownerUserID)
		if err != nil {
			return 0, nil, err
		}
		req.Header.Set("Authorization", "Bearer "+token)
	}
	if idempotencyKey != "" {
		req.Header.Set("X-Idempotency-Key", idempotencyKey)
	}
	if correlationID := strings.TrimSpace(os.Getenv("DEVELOPER_CORRELATION_ID")); correlationID != "" {
		req.Header.Set("X-Correlation-ID", correlationID)
	}
	response, err := c.client.Do(req)
	if err != nil {
		return 0, nil, fmt.Errorf("call order-service: %w", err)
	}
	defer response.Body.Close()
	responseBody, readErr := io.ReadAll(io.LimitReader(response.Body, maxRequestBody))
	if readErr != nil {
		return response.StatusCode, nil, fmt.Errorf("read order-service response: %w", readErr)
	}
	return response.StatusCode, responseBody, nil
}

func (c *OrderClient) Quote(ctx context.Context, ownerUserID string, body []byte, idempotencyKey string) (int, []byte, error) {
	return c.request(ctx, http.MethodPost, "/api/v1/pricing/estimate", ownerUserID, body, idempotencyKey)
}

func (c *OrderClient) Create(ctx context.Context, ownerUserID string, body []byte, idempotencyKey string) (int, []byte, error) {
	return c.request(ctx, http.MethodPost, "/api/v1/orders", ownerUserID, body, idempotencyKey)
}

func (c *OrderClient) Get(ctx context.Context, ownerUserID, orderID string) (int, []byte, error) {
	return c.request(ctx, http.MethodGet, "/api/v1/orders/detail?id="+url.QueryEscape(orderID), ownerUserID, nil, "")
}

func (c *OrderClient) Cancel(ctx context.Context, ownerUserID, orderID string, body []byte, idempotencyKey string) (int, []byte, error) {
	return c.request(ctx, http.MethodPost, "/api/v1/orders/status", ownerUserID, body, idempotencyKey)
}

func (c *OrderClient) Track(ctx context.Context, ownerUserID, orderID string) (int, []byte, error) {
	return c.request(ctx, http.MethodGet, "/api/v1/tracking?order_id="+url.QueryEscape(orderID), ownerUserID, nil, "")
}

func statusBody(status int, body []byte) (int, []byte) {
	if status >= 200 && status < 300 {
		return status, body
	}
	if status >= 400 && status < 500 && len(body) > 0 {
		return status, body
	}
	encoded, _ := json.Marshal(map[string]any{
		"status": "error", "code": "ERR_ORDER_SERVICE_UNAVAILABLE",
		"message": "Order service is temporarily unavailable", "retryable": true,
	})
	return http.StatusBadGateway, encoded
}
