package handler

import (
	"encoding/json"
	"net/http"
	"strings"
	"tembus/auth-service/internal/service"

	"github.com/google/uuid"
)

type S3PresignHandler struct {
	storageSvc service.StorageService
}

func NewS3PresignHandler(storageSvc service.StorageService) *S3PresignHandler {
	return &S3PresignHandler{storageSvc: storageSvc}
}

func (h *S3PresignHandler) GeneratePresignedURL(w http.ResponseWriter, r *http.Request) {
	filename := r.URL.Query().Get("filename")
	contentType := r.URL.Query().Get("contentType")

	if filename == "" || contentType == "" {
		http.Error(w, "filename and contentType are required", http.StatusBadRequest)
		return
	}

	// Basic validation for content type (images)
	if !strings.HasPrefix(contentType, "image/") {
		http.Error(w, "only image uploads are allowed", http.StatusBadRequest)
		return
	}

	// Generate a unique key for S3
	ext := ""
	if idx := strings.LastIndex(filename, "."); idx != -1 {
		ext = filename[idx:]
	}
	key := "uploads/" + uuid.New().String() + ext

	// 15 minutes expiry
	url, err := h.storageSvc.GeneratePresignedURL(r.Context(), key, contentType, 15)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"url":     url,
		"key":     key,
	})
}
