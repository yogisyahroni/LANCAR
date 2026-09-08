package experiment

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"sort"
	"strings"
)

const (
	StatusDraft    = "draft"
	StatusRunning  = "running"
	StatusKilled   = "killed"
	StatusArchived = "archived"
)

var (
	keyPattern       = regexp.MustCompile(`^[a-z0-9][a-z0-9._-]{2,119}$`)
	namespacePattern = regexp.MustCompile(`^[a-z0-9][a-z0-9._-]{1,79}$`)
	servicePattern   = regexp.MustCompile(`^[a-z0-9][a-z0-9._-]{1,79}$`)
	versionPattern   = regexp.MustCompile(`^[0-9]+(?:\.[0-9]+){0,3}$`)
)

// Safe product attributes are intentionally allow-listed. Identity, health,
// precise location, and protected-class data never enter assignment rules.
var safeAttributeNames = map[string]struct{}{
	"amount_band":            {},
	"device_reputation_band": {},
	"gps_integrity":          {},
	"handoff_distance_band":  {},
	"ip_reputation_band":     {},
	"market_code":            {},
	"order_age_band":         {},
	"platform":               {},
	"service_code":           {},
	"velocity_band":          {},
}

var forbiddenTreatmentKeys = map[string]struct{}{
	"amount": {}, "commission": {}, "cost": {}, "currency": {}, "discount": {},
	"fee": {}, "money": {}, "payment": {}, "payout": {}, "price": {},
	"refund": {}, "tax": {}, "total": {},
}

type Targeting struct {
	MarketCodes    []string            `json:"market_codes,omitempty"`
	CityCodes      []string            `json:"city_codes,omitempty"`
	AppVersions    []string            `json:"app_versions,omitempty"`
	AppVersionMin  string              `json:"app_version_min,omitempty"`
	AppVersionMax  string              `json:"app_version_max,omitempty"`
	ServiceCodes   []string            `json:"service_codes,omitempty"`
	UserCohorts    []string            `json:"user_cohorts,omitempty"`
	SafeAttributes map[string][]string `json:"safe_attributes,omitempty"`
}

type Variant struct {
	Key     string                 `json:"key"`
	Weight  int                    `json:"weight_basis_points"`
	Payload map[string]interface{} `json:"payload,omitempty"`
}

type Guardrail struct {
	Metric     string   `json:"metric"`
	EventTypes []string `json:"event_types"`
	Threshold  float64  `json:"threshold"`
	Direction  string   `json:"direction"`
}

type Experiment struct {
	ID         string
	Key        string
	Name       string
	Namespace  string
	Status     string
	Version    int
	Targeting  Targeting
	Variants   []Variant
	Guardrails []Guardrail
	KillReason string
}

type EvaluationContext struct {
	MarketCode     string
	CityCode       string
	AppVersion     string
	ServiceCode    string
	UserCohort     string
	SafeAttributes map[string]string
}

type Assignment struct {
	ID                string                 `json:"assignment_id"`
	ExperimentKey     string                 `json:"experiment_key"`
	ExperimentID      string                 `json:"experiment_id"`
	Namespace         string                 `json:"namespace"`
	SubjectType       string                 `json:"subject_type"`
	SubjectHash       string                 `json:"-"`
	Variant           string                 `json:"variant"`
	Bucket            int                    `json:"bucket"`
	AssignmentKey     string                 `json:"assignment_key"`
	ExperimentVersion int                    `json:"experiment_version"`
	Payload           map[string]interface{} `json:"payload,omitempty"`
}

type AssignmentDecision struct {
	Eligible   bool        `json:"eligible"`
	Reason     string      `json:"reason,omitempty"`
	Assignment *Assignment `json:"assignment,omitempty"`
}

type Exposure struct {
	ID              string `json:"exposure_id"`
	AlreadyRecorded bool   `json:"already_recorded"`
}

var (
	ErrExperimentNotFound = errors.New("experiment not found")
	ErrNamespaceConflict  = errors.New("subject already assigned in exclusive namespace")
	ErrNotTreatment       = errors.New("only treatment assignments can be exposed")
	ErrAssignmentMismatch = errors.New("assignment does not belong to subject")
	ErrExperimentDisabled = errors.New("experiment is disabled")
)

func DefaultGuardrails() []Guardrail {
	return []Guardrail{
		{Metric: "crash_error_rate", EventTypes: []string{"app.crash", "app.error"}, Threshold: 0, Direction: "max"},
		{Metric: "cancellation_rate", EventTypes: []string{"order.cancelled"}, Threshold: 0, Direction: "max"},
		{Metric: "refund_rate", EventTypes: []string{"refund.created", "payment.refunded"}, Threshold: 0, Direction: "max"},
		{Metric: "eta_sla", EventTypes: []string{"sla.measured"}, Threshold: 0, Direction: "max"},
		{Metric: "support_contact_rate", EventTypes: []string{"support.contact.created"}, Threshold: 0, Direction: "max"},
	}
}

