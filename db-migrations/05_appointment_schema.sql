-- 05_appointment_schema.sql
-- Manage elder clinical schedules and appointments

CREATE TABLE IF NOT EXISTS appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    elder_id UUID NOT NULL,
    doctor_name VARCHAR(100) NOT NULL,
    clinic_name VARCHAR(150),
    scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,
    status VARCHAR(20) DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'cancelled', 'rescheduled')),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_appointments_elder ON appointments(elder_id);
CREATE INDEX IF NOT EXISTS idx_appointments_schedule ON appointments(scheduled_at);
