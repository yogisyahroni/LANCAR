package service

import (
	"context"
	"io"
)

// StorageService defines the interface for file storage operations
type StorageService interface {
	// Save stores a file and returns the accessible URL/Path
	Save(ctx context.Context, filename string, content io.Reader) (string, error)
	// Delete removes a file from storage
	Delete(ctx context.Context, fileID string) error
	// GetURL returns a temporary or permanent URL for the file
	GetURL(ctx context.Context, fileID string) (string, error)
	// GeneratePresignedURL generates a temporary upload URL for S3
	GeneratePresignedURL(ctx context.Context, key string, contentType string, expiryMinutes int) (string, error)
}
