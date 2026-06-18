const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const pool = new Pool({
  host:     process.env.DB_HOST,
  port:     process.env.DB_PORT,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

const JWT_SECRET = process.env.JWT_SECRET || 'secret';

// ──────────────────────────────────────────────
// ROUTES
// ──────────────────────────────────────────────

// Kubernetes liveness / readiness probe
app.get('/health', (req, res) =>
  res.status(200).json({ status: 'ok', service: 'auth-service' })
);

const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization header missing or malformed' });
  }
  try {
    const token = authHeader.split(' ')[1];
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
};

app.post('/register', async (req, res) => {
  try {
    const { username, password, email, role } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'username and password are required' });
    }
    const finalRole = (role || 'FAMILY').toUpperCase();
    const allowedRoles = ['SUPER_ADMIN', 'ADMIN', 'FAMILY', 'ELDER'];
    if (!allowedRoles.includes(finalRole)) {
      return res.status(400).json({ error: `Invalid role. Allowed roles: ${allowedRoles.join(', ')}` });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const inviteCode = finalRole === 'ELDER' ? crypto.randomBytes(3).toString('hex').toUpperCase() : null;
    const userEmail = email || `${username}@elderpinq.com`;

    const result = await pool.query(
      'INSERT INTO users (username, password, email, role, invite_code) VALUES ($1, $2, $3, $4, $5) RETURNING id, username, email, role, invite_code',
      [username, hashedPassword, userEmail, finalRole, inviteCode]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Username or Email already exists' });
    }
    res.status(500).json({ error: error.message });
  }
});