func ValidateExperiment(exp Experiment) error {
	if !keyPattern.MatchString(strings.TrimSpace(exp.Key)) {
		return fmt.Errorf("experiment key is invalid")
	}
	if !namespacePattern.MatchString(strings.TrimSpace(exp.Namespace)) {
		return fmt.Errorf("experiment namespace is invalid")
	}
	if strings.TrimSpace(exp.Name) == "" || len(exp.Name) > 200 {
		return fmt.Errorf("experiment name is required")
	}
	switch exp.Status {
	case StatusDraft, StatusRunning, StatusKilled, StatusArchived:
	default:
		return fmt.Errorf("experiment status is invalid")
	}
	if exp.Version < 1 {
		return fmt.Errorf("experiment version must be positive")
	}
	if len(exp.Variants) < 2 || len(exp.Variants) > 20 {
		return fmt.Errorf("at least two variants are required")
	}
	seen := make(map[string]struct{}, len(exp.Variants))
	weightTotal := 0
	for _, variant := range exp.Variants {
		if !keyPattern.MatchString(strings.TrimSpace(variant.Key)) || variant.Weight <= 0 {
			return fmt.Errorf("variant key/weight is invalid")
		}
		if _, ok := seen[variant.Key]; ok {
			return fmt.Errorf("variant keys must be unique")
		}
		seen[variant.Key] = struct{}{}
		weightTotal += variant.Weight
		if err := validateTreatmentPayload(variant.Payload); err != nil {
			return fmt.Errorf("variant %s: %w", variant.Key, err)
		}
	}
	if weightTotal != 10000 {
		return fmt.Errorf("variant weights must total 10000 basis points")
	}
	if err := validateTargeting(exp.Targeting); err != nil {
		return err
	}
	if len(exp.Guardrails) == 0 {
		return fmt.Errorf("at least one guardrail is required")
	}
	for _, guardrail := range exp.Guardrails {
		if strings.TrimSpace(guardrail.Metric) == "" || len(guardrail.EventTypes) == 0 || guardrail.Threshold < 0 {
			return fmt.Errorf("guardrail is invalid")
		}
		if guardrail.Direction != "max" && guardrail.Direction != "min" {
			return fmt.Errorf("guardrail direction is invalid")
		}
	}
	return nil
}

func validateTargeting(targeting Targeting) error {
	for _, value := range append(append(append(append([]string{}, targeting.MarketCodes...), targeting.CityCodes...), targeting.AppVersions...), targeting.ServiceCodes...) {
		if strings.TrimSpace(value) == "" || len(value) > 100 {
			return fmt.Errorf("targeting value is invalid")
		}
	}
	for _, value := range targeting.UserCohorts {
		if strings.TrimSpace(value) == "" || len(value) > 100 {
			return fmt.Errorf("user cohort is invalid")
		}
	}
	for name, values := range targeting.SafeAttributes {
		if _, ok := safeAttributeNames[strings.ToLower(strings.TrimSpace(name))]; !ok {
			return fmt.Errorf("safe attribute %q is not allowed", name)
		}
		if len(values) == 0 || len(values) > 50 {
			return fmt.Errorf("safe attribute %q values are invalid", name)
		}
	}
	for field, value := range map[string]string{"app_version_min": targeting.AppVersionMin, "app_version_max": targeting.AppVersionMax} {
		if value != "" && !versionPattern.MatchString(value) {
			return fmt.Errorf("%s is invalid", field)
		}
	}
	return nil
}

func validateTreatmentPayload(payload map[string]interface{}) error {
	var walk func(interface{}) error
	walk = func(value interface{}) error {
		if list, ok := value.([]interface{}); ok {
			for _, item := range list {
				if err := walk(item); err != nil {
					return err
				}
			}
			return nil
		}
		object, ok := value.(map[string]interface{})
		if !ok {
			return nil
		}
		for key, item := range object {
			normalized := strings.ToLower(strings.TrimSpace(key))
			for forbidden := range forbiddenTreatmentKeys {
				if normalized == forbidden || strings.Contains(normalized, forbidden) {
					return fmt.Errorf("financial field %q is not allowed in experiment treatment", key)
				}
			}
			if err := walk(item); err != nil {
				return err
			}
		}
		return nil
	}
	return walk(payload)
}

