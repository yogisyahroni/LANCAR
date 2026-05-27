package worker

import (
	"context"
	"log"
	"time"

	"tembus/order-service/internal/domain"
)

type SLAWorker struct {
	slaService domain.SLAService
	ticker     *time.Ticker
	quit       chan struct{}
}

func NewSLAWorker(slaService domain.SLAService) *SLAWorker {
	return &SLAWorker{
		slaService: slaService,
		quit:       make(chan struct{}),
	}
}

func (w *SLAWorker) Start() {
	// Run every 1 minute
	w.ticker = time.NewTicker(1 * time.Minute)
	go func() {
		log.Println("SLAWorker started")
		for {
			select {
			case <-w.ticker.C:
				w.process()
			case <-w.quit:
				w.ticker.Stop()
				log.Println("SLAWorker stopped")
				return
			}
		}
	}()
}

func (w *SLAWorker) Stop() {
	close(w.quit)
}

func (w *SLAWorker) process() {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := w.slaService.ProcessSLAWarnings(ctx); err != nil {
		log.Printf("[SLAWorker] Error processing warnings: %v", err)
	}

	if err := w.slaService.ProcessSLABreaches(ctx); err != nil {
		log.Printf("[SLAWorker] Error processing breaches: %v", err)
	}

	if err := w.slaService.ProcessIdleCompensation(ctx); err != nil {
		log.Printf("[SLAWorker] Error processing idle compensation: %v", err)
	}
}
