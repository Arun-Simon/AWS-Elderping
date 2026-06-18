-- 15_notes_search_indexes.sql
-- Create database search indexes on notes table to optimize query and search filtering

CREATE INDEX IF NOT EXISTS idx_notes_category ON notes(note_category);
CREATE INDEX IF NOT EXISTS idx_notes_author ON notes(author_id);
CREATE INDEX IF NOT EXISTS idx_notes_created_at ON notes(created_at);
