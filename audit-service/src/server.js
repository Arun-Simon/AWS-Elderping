const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const { validateToken, requireRole } = require('./authMiddleware');

const app = express();
app.use(cors());
app.use(express.json());

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

// Liveness probe
app.get('/health', (req, res) => res.status(200).json({ status: 'ok', service: 'audit-service' }));

// Write to Audit Log (typically triggered internally/cross-service)
app.post('/audit', validateToken, async (req, res) => {
  try {
    const { actionType, resource, resourceId, beforeState, afterState, status, message } = req.body;
    const actorId = req.user.userId;
    const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    if (!actionType || !resource || !status) {
      return res.status(400).json({ error: 'actionType, resource, and status are required' });
    }

    const result = await pool.query(
      `INSERT INTO audit_logs 
        (actor_id, ip_address, action_type, resource, resource_id, before_state, after_state, status, message)
       VALUES 
        ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [
        actorId,
        ipAddress,
        actionType,
        resource,
        resourceId || null,
        beforeState ? JSON.stringify(beforeState) : null,
        afterState ? JSON.stringify(afterState) : null,
        status,
        message || null
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Fetch Audit logs (Restricted to SUPER_ADMIN)
app.get('/audit', validateToken, requireRole(['SUPER_ADMIN']), async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 100');
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Audit service running on port ${PORT}`);
});
