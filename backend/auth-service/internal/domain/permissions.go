package domain

type Permission string

const (
	PermManageUsers                Permission = "manage_users"
	PermManageCouriers             Permission = "manage_couriers"
	PermManageOrders               Permission = "manage_orders"
	PermViewAuditLogs              Permission = "view_audit_logs"
	PermManageFinances             Permission = "manage_finances"
	PermManageSettings             Permission = "manage_settings"
	PermExperienceRead             Permission = "experience.read"
	PermExperienceDraftWrite       Permission = "experience.draft.write"
	PermExperienceAssetWrite       Permission = "experience.asset.write"
	PermExperienceTargetingWrite   Permission = "experience.targeting.write"
	PermExperienceFeatureFlagWrite Permission = "experience.feature_flag.write"
	PermExperienceKillSwitch       Permission = "experience.kill_switch.execute"
	PermExperienceSubmitApproval   Permission = "experience.submit_approval"
	PermExperienceApprove          Permission = "experience.approve"
	PermExperiencePublish          Permission = "experience.publish"
	PermExperienceRollback         Permission = "experience.rollback"
	PermExperienceGlobalPublish    Permission = "experience.global.publish"
	PermExperienceVersionPolicy    Permission = "experience.version_policy.write"
)

type RolePermission struct {
	Role         UserRole `json:"role" db:"role"`
	PermissionID string   `json:"permission_id" db:"permission_id"`
}
