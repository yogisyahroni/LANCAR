// Package alerting provides automated webhook notifications for critical
// operational thresholds. Supports Slack and Telegram.
//
// Configuration via environment variables:
//
//	ALERT_SLACK_WEBHOOK_URL     — Slack incoming webhook URL (empty = disabled)
//	ALERT_TELEGRAM_BOT_TOKEN    — Telegram bot token (empty = disabled)
//	ALERT_TELEGRAM_CHAT_ID      — Telegram chat ID for alerts
//	ALERT_NO_DRIVER_THRESHOLD   — % of orders with NO_DRIVER_FOUND (default: 10)
//	ALERT_LATENCY_P95_MS        — p95 latency threshold in ms (default: 2000)
//	ALERT_CIRCUIT_OPEN_ENABLED  — alert on circuit breaker open (default: true)
package alerting

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"time"
)

type AlertLevel string

const (
	AlertCritical AlertLevel = "critical"
	AlertWarning  AlertLevel = "warning"
	AlertInfo     AlertLevel = "info"
)

type Alert struct {
	Level    AlertLevel `json:"level"`
	Title    string     `json:"title"`
	Message  string     `json:"message"`
	Metric   string     `json:"metric,omitempty"`
	Value    float64    `json:"value,omitempty"`
	Threshold float64   `json:"threshold,omitempty"`
}

var (
	slackWebhookURL string
	telegramToken   string
	telegramChatID  string

	noDriverThreshold float64
	latencyThreshold  float64
	circuitAlertEnabled bool
)

func init() {
	slackWebhookURL = strings.TrimSpace(os.Getenv("ALERT_SLACK_WEBHOOK_URL"))
	telegramToken = strings.TrimSpace(os.Getenv("ALERT_TELEGRAM_BOT_TOKEN"))
	telegramChatID = strings.TrimSpace(os.Getenv("ALERT_TELEGRAM_CHAT_ID"))

	noDriverThreshold = 10.0
	latencyThreshold = 2000.0
	circuitAlertEnabled = true

	log.Printf("[alerting] Slack=%v Telegram=%v", slackWebhookURL != "", telegramToken != "")
}

// Send dispatches an alert to all configured channels.
func Send(alert Alert) {
	if slackWebhookURL != "" {
		go sendSlack(alert)
	}
	if telegramToken != "" && telegramChatID != "" {
		go sendTelegram(alert)
	}
}

// AlertNoDriverFound sends an alert when NO_DRIVER_FOUND rate exceeds threshold.
func AlertNoDriverFound(ratePct float64, totalOrders int, failedOrders int) {
	if ratePct < noDriverThreshold {
		return
	}
	Send(Alert{
		Level:     AlertCritical,
		Title:     "🚨 No Driver Found Rate Critical",
		Message:   fmt.Sprintf("%.1f%% orders (%d/%d) failed to find a courier in the last hour. Threshold: %.0f%%",
			ratePct, failedOrders, totalOrders, noDriverThreshold),
		Metric:    "no_driver_found_rate",
		Value:     ratePct,
		Threshold: noDriverThreshold,
	})
}

// AlertHighLatency sends an alert when p95 latency exceeds threshold.
func AlertHighLatency(p95Ms float64, endpoint string) {
	if p95Ms < latencyThreshold {
		return
	}
	Send(Alert{
		Level:     AlertWarning,
		Title:     "⚠️ High API Latency",
		Message:   fmt.Sprintf("p95 latency for %s is %.0fms (threshold: %.0fms)", endpoint, p95Ms, latencyThreshold),
		Metric:    "latency_p95_ms",
		Value:     p95Ms,
		Threshold: latencyThreshold,
	})
}

// AlertCircuitOpen sends an alert when a circuit breaker opens.
func AlertCircuitOpen(serviceName string) {
	if !circuitAlertEnabled {
		return
	}
	Send(Alert{
		Level:   AlertCritical,
		Title:   "🔴 Circuit Breaker OPEN",
		Message: fmt.Sprintf("Circuit breaker for %s has opened. Service is degraded.", serviceName),
		Metric:  "circuit_open",
	})
}

func sendSlack(alert Alert) {
	color := map[AlertLevel]string{
		AlertCritical: "#FF0000",
		AlertWarning:  "#FFA500",
		AlertInfo:     "#36A64F",
	}[alert.Level]

	payload := map[string]interface{}{
		"attachments": []map[string]interface{}{
			{
				"color":  color,
				"title":  alert.Title,
				"text":   alert.Message,
				"fields": []map[string]interface{}{
					{"title": "Metric", "value": alert.Metric, "short": true},
					{"title": "Value", "value": fmt.Sprintf("%.1f", alert.Value), "short": true},
					{"title": "Threshold", "value": fmt.Sprintf("%.1f", alert.Threshold), "short": true},
				},
				"footer":     "TEMBUS Production Alerting",
				"ts":         time.Now().Unix(),
			},
		},
	}

	body, _ := json.Marshal(payload)
	resp, err := http.Post(slackWebhookURL, "application/json", bytes.NewReader(body))
	if err != nil {
		log.Printf("[alerting] Slack send failed: %v", err)
		return
	}
	resp.Body.Close()
}

func sendTelegram(alert Alert) {
	emoji := map[AlertLevel]string{
		AlertCritical: "🔴",
		AlertWarning:  "🟡",
		AlertInfo:     "🟢",
	}[alert.Level]

	text := fmt.Sprintf("%s *%s*\n\n%s\n\n📊 %s: %.1f (threshold: %.1f)",
		emoji, alert.Title, alert.Message, alert.Metric, alert.Value, alert.Threshold)

	url := fmt.Sprintf("https://api.telegram.org/bot%s/sendMessage", telegramToken)
	payload := map[string]string{
		"chat_id":    telegramChatID,
		"text":       text,
		"parse_mode": "Markdown",
	}
	body, _ := json.Marshal(payload)
	resp, err := http.Post(url, "application/json", bytes.NewReader(body))
	if err != nil {
		log.Printf("[alerting] Telegram send failed: %v", err)
		return
	}
	resp.Body.Close()
}
