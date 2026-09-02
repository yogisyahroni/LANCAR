package middleware

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"reflect"

	"github.com/go-playground/validator/v10"
	"tembus/order-service/internal/domain"
)

var validate = validator.New()

const ValidatedDataKey contextKey = "validated_data"

// ValidateBody is a middleware that decodes the request body into a struct,
// validates it using go-playground/validator, and stores it in the context.
func ValidateBody(schema interface{}) func(http.HandlerFunc) http.HandlerFunc {
	return func(next http.HandlerFunc) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			val := reflect.New(reflect.TypeOf(schema)).Interface()

			body, err := io.ReadAll(r.Body)
			if err != nil {
				cid := GetCorrelationID(r.Context())
				WriteError(w, http.StatusBadRequest, string(domain.CodeInvalidBody), "Unable to read request body", cid)
				return
			}
			r.Body = io.NopCloser(bytes.NewBuffer(body))

			if err := json.Unmarshal(body, val); err != nil {
				cid := GetCorrelationID(r.Context())
				WriteError(w, http.StatusBadRequest, string(domain.CodeInvalidJSON), "Invalid JSON format", cid)
				return
			}
			if err := validate.Struct(val); err != nil {
				cid := GetCorrelationID(r.Context())
				WriteError(w, http.StatusBadRequest, string(domain.CodeValidation), err.Error(), cid)
				return
			}

			ctx := context.WithValue(r.Context(), ValidatedDataKey, val)
			next.ServeHTTP(w, r.WithContext(ctx))
		}
	}
}

// GetValidatedData retrieves the validated data from the context.
func GetValidatedData(ctx context.Context) interface{} {
	return ctx.Value(ValidatedDataKey)
}
