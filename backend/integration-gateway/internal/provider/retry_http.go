package provider

import (
	"context"
	"fmt"
	"io"
	"net/http"

	"tembus/pkg/resilience"
)

// doHTTPWithRetry executes buildReq() -> client.Do(req) with exponential
// backoff via the shared resilience package.
//
// Retry policy:
//   - network/transport errors are retryable
//   - 5xx responses are retryable (response body is drained and closed)
//   - 4xx and other statuses are returned as-is for caller handling
//
// The request is rebuilt on every attempt so request bodies are always
// fresh readers. Context cancellation stops retries immediately.
func doHTTPWithRetry(ctx context.Context, client *http.Client, buildReq func() (*http.Request, error)) (*http.Response, error) {
	var resp *http.Response
	err := resilience.WithRetry(ctx, resilience.DefaultRetryConfig(), func() (retryable bool, err error) {
		req, err := buildReq()
		if err != nil {
			return false, fmt.Errorf("failed to build request: %w", err)
		}
		r, err := client.Do(req)
		if err != nil {
			if ctx.Err() != nil {
				return false, ctx.Err()
			}
			return true, err
		}
		if r.StatusCode >= 500 {
			_, _ = io.Copy(io.Discard, r.Body)
			_ = r.Body.Close()
			return true, httpStatusError(r.StatusCode)
		}
		resp = r
		return false, nil
	})
	return resp, err
}

func httpStatusError(status int) error {
	return fmt.Errorf("upstream returned status %d", status)
}
