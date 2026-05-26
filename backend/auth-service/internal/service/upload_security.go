package service

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"path/filepath"
	"strings"

	"github.com/google/uuid"
)

type UploadProfileName string

const (
	ProfilePhotoUpload    UploadProfileName = "profile_photo"
	CourierDocumentUpload UploadProfileName = "courier_document"
)

type UploadProfile struct {
	MaxBytes    int64
	AllowedMIME map[string]string
	Prefix      string
}

type SecureUpload struct {
	Filename       string
	Content        []byte
	MIMEType       string
	Extension      string
	ChecksumSHA256 string
}

var uploadProfiles = map[UploadProfileName]UploadProfile{
	ProfilePhotoUpload: {
		MaxBytes: 2 << 20,
		AllowedMIME: map[string]string{
			"image/jpeg": ".jpg",
			"image/png":  ".png",
			"image/webp": ".webp",
		},
		Prefix: "profile-photo",
	},
	CourierDocumentUpload: {
		MaxBytes: 5 << 20,
		AllowedMIME: map[string]string{
			"application/pdf": ".pdf",
			"image/jpeg":      ".jpg",
			"image/png":       ".png",
			"image/webp":      ".webp",
		},
		Prefix: "courier-document",
	},
}

func ValidateSecureUpload(profileName UploadProfileName, originalName string, content io.Reader) (*SecureUpload, error) {
	profile, ok := uploadProfiles[profileName]
	if !ok {
		return nil, fmt.Errorf("unknown upload profile: %s", profileName)
	}

	limited := io.LimitReader(content, profile.MaxBytes+1)
	data, err := io.ReadAll(limited)
	if err != nil {
		return nil, fmt.Errorf("read upload content: %w", err)
	}
	if len(data) == 0 {
		return nil, errors.New("empty upload file")
	}
	if int64(len(data)) > profile.MaxBytes {
		return nil, fmt.Errorf("file too large; maximum size is %d bytes", profile.MaxBytes)
	}

	mimeType := detectUploadMIME(data)
	extension, allowed := profile.AllowedMIME[mimeType]
	if !allowed {
		return nil, fmt.Errorf("unsupported or unsafe upload content for %s", profileName)
	}

	declaredExt := strings.ToLower(filepath.Ext(originalName))
	if declaredExt != "" && declaredExt != extension && !(declaredExt == ".jpeg" && extension == ".jpg") {
		return nil, fmt.Errorf("file extension does not match detected content type")
	}

	checksum := sha256.Sum256(data)
	return &SecureUpload{
		Filename:       fmt.Sprintf("%s-%s%s", profile.Prefix, uuid.NewString(), extension),
		Content:        data,
		MIMEType:       mimeType,
		Extension:      extension,
		ChecksumSHA256: hex.EncodeToString(checksum[:]),
	}, nil
}

func detectUploadMIME(data []byte) string {
	if isDangerousUpload(data) {
		return ""
	}
	if len(data) >= 5 && bytes.Equal(data[:5], []byte("%PDF-")) {
		return "application/pdf"
	}
	if len(data) >= 3 && data[0] == 0xff && data[1] == 0xd8 && data[2] == 0xff {
		return "image/jpeg"
	}
	if len(data) >= 8 && bytes.Equal(data[:8], []byte{0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a}) {
		return "image/png"
	}
	if len(data) >= 12 && string(data[:4]) == "RIFF" && string(data[8:12]) == "WEBP" {
		return "image/webp"
	}
	return ""
}

func isDangerousUpload(data []byte) bool {
	if len(data) >= 2 && data[0] == 0x4d && data[1] == 0x5a {
		return true
	}
	if len(data) >= 4 && data[0] == 0x7f && data[1] == 0x45 && data[2] == 0x4c && data[3] == 0x46 {
		return true
	}
	if len(data) >= 4 && data[0] == 0xca && data[1] == 0xfe && data[2] == 0xba && data[3] == 0xbe {
		return true
	}
	if len(data) >= 2 && data[0] == 0x23 && data[1] == 0x21 {
		return true
	}

	sample := strings.ToLower(strings.TrimSpace(string(data[:minInt(len(data), 256)])))
	return strings.HasPrefix(sample, "<!doctype html") ||
		strings.HasPrefix(sample, "<html") ||
		strings.HasPrefix(sample, "<script") ||
		strings.HasPrefix(sample, "<svg") ||
		strings.HasPrefix(sample, "<?php")
}

func safeStorageExtension(filename string) string {
	switch strings.ToLower(filepath.Ext(filename)) {
	case ".pdf":
		return ".pdf"
	case ".jpeg", ".jpg":
		return ".jpg"
	case ".png":
		return ".png"
	case ".webp":
		return ".webp"
	default:
		return ""
	}
}

func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}
