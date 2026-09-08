package sink

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/LANCAR/datalake-worker/internal/domain"
)

type CanonicalEventSink interface {
	Write(ctx context.Context, event domain.EventEnvelope) (duplicate bool, err error)
}

// EventSpool is a durable local landing zone. It is intentionally append-only:
// the downstream R2/object-store shipper can replay these JSONL files without
// querying transactional tables. A process-local index avoids duplicate writes
// during RabbitMQ redelivery; event_id/dedupe_key remain in every line for
// cross-process dedupe downstream.
type EventSpool struct {
	dir  string
	mu   sync.Mutex
	seen map[string]struct{}
}

func NewEventSpool(dir string) (*EventSpool, error) {
	if dir == "" {
		dir = "/var/lib/lancar/events"
	}
	if err := os.MkdirAll(dir, 0o750); err != nil {
		return nil, fmt.Errorf("create canonical event spool: %w", err)
	}
	return &EventSpool{dir: dir, seen: make(map[string]struct{})}, nil
}

func (s *EventSpool) Write(ctx context.Context, event domain.EventEnvelope) (bool, error) {
	select {
	case <-ctx.Done():
		return false, ctx.Err()
	default:
	}
	event.Normalize()
	identity := event.DedupeIdentity()
	if identity == "" {
		return false, fmt.Errorf("canonical event has no dedupe identity")
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	if _, exists := s.seen[identity]; exists {
		return true, nil
	}

	date := time.Now().UTC().Format("2006-01-02")
	path := filepath.Join(s.dir, "events-"+date+".jsonl")
	file, err := os.OpenFile(path, os.O_WRONLY|os.O_APPEND|os.O_CREATE, 0o640)
	if err != nil {
		return false, fmt.Errorf("open canonical event spool: %w", err)
	}
	defer file.Close()

	line, err := json.Marshal(event)
	if err != nil {
		return false, fmt.Errorf("marshal canonical event: %w", err)
	}
	writer := bufio.NewWriter(file)
	if _, err := writer.Write(append(line, '\n')); err != nil {
		return false, fmt.Errorf("write canonical event spool: %w", err)
	}
	if err := writer.Flush(); err != nil {
		return false, fmt.Errorf("flush canonical event spool: %w", err)
	}
	if err := file.Sync(); err != nil {
		return false, fmt.Errorf("sync canonical event spool: %w", err)
	}
	s.seen[identity] = struct{}{}
	return false, nil
}
