-- Create users table
-- NOTE: Demo users (grandma / daughter) are seeded automatically by
-- auth-service on first startup via bcrypt — not here, since SQL has
-- no bcrypt function.
CREATE TABLE IF NOT EXISTS users (
  id         SERIAL PRIMARY KEY,
  username   VARCHAR(50) UNIQUE NOT NULL,
  password   VARCHAR(255) NOT NULL,
  role       VARCHAR(20) DEFAULT 'family', -- 'elder' | 'family'
  invite_code VARCHAR(10) UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS family_links (
  id         SERIAL PRIMARY KEY,
  family_id  INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  elder_id   INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(family_id, elder_id)
);
