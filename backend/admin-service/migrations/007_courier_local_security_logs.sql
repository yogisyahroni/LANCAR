-- 007_courier_local_security_logs.sql
-- Description: Create table to store logs of local biometric/PIN verification for couriers

CREATE TABLE IF NOT EXISTS courier_local_security_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    courier_id UUID NOT NULL REFERENCES couriers(id) ON DELETE CASCADE,
    action_type VARCHAR(50) NOT NULL, -- e.g., 'ON_DUTY', 'START_DELIVERY'
    method VARCHAR(50) NOT NULL, -- e.g., 'BIOMETRIC', 'PIN', 'UNKNOWN'
    order_id UUID, -- optional, if action is related to a specific order
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Add index for querying logs by courier or action
CREATE INDEX IF NOT EXISTS idx_courier_local_security_logs_courier_id ON courier_local_security_logs(courier_id);
CREATE INDEX IF NOT EXISTS idx_courier_local_security_logs_created_at ON courier_local_security_logs(created_at);
