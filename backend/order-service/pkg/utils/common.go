package utils

import (
	"strconv"
)

// ParseFloat converts a string to float64, returning 0 on error.
func ParseFloat(s string) float64 {
	f, _ := strconv.ParseFloat(s, 64)
	return f
}

// ParseInt64 converts a string to int64, returning 0 on error.
func ParseInt64(s string) int64 {
	i, _ := strconv.ParseInt(s, 10, 64)
	return i
}
