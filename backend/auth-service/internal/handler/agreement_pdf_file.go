package handler

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// openAgreementPDFUnderRoot opens a stored agreement PDF while enforcing that
// the resolved file stays inside uploadPath. os.Root also prevents symlink
// traversal from escaping the configured upload directory.
func openAgreementPDFUnderRoot(uploadPath, storedPath string) (*os.File, error) {
	storedPath = strings.TrimSpace(storedPath)
	if storedPath == "" {
		return nil, fmt.Errorf("agreement PDF path is empty")
	}
	if filepath.IsAbs(storedPath) {
		return nil, fmt.Errorf("agreement PDF path must be relative")
	}

	cleanPath := filepath.Clean(storedPath)
	if cleanPath == "." || cleanPath == ".." || strings.HasPrefix(cleanPath, ".."+string(os.PathSeparator)) {
		return nil, fmt.Errorf("agreement PDF path escapes upload root")
	}

	root, err := os.OpenRoot(uploadPath)
	if err != nil {
		return nil, fmt.Errorf("open agreement upload root: %w", err)
	}
	defer root.Close()

	file, err := root.Open(cleanPath)
	if err != nil {
		return nil, fmt.Errorf("open agreement PDF: %w", err)
	}

	info, err := file.Stat()
	if err != nil {
		_ = file.Close()
		return nil, fmt.Errorf("stat agreement PDF: %w", err)
	}
	if !info.Mode().IsRegular() {
		_ = file.Close()
		return nil, fmt.Errorf("agreement PDF is not a regular file")
	}

	return file, nil
}