func Resolve(exp Experiment, subjectType, subjectID string, context EvaluationContext, secret []byte) (*Assignment, string, error) {
	if err := ValidateExperiment(exp); err != nil {
		return nil, "invalid_experiment", err
	}
	if exp.Status != StatusRunning {
		return nil, "disabled", nil
	}
	if strings.TrimSpace(subjectType) == "" || strings.TrimSpace(subjectID) == "" {
		return nil, "subject_required", nil
	}
	if !matchesTarget(exp.Targeting, context) {
		return nil, "outside_targeting", nil
	}
	if len(secret) == 0 {
		return nil, "assignment_secret_unavailable", errors.New("experiment assignment secret is unavailable")
	}
	assignmentKey := pseudonymousSubjectKey(secret, exp.Key, subjectType, subjectID)
	subjectHash := pseudonymousSubjectHash(secret, subjectType, subjectID)
	digest := hmacDigest(secret, exp.Key+"\x00"+strings.ToLower(strings.TrimSpace(subjectType))+"\x00"+strings.TrimSpace(subjectID))
	bucket := int(binary.BigEndian.Uint32(digest[:4]) % 10000)
	variant := selectVariant(exp.Variants, bucket)
	return &Assignment{
		ExperimentKey: exp.Key, ExperimentID: exp.ID, Namespace: exp.Namespace,
		SubjectType: strings.ToLower(strings.TrimSpace(subjectType)),
		SubjectHash: subjectHash,
		Variant:     variant.Key, Bucket: bucket, AssignmentKey: assignmentKey,
		ExperimentVersion: exp.Version, Payload: variant.Payload,
	}, "assigned", nil
}

func matchesTarget(targeting Targeting, context EvaluationContext) bool {
	if !matchesAny(targeting.MarketCodes, context.MarketCode) || !matchesAny(targeting.CityCodes, context.CityCode) || !matchesAny(targeting.ServiceCodes, context.ServiceCode) || !matchesAny(targeting.UserCohorts, context.UserCohort) {
		return false
	}
	if len(targeting.AppVersions) > 0 && !containsFold(targeting.AppVersions, context.AppVersion) {
		return false
	}
	if targeting.AppVersionMin != "" && compareVersions(context.AppVersion, targeting.AppVersionMin) < 0 {
		return false
	}
	if targeting.AppVersionMax != "" && compareVersions(context.AppVersion, targeting.AppVersionMax) > 0 {
		return false
	}
	for name, values := range targeting.SafeAttributes {
		if !containsFold(values, context.SafeAttributes[strings.ToLower(name)]) {
			return false
		}
	}
	return true
}

func matchesAny(values []string, candidate string) bool {
	return len(values) == 0 || containsFold(values, candidate)
}

func containsFold(values []string, candidate string) bool {
	for _, value := range values {
		if strings.EqualFold(strings.TrimSpace(value), strings.TrimSpace(candidate)) {
			return true
		}
	}
	return false
}

func compareVersions(left, right string) int {
	parse := func(value string) []int {
		parts := strings.Split(value, ".")
		result := make([]int, 4)
		for i := range parts {
			if i >= len(result) {
				break
			}
			var parsed int
			_, _ = fmt.Sscanf(parts[i], "%d", &parsed)
			result[i] = parsed
		}
		return result
	}
	a, b := parse(left), parse(right)
	for i := range a {
		if a[i] < b[i] {
			return -1
		}
		if a[i] > b[i] {
			return 1
		}
	}
	return 0
}

func selectVariant(variants []Variant, bucket int) Variant {
	ordered := append([]Variant(nil), variants...)
	sort.SliceStable(ordered, func(i, j int) bool { return ordered[i].Key < ordered[j].Key })
	limit := 0
	for _, variant := range ordered {
		limit += variant.Weight
		if bucket < limit {
			return variant
		}
	}
	return ordered[len(ordered)-1]
}

func pseudonymousSubjectKey(secret []byte, experimentKey, subjectType, subjectID string) string {
	return hex.EncodeToString(hmacDigest(secret, "subject|"+experimentKey+"\x00"+strings.ToLower(strings.TrimSpace(subjectType))+"\x00"+strings.TrimSpace(subjectID)))
}

func pseudonymousSubjectHash(secret []byte, subjectType, subjectID string) string {
	return hex.EncodeToString(hmacDigest(secret, "subject|"+strings.ToLower(strings.TrimSpace(subjectType))+"\x00"+strings.TrimSpace(subjectID)))
}

func hmacDigest(secret []byte, value string) []byte {
	mac := hmac.New(sha256.New, secret)
	_, _ = mac.Write([]byte(value))
	return mac.Sum(nil)
}

func marshalJSON(value interface{}) ([]byte, error) {
	if value == nil {
		return []byte(`{}`), nil
	}
	return json.Marshal(value)
}
