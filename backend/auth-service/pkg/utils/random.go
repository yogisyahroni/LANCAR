package utils

import (
	"crypto/rand"
	"math/big"
)

const charset = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789" // Removed ambiguous characters (I, O, 1, 0)

// GenerateRandomString generates a random alphanumeric string of a given length
func GenerateRandomString(length int) (string, error) {
	result := make([]byte, length)
	for i := range result {
		num, err := rand.Int(rand.Reader, big.NewInt(int64(len(charset))))
		if err != nil {
			return "", err
		}
		result[i] = charset[num.Int64()]
	}
	return string(result), nil
}
