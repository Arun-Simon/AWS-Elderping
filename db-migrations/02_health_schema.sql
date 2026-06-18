-- 02_health_schema.sql
-- Store health metrics, check-ins, and vitals history

CREATE TABLE IF NOT EXISTS health_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    checkin_status VARCHAR(50) DEFAULT 'vitals_logged', -- e.g., 'feeling_good', 'pain', 'tired'
    heart_rate INTEGER,
    blood_pressure VARCHAR(20), -- e.g., '120/80'
    blood_sugar NUMERIC(5,2), -- mg/dL
    oxygen_saturation INTEGER CHECK (oxygen_saturation >= 0 AND oxygen_saturation <= 100), -- percentage
    temperature NUMERIC(4,1), -- Fahrenheit or Celsius
    weight NUMERIC(5,2), -- kg
    bmi NUMERIC(4,2),
    water_intake INTEGER, -- ml
    sleep_hours NUMERIC(4,2),
    logged_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_health_logs_user ON health_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_health_logs_time ON health_logs(logged_at DESC);
