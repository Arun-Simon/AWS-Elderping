-- 12_healthcare_features.sql
-- Setup Phase 4 Healthcare Schema updates and Consent Management

-- 1. Consent Management Table
CREATE TABLE IF NOT EXISTS consents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE, -- Link to Elder
    family_access_granted BOOLEAN DEFAULT FALSE,
    ai_processing_granted BOOLEAN DEFAULT FALSE,
    doc_sharing_granted BOOLEAN DEFAULT FALSE,
    emergency_contact_granted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_consents_user ON consents(user_id);

-- 2. Medication Inventory Management Table
CREATE TABLE IF NOT EXISTS medication_inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    medication_name VARCHAR(150) NOT NULL,
    current_stock INTEGER NOT NULL DEFAULT 0,
    low_stock_threshold INTEGER NOT NULL DEFAULT 5,
    refill_reminder_sent BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_user_medication UNIQUE (user_id, medication_name)
);
CREATE INDEX IF NOT EXISTS idx_medication_inventory_user ON medication_inventory(user_id);

-- 3. Emergency Contact Management Table
CREATE TABLE IF NOT EXISTS emergency_contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    elder_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    primary_name VARCHAR(100) NOT NULL,
    primary_phone VARCHAR(30) NOT NULL,
    primary_relationship VARCHAR(50),
    secondary_name VARCHAR(100),
    secondary_phone VARCHAR(30),
    secondary_relationship VARCHAR(50),
    doctor_name VARCHAR(100),
    doctor_phone VARCHAR(30),
    doctor_specialty VARCHAR(100),
    hospital_name VARCHAR(150),
    hospital_phone VARCHAR(30),
    hospital_address TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_emergency_contacts_elder ON emergency_contacts(elder_id);

-- 4. Medical Document Management Table
CREATE TABLE IF NOT EXISTS medical_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    elder_id UUID NOT NULL,
    document_type VARCHAR(30) NOT NULL CHECK (document_type IN ('PRESCRIPTION', 'LAB_REPORT', 'MEDICAL_RECORD')),
    file_name VARCHAR(255) NOT NULL,
    s3_bucket VARCHAR(255) NOT NULL,
    s3_key VARCHAR(512) NOT NULL,
    uploaded_by UUID NOT NULL,
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_medical_docs_elder ON medical_documents(elder_id);

-- 5. Extend Health Logs for mood, steps, normalized temp/weight, and risk score
ALTER TABLE health_logs RENAME COLUMN temperature TO temperature_celsius;
ALTER TABLE health_logs RENAME COLUMN weight TO weight_kg;
ALTER TABLE health_logs ADD COLUMN IF NOT EXISTS mood_rating VARCHAR(50);
ALTER TABLE health_logs ADD COLUMN IF NOT EXISTS mobility_steps INTEGER;
ALTER TABLE health_logs ADD COLUMN IF NOT EXISTS health_risk_score VARCHAR(20) DEFAULT 'LOW' CHECK (health_risk_score IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL'));

-- 6. Extend Appointments table for hospital, specialist, and reschedule history
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS hospital_name VARCHAR(150);
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS doctor_specialty VARCHAR(100);
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS history JSONB DEFAULT '[]'::jsonb;

-- 7. Extend Notes for category and updates tracking
ALTER TABLE notes ADD COLUMN IF NOT EXISTS note_category VARCHAR(30) CHECK (note_category IN ('PATIENT', 'FAMILY', 'CAREGIVER', 'DOCTOR', 'AI'));
ALTER TABLE notes ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
