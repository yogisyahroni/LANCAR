package provider

import (
	"os"
	"strconv"
	"time"
)

func getCircuitBreakerConfig(prefix string) (int, int, time.Duration) {
	failThresh := 5
	if val, err := strconv.Atoi(os.Getenv(prefix + "_CB_FAIL_THRESH")); err == nil && val > 0 {
		failThresh = val
	}
	successThresh := 2
	if val, err := strconv.Atoi(os.Getenv(prefix + "_CB_SUCCESS_THRESH")); err == nil && val > 0 {
		successThresh = val
	}
	timeoutSec := 30
	if val, err := strconv.Atoi(os.Getenv(prefix + "_CB_TIMEOUT_SEC")); err == nil && val > 0 {
		timeoutSec = val
	}
	return failThresh, successThresh, time.Duration(timeoutSec) * time.Second
}
