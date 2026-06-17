package worker

import (
	"context"
	"log"
	"tembus/order-service/internal/domain"
	"time"
)

type PaymentLinkWorker struct {
	svc domain.PaymentLinkService
}

func NewPaymentLinkWorker(svc domain.PaymentLinkService) *PaymentLinkWorker {
	return &PaymentLinkWorker{svc: svc}
}

func (w *PaymentLinkWorker) Start(ctx context.Context) {
	// Auto-expire runs every minute, cleanup runs every hour
	expireTicker := time.NewTicker(1 * time.Minute)
	cleanupTicker := time.NewTicker(1 * time.Hour)
	defer expireTicker.Stop()
	defer cleanupTicker.Stop()

	if w.svc == nil {
		log.Println("Payment Link worker started without service instance (mock mode)")
		return
	}

	log.Println("Payment Link worker started")

	for {
		select {
		case <-ctx.Done():
			return
		case <-expireTicker.C:
			err := w.svc.AutoExpireLinks(ctx)
			if err != nil {
				log.Printf("Payment Link monitor (expire) error: %v", err)
			}
		case <-cleanupTicker.C:
			err := w.svc.CleanupExpiredLinks(ctx)
			if err != nil {
				log.Printf("Payment Link monitor (cleanup) error: %v", err)
			}
		}
	}
}