app.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'username and password are required' });
    }
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    const user = result.rows[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    const token = jwt.sign(
      { userId: user.id, role: user.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );
    res.json({ token, user: { id: user.id, username: user.username, role: user.role, invite_code: user.invite_code } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/me', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, username, role, invite_code FROM users WHERE id = $1',
      [req.user.userId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'SELECT id, username, role, email, phone FROM users WHERE id = $1',
      [id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Link family to elder
app.post('/link', authenticate, async (req, res) => {
  try {
    const { inviteCode } = req.body;
    const familyId = req.user.userId;

    // Find elder
    const elderRes = await pool.query('SELECT id, role FROM users WHERE invite_code = $1', [inviteCode]);
    if (elderRes.rows.length === 0) return res.status(404).json({ error: 'Invalid invite code' });
    const elder = elderRes.rows[0];
    if (elder.role !== 'elder') return res.status(400).json({ error: 'User is not registered as an elder' });

    // Create link
    await pool.query(
      'INSERT INTO family_links (family_id, elder_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [familyId, elder.id]
    );
    res.status(201).json({ success: true, elderId: elder.id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get elders linked to a family member
app.get('/links/elders', authenticate, async (req, res) => {
  try {
    const familyId = req.user.userId;
    const result = await pool.query(
      `SELECT u.id, u.username, u.role FROM users u
       JOIN family_links f ON u.id = f.elder_id
       WHERE f.family_id = $1`,
      [familyId]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get family members linked to an elder
app.get('/links/family', authenticate, async (req, res) => {
  try {
    const elderId = req.user.userId;
    const result = await pool.query(
      `SELECT u.id, u.username, u.role FROM users u
       JOIN family_links f ON u.id = f.family_id
       WHERE f.elder_id = $1`,
      [elderId]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Verification check for cross-service authorization
app.get('/links/verify/:familyId/:elderId', async (req, res) => {
  try {
    const { familyId, elderId } = req.params;
    const result = await pool.query(
      'SELECT 1 FROM family_links WHERE family_id = $1 AND elder_id = $2',
      [familyId, elderId]
    );
    res.json({ linked: result.rows.length > 0 });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Helper for auditing
const logAudit = async (req, actionType, resource, resourceId, status, message) => {
  try {
    const auditServiceUrl = process.env.AUDIT_SERVICE_URL || 'http://audit-service:3000';
    const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
    await fetch(`${auditServiceUrl}/audit`, {
      method: 'POST',
      headers: {
        'Authorization': req.headers.authorization,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ actionType, resource, resourceId, status, message })
    });
  } catch (err) {
    console.error('⚠️ Audit logging failed:', err.message);
  }
};

// Relationship verification for contacts and consents
const checkRelationshipLocal = async (req, res, next) => {
  const { elderId } = req.params;
  const { userId, role } = req.user;

  if (role === 'SUPER_ADMIN' || role === 'ADMIN') return next();
  if (role === 'ELDER' && String(userId) === String(elderId)) return next();
  if (role === 'FAMILY') {
    try {
      const result = await pool.query(
        'SELECT 1 FROM family_links WHERE family_id = $1 AND elder_id = $2',
        [userId, elderId]
      );
      if (result.rows.length > 0) return next();
    } catch (err) {
      return res.status(500).json({ error: 'Failed to verify relationship' });
    }
  }
  return res.status(403).json({ error: 'Forbidden: You are not linked to this elder' });
};

// Emergency Contacts endpoints
app.post('/contacts/:elderId', authenticate, checkRelationshipLocal, async (req, res) => {
  try {
    const { elderId } = req.params;
    const {
      primaryName,
      primaryPhone,
      primaryRelationship,
      secondaryName,
      secondaryPhone,
      secondaryRelationship,
      doctorName,
      doctorPhone,
      doctorSpecialty,
      hospitalName,
      hospitalPhone,
      hospitalAddress
    } = req.body;

    if (!primaryName || !primaryPhone) {
      return res.status(400).json({ error: 'primaryName and primaryPhone are required' });
    }

    const result = await pool.query(
      `INSERT INTO emergency_contacts 
        (elder_id, primary_name, primary_phone, primary_relationship, secondary_name, secondary_phone, secondary_relationship, doctor_name, doctor_phone, doctor_specialty, hospital_name, hospital_phone, hospital_address)
       VALUES 
        ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       ON CONFLICT (elder_id) 
       DO UPDATE SET
         primary_name = EXCLUDED.primary_name,
         primary_phone = EXCLUDED.primary_phone,
         primary_relationship = EXCLUDED.primary_relationship,
         secondary_name = EXCLUDED.secondary_name,
         secondary_phone = EXCLUDED.secondary_phone,
         secondary_relationship = EXCLUDED.secondary_relationship,
         doctor_name = EXCLUDED.doctor_name,
         doctor_phone = EXCLUDED.doctor_phone,
         doctor_specialty = EXCLUDED.doctor_specialty,
         hospital_name = EXCLUDED.hospital_name,
         hospital_phone = EXCLUDED.hospital_phone,
         hospital_address = EXCLUDED.hospital_address
       RETURNING *`,
      [
        elderId,
        primaryName,
        primaryPhone,
        primaryRelationship || null,
        secondaryName || null,
        secondaryPhone || null,
        secondaryRelationship || null,
        doctorName || null,
        doctorPhone || null,
        doctorSpecialty || null,
        hospitalName || null,
        hospitalPhone || null,
        hospitalAddress || null
      ]
    );

    // Audit trail
    await logAudit(req, 'UPDATE_EMERGENCY_CONTACTS', 'emergency_contacts', result.rows[0].id, 'SUCCESS', `Emergency contacts updated for elder: ${elderId}`);

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/contacts/:elderId', authenticate, checkRelationshipLocal, async (req, res) => {
  try {
    const { elderId } = req.params;
    const result = await pool.query(
      'SELECT * FROM emergency_contacts WHERE elder_id = $1',
      [elderId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No emergency contacts found for this elder' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Consent Management endpoints
app.post('/consents/:elderId', authenticate, checkRelationshipLocal, async (req, res) => {
  try {
    const { elderId } = req.params;
    const { familyAccess, aiProcessing, docSharing, emergencyContact } = req.body;

    const result = await pool.query(
      `INSERT INTO consents 
        (user_id, family_access_granted, ai_processing_granted, doc_sharing_granted, emergency_contact_granted, updated_at)
       VALUES 
        ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
       ON CONFLICT (user_id) 
       DO UPDATE SET
         family_access_granted = EXCLUDED.family_access_granted,
         ai_processing_granted = EXCLUDED.ai_processing_granted,
         doc_sharing_granted = EXCLUDED.doc_sharing_granted,
         emergency_contact_granted = EXCLUDED.emergency_contact_granted,
         updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [
        elderId,
        familyAccess !== undefined ? !!familyAccess : false,
        aiProcessing !== undefined ? !!aiProcessing : false,
        docSharing !== undefined ? !!docSharing : false,
        emergencyContact !== undefined ? !!emergencyContact : false
      ]
    );

    // Audit trail
    await logAudit(req, 'UPDATE_CONSENTS', 'consents', result.rows[0].id, 'SUCCESS', `Consent preferences updated for elder: ${elderId}`);

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/consents/:elderId', authenticate, checkRelationshipLocal, async (req, res) => {
  try {
    const { elderId } = req.params;
    const result = await pool.query(
      'SELECT * FROM consents WHERE user_id = $1',
      [elderId]
    );
    if (result.rows.length === 0) {
      // Return default false consents if none registered yet
      return res.json({
        user_id: elderId,
        family_access_granted: false,
        ai_processing_granted: false,
        doc_sharing_granted: false,
        emergency_contact_granted: false
      });
    }
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ──────────────────────────────────────────────
// SEED — creates demo users if the table is empty
// ──────────────────────────────────────────────
async function seedDemoUsers() {
  try {
    const { rows } = await pool.query('SELECT COUNT(*) AS cnt FROM users');
    if (parseInt(rows[0].cnt, 10) > 0) {
      console.log('ℹ️  Users table already has data — skipping seed.');
      return;
    }
    const elderHash  = await bcrypt.hash('password123', 10);
    const familyHash = await bcrypt.hash('password123', 10);
    
    await pool.query(
      `INSERT INTO users (username, password, email, role, invite_code) VALUES
        ($1, $2, 'grandma@elderpinq.com', 'ELDER', 'DEMO-123'),
        ($3, $4, 'daughter@elderpinq.com', 'FAMILY', NULL)
       ON CONFLICT (username) DO NOTHING`,
      ['grandma', elderHash, 'daughter', familyHash]
    );
    
    // Seed link
    const users = await pool.query('SELECT id, username FROM users WHERE username IN ($1, $2)', ['grandma', 'daughter']);
    const grandma = users.rows.find(u => u.username === 'grandma');
    const daughter = users.rows.find(u => u.username === 'daughter');
    
    if (grandma && daughter) {
      await pool.query(
        'INSERT INTO family_links (family_id, elder_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [daughter.id, grandma.id]
      );
    }
    
    console.log("✅ Demo users seeded → grandma (ELDER) / daughter (FAMILY) — password: password123");
  } catch (err) {
    console.error('⚠️  Seeding failed:', err.message);
  }
}

// ──────────────────────────────────────────────
// STARTUP
// ──────────────────────────────────────────────
const PORT = process.env.PORT || 3000;

async function start() {
  // Wait for a valid DB connection before seeding / starting
  let retries = 10;
  while (retries--) {
    try {
      await pool.query('SELECT 1');
      await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS invite_code VARCHAR(10) UNIQUE');
      await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255) UNIQUE');
      await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS cognito_sub VARCHAR(255) UNIQUE');
      await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(30)');
      break;
    } catch {
      console.log(`⏳ Waiting for database… (${retries} retries left)`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  await seedDemoUsers();
  app.listen(PORT, () => {
    console.log(`Auth service running on port ${PORT}`);
  });
}

start();
