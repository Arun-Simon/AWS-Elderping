-- 07_ai_schema.sql
-- Logging Amazon Bedrock prompt transactions and resource allocations

CREATE TABLE IF NOT EXISTS ai_interactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID, -- Target user
    model_id VARCHAR(100) NOT NULL,                        -- e.g., 'anthropic.claude-3-5-sonnet'
    capability VARCHAR(50) NOT NULL,                       -- e.g., 'symptom_check', 'qa', 'risk_analysis'
    prompt_payload TEXT NOT NULL,
    response_payload TEXT NOT NULL,
    input_tokens INTEGER,
    output_tokens INTEGER,
    estimated_cost NUMERIC(10, 6),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ai_interactions_user ON ai_interactions(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_interactions_time ON ai_interactions(created_at DESC);
