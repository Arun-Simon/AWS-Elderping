const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const { validateToken, checkRelationship, requireRole } = require('./authMiddleware');

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
app.get('/health', (req, res) => res.status(200).json({ status: 'ok', service: 'alert-service' }));

// Log internal alert/emergency (typically invoked by backend rules or user triggers)
app.post('/alerts', validateToken, async (req, res) => {
  try {
    const { userId, alertType, severity, message } = req.body;
    if (!userId || !alertType || !message) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }
    const result = await pool.query(
      'INSERT INTO alerts (user_id, alert_type, severity, message) VALUES ($1, $2, $3, $4) RETURNING *',
      [userId, alertType, severity || 'MEDIUM', message]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin endpoint: Get recent system-wide alerts
app.get('/alerts', validateToken, requireRole(['SUPER_ADMIN', 'ADMIN']), async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM alerts ORDER BY created_at DESC LIMIT 50');
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Fetch alerts for a specific user (authorized read check)
app.get('/alerts/user/:userId', validateToken, checkRelationship('userId'), async (req, res) => {
  try {
    const { userId } = req.params;
    const result = await pool.query(
      'SELECT * FROM alerts WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50',
      [userId]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Mark alert as resolved
app.put('/alerts/:id/resolve', validateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const actorId = req.user.userId;

    // Fetch alert to verify ownership/permission
    const alertRes = await pool.query('SELECT * FROM alerts WHERE id = $1', [id]);
    if (alertRes.rows.length === 0) {
      return res.status(404).json({ error: 'Alert not found' });
    }
    const alert = alertRes.rows[0];

    // Auth validation
    const authServiceUrl = process.env.AUTH_SERVICE_URL || 'http://auth-service:3000';
    let allowed = false;

    if (req.user.role === 'SUPER_ADMIN' || req.user.role === 'ADMIN') {
      allowed = true;
    } else if (req.user.role === 'ELDER') {
      allowed = String(req.user.userId) === String(alert.user_id);
    } else if (req.user.role === 'FAMILY') {
      const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
      const response = await fetch(`${authServiceUrl}/links/verify/${req.user.userId}/${alert.user_id}`);
      if (response.ok) {
        const data = await response.json();
        allowed = data.linked;
      }
    }

    if (!allowed) {
      return res.status(403).json({ error: 'Forbidden: Insufficient privileges to resolve alert' });
    }

    const result = await pool.query(
      'UPDATE alerts SET is_resolved = TRUE, resolved_at = CURRENT_TIMESTAMP, resolved_by = $1 WHERE id = $2 RETURNING *',
      [actorId, id]
    );

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Alert service running on port ${PORT}`);
});
