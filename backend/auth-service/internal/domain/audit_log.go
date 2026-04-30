package domain

import "time"

type AuditLog struct {
	ID        string    `json:"id" db:"id"`
	ActorID   string    `json:"actor_id" db:"actor_id"`
	Action    string    `json:"action" db:"action"`
	TargetID  string    `json:"target_id" db:"target_id"`
	Payload   string    `json:"payload" db:"payload"` // JSON string
	CreatedAt time.Time `json:"created_at" db:"created_at"`
}
