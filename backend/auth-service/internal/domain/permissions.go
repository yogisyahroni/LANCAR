package domain

type Permission string

const (
	PermManageUsers    Permission = "manage_users"
	PermManageCouriers Permission = "manage_couriers"
	PermManageOrders   Permission = "manage_orders"
	PermViewAuditLogs  Permission = "view_audit_logs"
	PermManageFinances Permission = "manage_finances"
	PermManageSettings Permission = "manage_settings"
)

type RolePermission struct {
	Role         UserRole `json:"role" db:"role"`
	PermissionID string   `json:"permission_id" db:"permission_id"`
}
