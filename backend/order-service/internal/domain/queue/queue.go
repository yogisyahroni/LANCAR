package queue

import "context"

// Task represents a unit of work to be processed asynchronously.
type Task struct {
	Type    string                 `json:"type"`
	Payload map[string]interface{} `json:"payload"`
}

// Queue defines the interface for pushing tasks to and consuming from a persistent message broker.
type Queue interface {
	Push(ctx context.Context, task Task) error
	Consume(ctx context.Context, handler func(Task) error) error
	Close() error
}
