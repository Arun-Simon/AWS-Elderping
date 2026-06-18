-- 08_report_schema.sql
-- Archiving generated weekly health reports

CREATE TABLE IF NOT EXISTS weekly_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    elder_id UUID NOT NULL,
    s3_bucket VARCHAR(255) NOT NULL,
    s3_key VARCHAR(512) NOT NULL,
    compliance_score NUMERIC(5,2),                         -- Compliance percentage
    health_risk_score NUMERIC(4,2),                        -- Calculated score
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_weekly_reports_elder ON weekly_reports(elder_id);
CREATE INDEX IF NOT EXISTS idx_weekly_reports_time ON weekly_reports(created_at DESC);
