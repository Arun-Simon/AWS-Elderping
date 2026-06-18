-- 06_notes_schema.sql
-- Store clinical, AI, and manual caregiver annotations

CREATE TABLE IF NOT EXISTS notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL, -- Target elder
    author_id UUID NOT NULL,                  -- Writer
    note_type VARCHAR(20) NOT NULL CHECK (note_type IN ('MANUAL_NOTE', 'AI_NOTE', 'DOCTOR_NOTE', 'SYSTEM_NOTE')),
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notes_user ON notes(user_id);
CREATE INDEX IF NOT EXISTS idx_notes_type ON notes(note_type);
