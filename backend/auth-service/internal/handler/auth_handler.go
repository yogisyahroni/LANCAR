package handler

import (
	"context"
	"encoding/json"
	"net/http"
)

type AuthHandler struct {
	svc interface {
		RequestOTP(ctx context.Context, phoneNumber string) error
		VerifyOTP(ctx context.Context, phoneNumber, code string) (string, bool, error)
		Register(ctx context.Context, userID, fullName, email string) error
		SetPIN(ctx context.Context, userID string, pin string) error
	}
}

func NewAuthHandler(svc interface {
	RequestOTP(ctx context.Context, phoneNumber string) error
	VerifyOTP(ctx context.Context, phoneNumber, code string) (string, bool, error)
	Register(ctx context.Context, userID, fullName, email string) error
	SetPIN(ctx context.Context, userID string, pin string) error
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

	token, isNewUser, err := h.svc.VerifyOTP(r.Context(), req.PhoneNumber, req.Code)
	if err != nil {
		http.Error(w, err.Error(), http.StatusUnauthorized)
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"token":       token,
		"is_new_user": isNewUser,
	})
}

func (h *AuthHandler) Register(w http.ResponseWriter, r *http.Request) {
	var req struct {
		UserID   string `json:"user_id"` // In real app, extract from JWT
		FullName string `json:"full_name"`
		Email    string `json:"email"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	err := h.svc.Register(r.Context(), req.UserID, req.FullName, req.Email)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"message": "Profile updated successfully"})
}

func (h *AuthHandler) SetPIN(w http.ResponseWriter, r *http.Request) {
	var req struct {
		UserID string `json:"user_id"` // In real app, extract from JWT
		PIN    string `json:"pin"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if len(req.PIN) != 6 {
		http.Error(w, "PIN must be 6 digits", http.StatusBadRequest)
		return
	}

	err := h.svc.SetPIN(r.Context(), req.UserID, req.PIN)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"message": "PIN set successfully"})
}
