package platform

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"
)

var (
	ErrInvalidCredentials  = errors.New("invalid developer credentials")
	ErrInsufficientScope   = errors.New("developer credential does not grant this scope")
	ErrIdempotencyKey      = errors.New("a valid idempotency key is required")
	ErrIdempotencyConflict = errors.New("idempotency key conflicts with a different request")
	ErrIdempotencyRunning  = errors.New("idempotent request is still processing")
)

const (
	credentialPrefix = "lcr"
	maxRequestBody   = 64 * 1024
	maxWebhookEvents = 32
)

var clientIDPattern = regexp.MustCompile(`^cli_[a-z0-9]{16}$`)
var eventTypePattern = regexp.MustCompile(`^[a-z0-9][a-z0-9_.:-]{0,79}$`)
var idempotencyPattern = regexp.MustCompile(`^[A-Za-z0-9._:-]{12,160}$`)

// Client is the authenticated external application's server-side identity.
// The API secret is never part of this structure or persisted in plaintext.
type Client struct {
	ID             string
	ClientID       string
	OwnerUserID    string
	Name           string
	Environment    string
	Scopes         []string
	QuotaPerMinute int
}

type APIKeyCredential struct {
	ClientID    string `json:"client_id"`
	Environment string `json:"environment"`
	APIKey      string `json:"api_key"`
}

func randomURLToken(bytes int) (string, error) {
	value := make([]byte, bytes)
	if _, err := rand.Read(value); err != nil {
		return "", fmt.Errorf("generate secure token: %w", err)
	}
	return base64.RawURLEncoding.EncodeToString(value), nil
}

func randomHexToken(bytes int) (string, error) {
	value := make([]byte, bytes)
	if _, err := rand.Read(value); err != nil {
		return "", fmt.Errorf("generate secure hex token: %w", err)
	}
	return hex.EncodeToString(value), nil
}

func newClientID() (string, error) {
	token, err := randomHexToken(8)
	if err != nil {
		return "", fmt.Errorf("generate client id: %w", err)
	}
	return "cli_" + token, nil
}

func GenerateAPIKey(environment, clientID string) (string, error) {
	secret, err := randomHexToken(32)
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("%s_%s_%s_%s", credentialPrefix, environment, clientID, secret), nil
}

func hashSecret(secret string) ([]byte, error) {
	return bcrypt.GenerateFromPassword([]byte(secret), bcrypt.DefaultCost)
}

func verifySecret(hash []byte, secret string) bool {
	return bcrypt.CompareHashAndPassword(hash, []byte(secret)) == nil
}

func parseAPIKey(value string) (environment, clientID, secret string, err error) {
	value = strings.TrimSpace(value)
	if strings.HasPrefix(value, "Bearer ") {
		value = strings.TrimSpace(strings.TrimPrefix(value, "Bearer "))
	}
	parts := strings.Split(value, "_")
	if len(parts) != 5 || parts[0] != credentialPrefix || (parts[1] != "sandbox" && parts[1] != "live") {
		return "", "", "", ErrInvalidCredentials
	}
	clientID = parts[2] + "_" + parts[3]
	if !clientIDPattern.MatchString(clientID) || parts[4] == "" {
		return "", "", "", ErrInvalidCredentials
	}
	return parts[1], clientID, parts[4], nil
}

func hasScope(scopes []string, required string) bool {
	for _, scope := range scopes {
		if scope == required || scope == "*" {
			return true
		}
	}
	return false
}

func RequireScope(client Client, scope string) error {
	if !hasScope(client.Scopes, scope) {
		return ErrInsufficientScope
	}
	return nil
}

func validIdempotencyKey(value string) bool {
	return idempotencyPattern.MatchString(strings.TrimSpace(value))
}

func validEventTypes(events []string) bool {
	if len(events) == 0 || len(events) > maxWebhookEvents {
		return false
	}
	for _, event := range events {
		if event != "*" && !eventTypePattern.MatchString(event) {
			return false
		}
	}
	return true
}

// SecretBox encrypts webhook signing secrets at rest. The master key is only
// loaded by the delivery service; it is never returned through an API.
type SecretBox struct {
	block cipher.Block
}

func NewSecretBox(key []byte) (*SecretBox, error) {
	if len(key) != 32 {
		return nil, errors.New("developer webhook encryption key must be 32 bytes")
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, fmt.Errorf("create webhook secret cipher: %w", err)
	}
	return &SecretBox{block: block}, nil
}

func (b *SecretBox) Seal(plain string) ([]byte, error) {
	gcm, err := cipher.NewGCM(b.block)
	if err != nil {
		return nil, err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return nil, err
	}
	return gcm.Seal(nonce, nonce, []byte(plain), nil), nil
}

func (b *SecretBox) Open(ciphertext []byte) (string, error) {
	gcm, err := cipher.NewGCM(b.block)
	if err != nil {
		return "", err
	}
	if len(ciphertext) < gcm.NonceSize() {
		return "", errors.New("invalid encrypted webhook secret")
	}
	nonce, payload := ciphertext[:gcm.NonceSize()], ciphertext[gcm.NonceSize():]
	plain, err := gcm.Open(nil, nonce, payload, nil)
	if err != nil {
		return "", errors.New("invalid encrypted webhook secret")
	}
	return string(plain), nil
}

