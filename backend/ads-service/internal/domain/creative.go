package domain

import (
	"errors"
	"net/url"
	"regexp"
	"strings"
)

type Creative struct {
	ID          string `json:"id,omitempty"`
	Headline    string `json:"headline"`
	Body        string `json:"body,omitempty"`
	ImageURL    string `json:"image_url,omitempty"`
	Destination string `json:"destination,omitempty"`
	AltText     string `json:"alt_text,omitempty"`
}

var prohibitedClaims = regexp.MustCompile(`(?i)(diskon|discount|eta|rating|bintang|stars?|gratis|free|termurah|terbaik)`)

func (c Creative) Validate() error {
	if len(strings.TrimSpace(c.Headline)) < 3 || len(c.Headline) > 120 {
		return errors.New("creative headline must be 3-120 characters")
	}
	if len(c.Body) > 240 {
		return errors.New("creative body must be at most 240 characters")
	}
	if len(strings.TrimSpace(c.AltText)) < 3 {
		return errors.New("creative alt_text is required")
	}
	if prohibitedClaims.MatchString(c.Headline + " " + c.Body) {
		return errors.New("creative cannot claim discount, ETA, rating or unsupported superiority")
	}
	if strings.TrimSpace(c.ImageURL) != "" {
		u, err := url.Parse(c.ImageURL)
		if err != nil || u.Scheme != "https" || u.Host == "" {
			return errors.New("creative image_url must be a valid HTTPS URL")
		}
	}
	if strings.TrimSpace(c.Destination) != "" {
		u, err := url.Parse(c.Destination)
		if err != nil || (u.Scheme != "https" && u.Scheme != "tembus") || u.Host == "" && u.Scheme == "https" {
			return errors.New("creative destination is invalid")
		}
	}
	return nil
}
