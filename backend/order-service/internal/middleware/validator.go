package middleware

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"reflect"

	"github.com/go-playground/validator/v10"
)

var validate = validator.New()



const ValidatedDataKey contextKey = "validated_data"

// ValidateBody is a middleware that decodes the request body into a struct,
// validates it using go-playground/validator, and stores it in the context.
func ValidateBody(schema interface{}) func(http.HandlerFunc) http.HandlerFunc {
	return func(next http.HandlerFunc) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			// Create a new instance of the schema type
			val := reflect.New(reflect.TypeOf(schema)).Interface()

			// Read body
			body, err := io.ReadAll(r.Body)
			if err != nil {
				correlationID := GetCorrelationID(r.Context())
				WriteError(w, http.StatusBadRequest, "ERR_INVALID_BODY", "Unable to read request body", correlationID)
				return
			}
			// Restore body for any subsequent reads if needed (though we'll use context)
			r.Body = io.NopCloser(bytes.NewBuffer(body))

			// Decode
			if err := json.Unmarshal(body, val); err != nil {
				correlationID := GetCorrelationID(r.Context())
				WriteError(w, http.StatusBadRequest, "ERR_INVALID_JSON", "Invalid JSON format", correlationID)
				return
			}

			// Validate
			if err := validate.Struct(val); err != nil {
				correlationID := GetCorrelationID(r.Context())
				// For now, simple error message. In production, we'd iterate over validation errors.
				WriteError(w, http.StatusBadRequest, "ERR_VALIDATION", err.Error(), correlationID)
				return
			}

			// Store in context
			ctx := context.WithValue(r.Context(), ValidatedDataKey, val)
			next.ServeHTTP(w, r.WithContext(ctx))
		}
	}
}

// GetValidatedData retrieves the validated data from the context.
func GetValidatedData(ctx context.Context) interface{} {
	return ctx.Value(ValidatedDataKey)
}
