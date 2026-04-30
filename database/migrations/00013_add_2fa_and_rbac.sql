-- +goose Up
-- +goose StatementBegin
-- Add 2FA fields to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_2fa_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_backup_codes TEXT[];

-- Create permissions table
CREATE TABLE IF NOT EXISTS permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create role_permissions junction table
CREATE TABLE IF NOT EXISTS role_permissions (
    role VARCHAR(50) NOT NULL,
    permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role, permission_id)
);

-- Seed initial permissions
INSERT INTO permissions (name, description) VALUES
('manage_users', 'Full access to user management'),
('manage_couriers', 'Ability to verify and manage courier profiles'),
('manage_orders', 'Full access to order management and cancellation'),
('view_audit_logs', 'Ability to view administrative audit logs'),
('manage_finances', 'Access to payouts and financial reports'),
('manage_settings', 'Access to global platform and feature flag settings')
ON CONFLICT (name) DO NOTHING;

-- Map permissions to roles
-- Super Admin: Everything
INSERT INTO role_permissions (role, permission_id)
SELECT 'super_admin', id FROM permissions
ON CONFLICT DO NOTHING;

-- Admin: Most things except finances and super_admin tasks
INSERT INTO role_permissions (role, permission_id)
SELECT 'admin', id FROM permissions WHERE name IN ('manage_couriers', 'manage_orders', 'view_audit_logs', 'manage_settings')
ON CONFLICT DO NOTHING;

-- Finance: Only finances and audit logs
INSERT INTO role_permissions (role, permission_id)
SELECT 'finance', id FROM permissions WHERE name IN ('manage_finances', 'view_audit_logs')
ON CONFLICT DO NOTHING;

-- Update existing admin user to super_admin for bootstrap
UPDATE users SET role = 'super_admin' WHERE role = 'admin' AND phone_number = '081234567890'; -- Example admin
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS role_permissions;
DROP TABLE IF EXISTS permissions;
ALTER TABLE users DROP COLUMN IF EXISTS totp_secret;
ALTER TABLE users DROP COLUMN IF EXISTS is_2fa_enabled;
ALTER TABLE users DROP COLUMN IF EXISTS totp_backup_codes;
-- +goose StatementEnd
