package utils

import (
	"strings"


	"github.com/alexedwards/argon2id"
	"golang.org/x/crypto/bcrypt"
)

// DefaultParams are the recommended parameters for Argon2id.
var DefaultParams = &argon2id.Params{
	Memory:      64 * 1024, // 64MB
	Iterations:  3,
	Parallelism: 2,
	SaltLength:  16,
	KeyLength:   32,
}

func HashPassword(password string) (string, error) {
	return argon2id.CreateHash(password, DefaultParams)
}

func CheckPasswordHash(password, hash string) bool {
	// Check if it's an Argon2 hash (usually starts with $argon2id$)
	if strings.HasPrefix(hash, "$argon2id$") {
		match, err := argon2id.ComparePasswordAndHash(password, hash)
		if err != nil {
			return false
		}
		return match
	}

	// Fallback to Bcrypt for legacy hashes
	err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(password))
	return err == nil
}

func NeedsRehash(hash string) bool {
	return !strings.HasPrefix(hash, "$argon2id$")
}

