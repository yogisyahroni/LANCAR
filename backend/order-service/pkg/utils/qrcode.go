package utils

import (
	"encoding/base64"
	"fmt"

	"github.com/skip2/go-qrcode"
)

func GenerateQRCodeDataURI(content string, size int) (string, error) {
	png, err := qrcode.Encode(content, qrcode.Medium, size)
	if err != nil {
		return "", err
	}

	return fmt.Sprintf("data:image/png;base64,%s", base64.StdEncoding.EncodeToString(png)), nil
}
