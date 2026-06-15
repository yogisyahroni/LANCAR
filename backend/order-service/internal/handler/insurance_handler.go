package handler

import (
	"net/http"

	"github.com/google/uuid"
	"tembus/order-service/internal/middleware"
)

type InsuranceHandler struct {
	insuranceSvc interface{}
}

func NewInsuranceHandler(insuranceSvc interface{}) *InsuranceHandler {
	return &InsuranceHandler{insuranceSvc: insuranceSvc}
}

func (h *InsuranceHandler) EnrollBPJSTK(w http.ResponseWriter, r *http.Request) {
	userIDStr := r.Header.Get("X-User-ID")
	if userIDStr == "" {
		middleware.WriteError(w, http.StatusUnauthorized, "ERR_UNAUTHORIZED", "Unauthorized", middleware.GetCorrelationID(r.Context()))
		return
	}

	if _, err := uuid.Parse(userIDStr); err != nil {
		middleware.WriteError(w, http.StatusBadRequest, "ERR_BAD_REQUEST", "Invalid user ID", middleware.GetCorrelationID(r.Context()))
		return
	}

	middleware.WriteError(w, http.StatusNotImplemented, "TODO_INSURANCE", "Insurance enrollment will be wired to the insurance provider once the adapter is ready.", middleware.GetCorrelationID(r.Context()))
}
