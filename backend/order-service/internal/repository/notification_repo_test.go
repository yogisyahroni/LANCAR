package repository

import (
	"context"
	"regexp"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
)

func TestPostgresNotificationRepoReadsCurrentInboxSchema(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })

	repo := NewPostgresNotificationRepo(sqlx.NewDb(db, "sqlmock"))
	userID := uuid.New()
	notificationID := uuid.New()
	createdAt := time.Now().UTC()

	expectation := mock.ExpectQuery(regexp.QuoteMeta("SELECT " + notificationColumns + " FROM notifications WHERE user_id = $1 AND archived_at IS NULL AND (expires_at IS NULL OR expires_at > NOW()) ORDER BY created_at DESC LIMIT $2 OFFSET $3"))
	expectation.WithArgs(userID, 8, 0).WillReturnRows(sqlmock.NewRows([]string{
		"id", "user_id", "title", "body", "type", "icon", "image_url", "deep_link",
		"channel", "category", "priority", "is_read", "read_at", "archived_at", "expires_at",
		"push_status", "push_error", "sent_at", "order_id", "conversation_id", "promo_id",
		"metadata", "created_at",
	}).AddRow(
		notificationID, userID, "Pesanan baru", "Siapkan pesanan", "order_update", nil, nil, "/pesanan/1",
		"in_app", "activity", "high", false, nil, nil, nil,
		"pending", nil, nil, nil, nil, nil, `{"source":"order"}`, createdAt,
	))

	got, err := repo.GetNotificationsByUserID(context.Background(), userID, 8, 0)
	if err != nil {
		t.Fatalf("read notification inbox: %v", err)
	}
	if len(got) != 1 || got[0].Category != "activity" || got[0].Priority != "high" {
		t.Fatalf("unexpected notification: %#v", got)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}
