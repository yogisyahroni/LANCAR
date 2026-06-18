package service

import (
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"

	"github.com/google/uuid"
)

type LocalStorage struct {
	basePath string
	baseURL  string
}

func NewLocalStorage(basePath, baseURL string) (*LocalStorage, error) {
	// Ensure directory exists with restrictive permissions (0750)
	if err := os.MkdirAll(basePath, 0750); err != nil {
		return nil, fmt.Errorf("failed to create upload directory: %w", err)
	}

	return &LocalStorage{
		basePath: basePath,
		baseURL:  baseURL,
	}, nil
}

func (s *LocalStorage) Save(ctx context.Context, filename string, content io.Reader) (string, error) {
	// Generate unique filename to prevent collisions and directory traversal
	ext := safeStorageExtension(filename)
	if ext == "" {
		return "", fmt.Errorf("unsupported storage file extension")
	}
	newFilename := uuid.New().String() + ext
	filePath := filepath.Join(s.basePath, newFilename)

	// Create file
	out, err := os.OpenFile(filePath, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0640)
	if err != nil {
		return "", fmt.Errorf("failed to create file: %w", err)
	}
	defer out.Close()

	// Write content
	if _, err := io.Copy(out, content); err != nil {
		return "", fmt.Errorf("failed to write file content: %w", err)
	}

	// Return relative path or URL
	return fmt.Sprintf("%s/%s", s.baseURL, newFilename), nil
}

func (s *LocalStorage) Delete(ctx context.Context, fileID string) error {
	filename := filepath.Base(fileID)
	filePath := filepath.Join(s.basePath, filename)
	return os.Remove(filePath)
}

func (s *LocalStorage) GetURL(ctx context.Context, fileID string) (string, error) {
	return fmt.Sprintf("%s/%s", s.baseURL, filepath.Base(fileID)), nil
}

func (s *LocalStorage) GeneratePresignedURL(ctx context.Context, key string, contentType string, expiryMinutes int) (string, error) {
	return "", fmt.Errorf("local storage does not support presigned URLs")
}
