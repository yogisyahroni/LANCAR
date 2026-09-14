package worker

import (
	"regexp"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
)

func TestCleanupAuditLogsUsesControlledRetentionFunction(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New() error = %v", err)
	}
	defer db.Close()

	mock.ExpectQuery(regexp.QuoteMeta("SELECT public.tembus_cleanup_audit_logs($1::integer, $2::integer)")).
		WithArgs(365, 1000).
		WillReturnRows(sqlmock.NewRows([]string{"tembus_cleanup_audit_logs"}).AddRow(int64(12)))

	deleted, err := cleanupAuditLogs(db, 365, 1000)
	if err != nil {
		t.Fatalf("cleanupAuditLogs() error = %v", err)
	}
	if deleted != 12 {
		t.Fatalf("cleanupAuditLogs() = %d, want 12", deleted)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sql expectations: %v", err)
	}
}
