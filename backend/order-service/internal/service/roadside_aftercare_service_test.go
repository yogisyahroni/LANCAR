package service

import (
	"context"
	"errors"
	"testing"
	"tembus/order-service/internal/domain"
)

type fakeRoadsideAftercareRepo struct {
	claim  *domain.SubmitRoadsideClaimRequest
	rating *domain.SubmitRoadsideRatingRequest
}

func (f *fakeRoadsideAftercareRepo) SubmitClaim(_ context.Context, req *domain.SubmitRoadsideClaimRequest, _ string) (*domain.RoadsideServiceClaim, error) {
	copyReq := *req
	f.claim = &copyReq
	return &domain.RoadsideServiceClaim{ID: "claim-1", OrderID: req.OrderID}, nil
}

func (f *fakeRoadsideAftercareRepo) SubmitRating(_ context.Context, req *domain.SubmitRoadsideRatingRequest, _ string) (*domain.RoadsideServiceRating, error) {
	copyReq := *req
	f.rating = &copyReq
	return &domain.RoadsideServiceRating{
		ID: "rating-1", OrderID: req.OrderID,
		OverallRating: req.OverallRating,
		TechnicianQualityRating: req.TechnicianQualityRating,
	}, nil
}

func TestRoadsideClaimNormalizesAndFingerprints(t *testing.T) {
	repo := &fakeRoadsideAftercareRepo{}
	svc := NewRoadsideAftercareService(repo)
	_, err := svc.SubmitClaim(context.Background(), &domain.SubmitRoadsideClaimRequest{
		OrderID: " order-1 ", IssueType: " WARRANTY ",
		Description: " Ban kembali bocor setelah pekerjaan selesai. ", IdempotencyKey: "claim-key-1",
	}, "customer-1")
	if err != nil { t.Fatalf("SubmitClaim() error = %v", err) }
	if repo.claim.OrderID != "order-1" || repo.claim.IssueType != domain.RoadsideClaimIssueWarranty { t.Fatalf("request not normalized: %+v", repo.claim) }
	if repo.claim.RequestFingerprint == "" { t.Fatal("claim fingerprint must be populated") }
}

func TestRoadsideClaimRejectsUnsupportedIssue(t *testing.T) {
	svc := NewRoadsideAftercareService(&fakeRoadsideAftercareRepo{})
	_, err := svc.SubmitClaim(context.Background(), &domain.SubmitRoadsideClaimRequest{
		OrderID: "order-1", IssueType: "refund-anything", Description: "Keluhan layanan yang cukup panjang", IdempotencyKey: "claim-key-1",
	}, "customer-1")
	if !errors.Is(err, domain.ErrInvalidRoadsideAftercare) { t.Fatalf("error = %v, want invalid aftercare", err) }
}

func TestRoadsideRatingSeparatesTechnicianQuality(t *testing.T) {
	repo := &fakeRoadsideAftercareRepo{}
	svc := NewRoadsideAftercareService(repo)
	result, err := svc.SubmitRating(context.Background(), &domain.SubmitRoadsideRatingRequest{
		OrderID: "order-1", OverallRating: 4, TechnicianQualityRating: 5,
		Comment: "Teknisi teliti dan hasil tambalan rapi", IdempotencyKey: "rating-key-1",
	}, "customer-1")
	if err != nil { t.Fatalf("SubmitRating() error = %v", err) }
	if result.OverallRating != 4 || result.TechnicianQualityRating != 5 { t.Fatalf("ratings collapsed: %+v", result) }
	if repo.rating.RequestFingerprint == "" { t.Fatal("rating fingerprint must be populated") }
}

func TestRoadsideRatingRejectsInvalidDimension(t *testing.T) {
	svc := NewRoadsideAftercareService(&fakeRoadsideAftercareRepo{})
	_, err := svc.SubmitRating(context.Background(), &domain.SubmitRoadsideRatingRequest{
		OrderID: "order-1", OverallRating: 5, TechnicianQualityRating: 6, IdempotencyKey: "rating-key-1",
	}, "customer-1")
	if !errors.Is(err, domain.ErrInvalidRoadsideAftercare) { t.Fatalf("error = %v, want invalid aftercare", err) }
}
