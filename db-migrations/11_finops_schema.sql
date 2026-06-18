-- 11_finops_schema.sql
-- Store aggregated daily AWS resource costs and Bedrock optimizations

CREATE TABLE IF NOT EXISTS finops_daily_costs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    billing_date DATE NOT NULL UNIQUE,
    eks_cost NUMERIC(10, 4) DEFAULT 0.00,
    rds_cost NUMERIC(10, 4) DEFAULT 0.00,
    bedrock_cost NUMERIC(10, 4) DEFAULT 0.00,
    cloudwatch_cost NUMERIC(10, 4) DEFAULT 0.00,
    sns_cost NUMERIC(10, 4) DEFAULT 0.00,
    ses_cost NUMERIC(10, 4) DEFAULT 0.00,
    other_cost NUMERIC(10, 4) DEFAULT 0.00,
    total_cost NUMERIC(12, 4) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS finops_recommendations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recommendation_date DATE NOT NULL,
    category VARCHAR(50) NOT NULL,                         -- e.g., 'EKS', 'RDS', 'Bedrock'
    finding TEXT NOT NULL,
    action_item TEXT NOT NULL,
    potential_savings NUMERIC(10, 2),
    is_applied BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_finops_costs_date ON finops_daily_costs(billing_date);
CREATE INDEX IF NOT EXISTS idx_finops_recs_date ON finops_recommendations(recommendation_date DESC);
