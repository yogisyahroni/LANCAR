from pathlib import Path

lifecycle_path = Path("backend/order-service/internal/domain/tambalban_lifecycle.go")
repo_path = Path("backend/order-service/internal/repository/tambalban_repository.go")

lifecycle = lifecycle_path.read_text()
helper = r'''

// CanSubmitTambalBanCompletionReport gates the first immutable completion
// report to the final-proof stage. Idempotent replays are handled by the
// repository before this state check so a successful retry remains safe after
// the order has advanced to delivered.
func CanSubmitTambalBanCompletionReport(status OrderStatus) bool {
	return status == StatusDelivering
}
'''
if "func CanSubmitTambalBanCompletionReport(" not in lifecycle:
    lifecycle_path.write_text(lifecycle.rstrip() + helper)

repo = repo_path.read_text()
if "verify tambal ban report assignment" not in repo:
    lock_marker = '''\tif _, err := tx.ExecContext(ctx, `SELECT pg_advisory_xact_lock(hashtext($1))`, "tambal_ban_report:"+report.OrderID); err != nil {
\t\treturn fmt.Errorf("lock tambal ban report: %w", err)
\t}

'''
    assignment_guard = '''\tvar orderStatus string
\tif err := tx.QueryRowContext(ctx, `
\t\tSELECT o.status
\t\tFROM orders o
\t\tJOIN order_legs ol
\t\t  ON ol.order_id = o.id
\t\t AND ol.leg_number = 1
\t\t AND ol.courier_id = $2
\t\tWHERE o.id = $1
\t\tFOR UPDATE OF o`, report.OrderID, report.CourierID).Scan(&orderStatus); err != nil {
\t\tif errors.Is(err, sql.ErrNoRows) {
\t\t\treturn fmt.Errorf("%w: courier is not the assigned tambal ban technician", domain.ErrInvalidServiceReport)
\t\t}
\t\treturn fmt.Errorf("verify tambal ban report assignment: %w", err)
\t}

'''
    if lock_marker not in repo:
        raise SystemExit("assignment insertion marker not found")
    repo = repo.replace(lock_marker, lock_marker + assignment_guard, 1)

    idempotency_marker = '''\tif err := existing.Scan(&report.ID, &report.CreatedAt); err == nil {
\t\treturn tx.Commit()
\t} else if !errors.Is(err, sql.ErrNoRows) {
\t\treturn fmt.Errorf("check tambal ban report idempotency: %w", err)
\t}

'''
    status_guard = '''\tif !domain.CanSubmitTambalBanCompletionReport(domain.OrderStatus(orderStatus)) {
\t\treturn fmt.Errorf("%w: tambal ban completion report requires final-proof stage", domain.ErrInvalidServiceReport)
\t}

'''
    if idempotency_marker not in repo:
        raise SystemExit("status gate insertion marker not found")
    repo = repo.replace(idempotency_marker, idempotency_marker + status_guard, 1)
    repo_path.write_text(repo)
