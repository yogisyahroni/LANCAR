package utils

import (
	"errors"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

var (
	ErrInvalidToken = errors.New("invalid token")
	ErrExpiredToken = errors.New("token expired")
)

// GetAccessTokenTTL returns the configured access token TTL.
// Reads JWT_ACCESS_TOKEN_TTL_MINUTES env var, defaults to 15 minutes.
func GetAccessTokenTTL() time.Duration {
	raw := strings.TrimSpace(os.Getenv("JWT_ACCESS_TOKEN_TTL_MINUTES"))
	if raw == "" {
		return 15 * time.Minute
	}
	minutes, err := strconv.Atoi(raw)
	if err != nil || minutes < 1 {
		return 15 * time.Minute
	}
	return time.Duration(minutes) * time.Minute
}

// GetRefreshTokenTTL returns the configured refresh token TTL.
// Reads JWT_REFRESH_TOKEN_TTL_HOURS env var, defaults to 168 hours (7 days).
func GetRefreshTokenTTL() time.Duration {
	raw := strings.TrimSpace(os.Getenv("JWT_REFRESH_TOKEN_TTL_HOURS"))
	if raw == "" {
		return 168 * time.Hour
	}
	hours, err := strconv.Atoi(raw)
	if err != nil || hours < 1 {
		return 168 * time.Hour
	}
	return time.Duration(hours) * time.Hour
}

type Claims struct {
	UserID       string   `json:"user_id"`
	Role         string   `json:"role"`
	Permissions  []string `json:"permissions"`
	TOTPVerified bool     `json:"totp_verified"`
	jwt.RegisteredClaims
}

func GenerateToken(userID string, role string, permissions []string, totpVerified bool, duration time.Duration) (string, error) {
	secret := os.Getenv("JWT_SECRET")
	if secret == "" {
		return "", errors.New("JWT_SECRET environment variable is not set")
	}

	now := time.Now()
	claims := &Claims{
		UserID:       userID,
		Role:         role,
		Permissions:  permissions,
		TOTPVerified: totpVerified,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(now.Add(duration)),
			IssuedAt:  jwt.NewNumericDate(now),
			NotBefore: jwt.NewNumericDate(now),
			ID:        generateJTI(),
			Issuer:    getEnv("JWT_ISSUER", "tembus-auth-service"),
			Subject:   userID,
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(secret))
}

func generateJTI() string {
	return strconv.FormatInt(time.Now().UnixNano(), 36)
}

func getEnv(key, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return fallback
}

func ValidateToken(tokenString string) (*Claims, error) {
	secret := os.Getenv("JWT_SECRET")
	if secret == "" {
		return nil, errors.New("JWT_SECRET environment variable is not set")
	}

	token, err := jwt.ParseWithClaims(tokenString, &Claims{}, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("unexpected signing method")
		}
		return []byte(secret), nil
	})

	if err != nil {
		if errors.Is(err, jwt.ErrTokenExpired) {
			return nil, ErrExpiredToken
		}
		return nil, ErrInvalidToken
	}

	claims, ok := token.Claims.(*Claims)
	if !ok || !token.Valid {
		return nil, ErrInvalidToken
	}

	return claims, nil
}
