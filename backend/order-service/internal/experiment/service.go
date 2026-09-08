package experiment

import (
	"context"
	"errors"
	"os"
	"strings"

	"github.com/google/uuid"
)

type Service struct {
	repository *Repository
	secret     []byte
}

func NewService(repository *Repository, secret string) *Service {
	if strings.TrimSpace(secret) == "" {
		secret = os.Getenv("EXPERIMENT_ASSIGNMENT_SECRET")
	}
	if strings.TrimSpace(secret) == "" {
		// EVENT_ACTOR_PSEUDONYM_KEY is already a governed server-side secret and
		// provides a safe local compatibility path during secret rollout.
		secret = os.Getenv("EVENT_ACTOR_PSEUDONYM_KEY")
	}
	return &Service{repository: repository, secret: []byte(strings.TrimSpace(secret))}
}

func (s *Service) Assign(ctx context.Context, key, subjectType, subjectID string, evaluation EvaluationContext) (*AssignmentDecision, error) {
	if s == nil || s.repository == nil {
		return nil, errors.New("experiment service is not configured")
	}
	key = strings.ToLower(strings.TrimSpace(key))
	subjectType = strings.ToLower(strings.TrimSpace(subjectType))
	if subjectType != "customer" && subjectType != "courier" && subjectType != "anonymous" {
		return nil, errors.New("subject_type is invalid")
	}
	if strings.TrimSpace(subjectID) == "" {
		return nil, errors.New("authenticated subject is required")
	}
	exp, err := s.repository.GetExperiment(ctx, key)
	if err != nil {
		return nil, err
	}
	assignment, reason, err := Resolve(*exp, subjectType, subjectID, evaluation, s.secret)
	if err != nil {
		return nil, err
	}
	decision := &AssignmentDecision{Eligible: assignment != nil, Reason: reason, Assignment: assignment}
	if assignment == nil {
		return decision, nil
	}
	stored, err := s.repository.SaveAssignment(ctx, *exp, *assignment)
	if err != nil {
		return nil, err
	}
	decision.Assignment = stored
	return decision, nil
}

func (s *Service) Expose(ctx context.Context, key, subjectType, subjectID, assignmentID, exposureType, surface, market string) (*Exposure, error) {
	if s == nil || s.repository == nil {
		return nil, errors.New("experiment service is not configured")
	}
	key = strings.ToLower(strings.TrimSpace(key))
	subjectType = strings.ToLower(strings.TrimSpace(subjectType))
	if subjectType != "customer" && subjectType != "courier" && subjectType != "anonymous" {
		return nil, errors.New("subject_type is invalid")
	}
	if strings.TrimSpace(subjectID) == "" || strings.TrimSpace(assignmentID) == "" {
		return nil, errors.New("authenticated subject and assignment are required")
	}
	if _, err := uuid.Parse(strings.TrimSpace(assignmentID)); err != nil {
		return nil, errors.New("assignment_id is invalid")
	}
	exposureType = normalizeExposureType(exposureType)
	if exposureType == "" {
		return nil, errors.New("exposure_type must be seen or used")
	}
	surface = normalizeSurface(surface)
	if surface == "" {
		return nil, errors.New("surface is required")
	}
	exp, err := s.repository.GetExperiment(ctx, key)
	if err != nil {
		return nil, err
	}
	if exp.Status != StatusRunning {
		return nil, ErrExperimentDisabled
	}
	assignmentKey := pseudonymousSubjectKey(s.secret, exp.Key, subjectType, subjectID)
	subjectHash := pseudonymousSubjectHash(s.secret, subjectType, subjectID)
	assignment := Assignment{ID: strings.TrimSpace(assignmentID), ExperimentKey: exp.Key, ExperimentID: exp.ID, AssignmentKey: assignmentKey, SubjectType: subjectType, SubjectHash: subjectHash}
	if len(s.secret) == 0 {
		return nil, errors.New("experiment assignment secret is unavailable")
	}
	return s.repository.RecordExposure(ctx, *exp, assignment, subjectHash, exposureType, surface, normalizeMarket(market))
}

func normalizeExposureType(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	if value != "seen" && value != "used" {
		return ""
	}
	return value
}

func normalizeSurface(value string) string {
	value = strings.TrimSpace(value)
	if len(value) > 120 {
		return value[:120]
	}
	return value
}

func normalizeMarket(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	if value == "" {
		value = strings.ToLower(strings.TrimSpace(os.Getenv("LANCAR_MARKET_CODE")))
	}
	if value == "" {
		value = "id-jk"
	}
	return value
}

// SubjectHash is exposed only for verification and repository boundaries; it
// never returns or persists the raw authenticated subject identity.
func SubjectHash(secret []byte, subjectType, subjectID string) string {
	if len(secret) == 0 {
		return ""
	}
	return pseudonymousSubjectHash(secret, subjectType, subjectID)
}