func NewEncryptionKey(raw string) ([]byte, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil, errors.New("DEVELOPER_WEBHOOK_ENCRYPTION_KEY is required")
	}
	if decoded, err := hex.DecodeString(raw); err == nil && len(decoded) == 32 {
		return decoded, nil
	}
	if decoded, err := base64.RawStdEncoding.DecodeString(raw); err == nil && len(decoded) == 32 {
		return decoded, nil
	}
	if len(raw) == 32 {
		return []byte(raw), nil
	}
	return nil, errors.New("DEVELOPER_WEBHOOK_ENCRYPTION_KEY must be 32 raw, hex, or base64 bytes")
}

func SignWebhook(secret string, timestamp time.Time, body []byte) string {
	message := fmt.Sprintf("%d.%s", timestamp.Unix(), body)
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write([]byte(message))
	return "sha256=" + hex.EncodeToString(mac.Sum(nil))
}

func constantTimeEqual(left, right string) bool {
	return subtle.ConstantTimeCompare([]byte(left), []byte(right)) == 1
}

func validateWebhookURL(raw string, allowLocalhost bool) error {
	parsed, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || parsed.Host == "" || parsed.User != nil || parsed.RawQuery != "" || parsed.Fragment != "" {
		return errors.New("webhook url must be an absolute URL without credentials, query or fragment")
	}
	if parsed.Scheme != "https" && !(allowLocalhost && parsed.Scheme == "http") {
		return errors.New("webhook url must use https")
	}
	host := parsed.Hostname()
	if host == "" {
		return errors.New("webhook url must include a host")
	}
	if isLocalhostHost(host) {
		if !allowLocalhost {
			return errors.New("webhook url cannot target localhost")
		}
		return nil
	}
	if ip := net.ParseIP(host); ip != nil && isBlockedWebhookIP(ip) {
		return errors.New("webhook url cannot target a private network address")
	}
	return nil
}

func isLocalhostHost(host string) bool {
	host = strings.ToLower(strings.TrimSuffix(host, "."))
	return host == "localhost" || host == "localhost.localdomain" || host == "::1" || host == "127.0.0.1"
}

func isBlockedWebhookIP(ip net.IP) bool {
	if ip == nil {
		return true
	}
	return ip.IsPrivate() || ip.IsLoopback() || ip.IsLinkLocalUnicast() ||
		ip.IsUnspecified() || ip.IsMulticast()
}

func webhookHTTPClient(allowLocalhost bool) *http.Client {
	dialer := &net.Dialer{Timeout: 5 * time.Second}
	transport := &http.Transport{
		Proxy: nil,
		DialContext: func(ctx context.Context, network, address string) (net.Conn, error) {
			host, port, err := net.SplitHostPort(address)
			if err != nil {
				return nil, fmt.Errorf("split webhook address: %w", err)
			}
			ips, err := net.LookupIP(host)
			if err != nil {
				return nil, fmt.Errorf("resolve webhook host: %w", err)
			}
			localHost := allowLocalhost && isLocalhostHost(host)
			for _, ip := range ips {
				if isBlockedWebhookIP(ip) && !(localHost && ip.IsLoopback()) {
					continue
				}
				connection, dialErr := dialer.DialContext(ctx, network, net.JoinHostPort(ip.String(), port))
				if dialErr == nil {
					return connection, nil
				}
			}
			return nil, errors.New("webhook host resolved only to blocked or unreachable addresses")
		},
	}
	return &http.Client{Timeout: 10 * time.Second, Transport: transport}
}

func sanitizeJSON(value any) any {
	switch typed := value.(type) {
	case map[string]any:
		result := make(map[string]any, len(typed))
		for key, child := range typed {
			normalized := strings.ToLower(strings.ReplaceAll(key, "-", "_"))
			if strings.Contains(normalized, "secret") || strings.Contains(normalized, "token") ||
				strings.Contains(normalized, "password") || strings.Contains(normalized, "authorization") ||
				strings.Contains(normalized, "raw_payload") || strings.Contains(normalized, "payment") ||
				strings.Contains(normalized, "proof") || normalized == "email" || normalized == "phone" ||
				strings.Contains(normalized, "address") {
				result[key] = "[REDACTED]"
				continue
			}
			result[key] = sanitizeJSON(child)
		}
		return result
	case []any:
		result := make([]any, len(typed))
		for index, child := range typed {
			result[index] = sanitizeJSON(child)
		}
		return result
	default:
		return value
	}
}

func sanitizedPayload(raw []byte) []byte {
	var value any
	if json.Unmarshal(raw, &value) != nil {
		return []byte(`{"data":"[REDACTED]"}`)
	}
	encoded, err := json.Marshal(sanitizeJSON(value))
	if err != nil {
		return []byte(`{"data":"[REDACTED]"}`)
	}
	return encoded
}

func retryableWebhookResponse(status int) bool {
	return status == 0 || status == 408 || status == 425 || status == 429 || status >= 500
}

func nextRetry(attempt int, now time.Time) time.Time {
	backoff := 30 * time.Second
	for i := 1; i < attempt && backoff < 30*time.Minute; i++ {
		backoff *= 2
	}
	if backoff > 30*time.Minute {
		backoff = 30 * time.Minute
	}
	return now.Add(backoff)
}
