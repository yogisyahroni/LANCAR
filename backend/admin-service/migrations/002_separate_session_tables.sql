-- Migration: Separate Session Tables for Maximal Isolation
-- This migration splits the single web_sessions table into two distinct tables:
-- 1. admin_sessions: Only for internal staff/admin identities.
-- 2. customer_sessions: Only for regular customers.

-- Start Transaction
BEGIN;

-- 1. Create admin_sessions table
CREATE TABLE IF NOT EXISTS admin_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_token VARCHAR(255) UNIQUE NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    ip_address VARCHAR(45),
    user_agent TEXT
);

-- 2. Create customer_sessions table
CREATE TABLE IF NOT EXISTS customer_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_token VARCHAR(255) UNIQUE NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    ip_address VARCHAR(45),
    user_agent TEXT
);

-- 3. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_admin_sessions_token ON admin_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_customer_sessions_token ON customer_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_user ON admin_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_customer_sessions_user ON customer_sessions(user_id);

-- 4. Clean up old data (Optional: Transfer existing sessions if needed, but for security reset we can just start fresh)
-- For this "maximal isolation" request, it's safer to force re-login by not transferring stale mixed sessions.

COMMIT;
