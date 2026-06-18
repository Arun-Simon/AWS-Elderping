-- 10_audit_schema.sql
-- Security logs and data modification audits

CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id UUID, -- User performing action
    ip_address VARCHAR(45),
    action_type VARCHAR(100) NOT NULL,                      -- e.g., 'READ_PATIENT_RECORDS', 'DELETE_REMINDER'
    resource VARCHAR(100) NOT NULL,                         -- Target table/entity
    resource_id VARCHAR(100),
    before_state JSONB,
    after_state JSONB,
    status VARCHAR(20) NOT NULL CHECK (status IN ('SUCCESS', 'FAILURE')),
    message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_time ON audit_logs(created_at DESC);
