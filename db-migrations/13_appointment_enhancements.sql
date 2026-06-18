-- 13_appointment_enhancements.sql
-- Setup lookup directory schemas, check constraints, and preference columns for Step 3

-- Drop tables to recreate them with the extended attributes
DROP TABLE IF EXISTS doctors CASCADE;
DROP TABLE IF EXISTS hospitals CASCADE;

CREATE TABLE IF NOT EXISTS hospitals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(150) NOT NULL,
    address TEXT,
    phone VARCHAR(30),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS doctors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100),
    phone VARCHAR(30),
    hospital_id UUID REFERENCES hospitals(id) ON DELETE SET NULL,
    specialization VARCHAR(100),
    location VARCHAR(150),
    availability JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Reconfigure appointments check constraint to ensure only valid statuses are permitted
ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_status_check;
ALTER TABLE appointments ADD CONSTRAINT appointments_status_check 
    CHECK (status IN ('SCHEDULED', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'MISSED'));

-- Add phone column to users table if not already present
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(30);

-- Append granular topic flags on notification_preferences
ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS reports_enabled BOOLEAN DEFAULT TRUE;
ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS appointments_enabled BOOLEAN DEFAULT TRUE;
ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS medication_enabled BOOLEAN DEFAULT TRUE;
ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS emergency_enabled BOOLEAN DEFAULT TRUE;
