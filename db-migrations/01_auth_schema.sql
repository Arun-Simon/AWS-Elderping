-- 01_auth_schema.sql
-- Setup user registry and linking associations

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cognito_sub VARCHAR(255) UNIQUE NOT NULL, -- Link to Cognito User ID
    username VARCHAR(100) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('SUPER_ADMIN', 'ADMIN', 'FAMILY', 'ELDER')),
    invite_code VARCHAR(10) UNIQUE, -- Used for linking elders
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS family_links (
    family_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    elder_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (family_id, elder_id)
);

CREATE INDEX IF NOT EXISTS idx_users_cognito ON users(cognito_sub);
CREATE INDEX IF NOT EXISTS idx_users_invite ON users(invite_code);
CREATE INDEX IF NOT EXISTS idx_links_elder ON family_links(elder_id);
