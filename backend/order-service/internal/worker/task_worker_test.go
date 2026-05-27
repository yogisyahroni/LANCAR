package worker

import (
	"tembus/order-service/internal/domain/queue"
	"tembus/order-service/internal/infrastructure/notification"
	"testing"
)

func TestTaskWorker_handleTask(t *testing.T) {
	ns := notification.NewStubNotificationService()
	w := NewTaskWorker(nil, nil, ns, nil, nil, nil, nil) // Queue, Repo, and Services not needed for these tests

	tests := []struct {
		name    string
		task    queue.Task
		wantErr bool
	}{
		{
			name: "handle order.created",
			task: queue.Task{
				Type: "order.created",
				Payload: map[string]interface{}{
					"order_id": "ORD-123",
					"user_id":  "USER-456",
				},
			},
			wantErr: false,
		},
		{
			name: "handle order.cancelled",
			task: queue.Task{
				Type: "order.cancelled",
				Payload: map[string]interface{}{
					"order_id": "ORD-123",
				},
			},
			wantErr: false,
		},
		{
			name: "unknown task",
			task: queue.Task{
				Type: "unknown.type",
			},
			wantErr: false, // Unknown tasks are logged and ignored
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if err := w.handleTask(tt.task); (err != nil) != tt.wantErr {
				t.Errorf("TaskWorker.handleTask() error = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}
