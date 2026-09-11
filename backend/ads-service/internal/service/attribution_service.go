package service

import (
	"errors"
	"time"

	"tembus/ads-service/internal/domain"
)

func ValidateAttribution(c domain.Campaign) error {
	if c.Attribution.WindowMinutes <= 0 || c.Attribution.WindowMinutes > 30*24*60 {
		return errors.New("attribution window outside governed bounds")
	}
	if c.Attribution.Version == "" || c.Attribution.Model == "" {
		return errors.New("attribution model/version is immutable and required")
	}
	return nil
}

func IsWithinAttributionWindow(clickedAt, orderAt time.Time, windowMinutes int) bool {
	if orderAt.Before(clickedAt) {
		return false
	}
	return orderAt.Sub(clickedAt) <= time.Duration(windowMinutes)*time.Minute
}
