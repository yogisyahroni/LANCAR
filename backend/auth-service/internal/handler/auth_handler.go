package handler

import (
	"context"
	"encoding/json"
	"net/http"
)

type AuthHandler struct {
	svc interface {
		RequestOTP(ctx context.Context, phoneNumber string) error
		VerifyOTP(ctx context.Context, phoneNumber, code string) (string, error)
	}
}

func NewAuthHandler(svc interface {
	RequestOTP(ctx context.Context, phoneNumber string) error
	VerifyOTP(ctx context.Context, phoneNumber, code string) (string, error)
}) *AuthHandler {
	return &AuthHandler{svc: svc}
}

func (h *AuthHandler) RequestOTP(w http.ResponseWriter, r *http.Request) {
	var req struct {
		PhoneNumber string `json:"phone_number"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.PhoneNumber == "" {
		http.Error(w, "Phone number is required", http.StatusBadRequest)
		return
	}

	err := h.svc.RequestOTP(r.Context(), req.PhoneNumber)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"message": "OTP sent successfully"})
}

func (h *AuthHandler) VerifyOTP(w http.ResponseWriter, r *http.Request) {
	var req struct {
		PhoneNumber string `json:"phone_number"`
		Code        string `json:"code"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	token, err := h.svc.VerifyOTP(r.Context(), req.PhoneNumber, req.Code)
	if err != nil {
		http.Error(w, err.Error(), http.StatusUnauthorized)
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"token": token})
}
