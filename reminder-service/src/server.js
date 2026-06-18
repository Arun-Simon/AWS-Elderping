const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const { validateToken, checkRelationship } = require('./authMiddleware');

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

// Liveness probe
app.get('/health', (req, res) => res.status(200).json({ status: 'ok', service: 'reminder-service' }));

// Add new medication reminder
app.post('/reminders', validateToken, checkRelationship('userId'), async (req, res) => {
  try {
    const { userId, medicationName, dosage, frequency, scheduledTime } = req.body;
    if (!userId || !medicationName || !dosage || !frequency || !scheduledTime) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }
    const result = await pool.query(
      'INSERT INTO reminders (user_id, medication_name, dosage, frequency, scheduled_time) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [userId, medicationName, dosage, frequency, scheduledTime]
    );

    // Audit log
    await logAudit(req, 'CREATE_REMINDER', 'reminders', result.rows[0].id, 'SUCCESS', `Medication reminder created for: ${medicationName}`);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get reminders for a user
app.get('/reminders/:userId', validateToken, checkRelationship('userId'), async (req, res) => {
  try {
    const { userId } = req.params;
    const result = await pool.query(
      'SELECT * FROM reminders WHERE user_id = $1 AND is_active = TRUE ORDER BY scheduled_time ASC',
      [userId]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Mark medication as taken (drives inventory deduction & low stock alerts)
app.put('/reminders/:id/take', validateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body; // TAKEN, MISSED, SNOOZED

    // Fetch reminder first
    const reminderRes = await pool.query('SELECT * FROM reminders WHERE id = $1', [id]);
    if (reminderRes.rows.length === 0) {
      return res.status(404).json({ error: 'Reminder not found' });
    }
    const reminder = reminderRes.rows[0];

    // Verify requesting user role and link
    const authServiceUrl = process.env.AUTH_SERVICE_URL || 'http://auth-service:3000';
    let allowed = false;

    if (req.user.role === 'SUPER_ADMIN' || req.user.role === 'ADMIN') {
      allowed = true;
    } else if (req.user.role === 'ELDER') {
      allowed = String(req.user.userId) === String(reminder.user_id);
    } else if (req.user.role === 'FAMILY') {
      const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
      const response = await fetch(`${authServiceUrl}/links/verify/${req.user.userId}/${reminder.user_id}`);
      if (response.ok) {
        const data = await response.json();
        allowed = data.linked;
      }
    }

    if (!allowed) {
      return res.status(403).json({ error: 'Forbidden: Insufficient privileges' });
    }

    const logStatus = status || 'TAKEN';
    const result = await pool.query(
      'INSERT INTO compliance_logs (reminder_id, user_id, taken_at, status) VALUES ($1, $2, CURRENT_TIMESTAMP, $3) RETURNING *',
      [id, reminder.user_id, logStatus]
    );

    // Write audit trail
    await logAudit(req, 'TAKE_REMINDER', 'compliance_logs', result.rows[0].id, 'SUCCESS', `Medication logged as ${logStatus}`);

    // DEDUCT INVENTORY ON TAKEN STATUS
    let inventoryAlert = null;
    if (logStatus === 'TAKEN') {
      const updateInv = await pool.query(
        `UPDATE medication_inventory 
         SET current_stock = GREATEST(current_stock - 1, 0), updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $1 AND LOWER(medication_name) = LOWER($2) 
         RETURNING *`,
        [reminder.user_id, reminder.medication_name]
      );

      if (updateInv.rows.length > 0) {
        const item = updateInv.rows[0];
        // Check low stock threshold
        if (item.current_stock <= item.low_stock_threshold && !item.refill_reminder_sent) {
          inventoryAlert = `Medication stock is low: ${item.current_stock} doses left!`;
          
          // Send low stock notification via notification-service (Event-driven Alert)
          try {
            const notifServiceUrl = process.env.NOTIFICATION_SERVICE_URL || 'http://notification-service:3000';
            const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
            await fetch(`${notifServiceUrl}/notifications/trigger`, {
              method: 'POST',
              headers: {
                'Authorization': req.headers.authorization,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                userId: reminder.user_id,
                type: 'HEALTH_ALERT', // Routes as custom urgent notification alert
                payload: {
                  message: `Low stock alert for medication: ${reminder.medication_name}. Only ${item.current_stock} doses remain. Please refill immediately.`,
                  severity: 'MEDIUM'
                }
              })
            });

            // Mark refill reminder as sent
            await pool.query(
              'UPDATE medication_inventory SET refill_reminder_sent = TRUE WHERE id = $1',
              [item.id]
            );
          } catch (err) {
            console.error('⚠️ Low-stock alert trigger event failed:', err.message);
          }
        }
      }
    }

    res.json({
      message: 'Medication status logged successfully',
      complianceLog: result.rows[0],
      inventoryAlert
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get compliance history
app.get('/reminders/:userId/compliance', validateToken, checkRelationship('userId'), async (req, res) => {
  try {
    const { userId } = req.params;
    const result = await pool.query(
      `SELECT c.*, r.medication_name, r.dosage 
       FROM compliance_logs c
       JOIN reminders r ON c.reminder_id = r.id
       WHERE c.user_id = $1 
       ORDER BY c.taken_at DESC LIMIT 100`,
      [userId]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Dynamic compliance stats calculation (adherence analytics)
app.get('/compliance/stats/:userId', validateToken, checkRelationship('userId'), async (req, res) => {
  try {
    const { userId } = req.params;

    const calcAdherence = async (interval) => {
      let query = `SELECT 
                    COUNT(*) FILTER (WHERE status = 'TAKEN') as taken,
                    COUNT(*) FILTER (WHERE status = 'MISSED') as missed
                   FROM compliance_logs 
                   WHERE user_id = $1`;
      let params = [userId];

      if (interval) {
        query += ` AND taken_at >= NOW() - INTERVAL '${interval}'`;
      }

      const resLog = await pool.query(query, params);
      const taken = parseInt(resLog.rows[0].taken || 0, 10);
      const missed = parseInt(resLog.rows[0].missed || 0, 10);
      const total = taken + missed;

      return total > 0 ? Math.round((taken / total) * 100) : null;
    };

    const weeklyScore = await calcAdherence('7 days');
    const monthlyScore = await calcAdherence('30 days');
    const overallScore = await calcAdherence(null);

    res.json({
      userId,
      weeklyAdherence: weeklyScore,
      monthlyAdherence: monthlyScore,
      overallAdherence: overallScore
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Medication Inventory Management
app.post('/inventory', validateToken, checkRelationship('userId'), async (req, res) => {
  try {
    const { userId, medicationName, currentStock, lowStockThreshold } = req.body;
    if (!userId || !medicationName) {
      return res.status(400).json({ error: 'userId and medicationName are required' });
    }

    const threshold = lowStockThreshold !== undefined ? parseInt(lowStockThreshold, 10) : 5;
    const stock = currentStock !== undefined ? parseInt(currentStock, 10) : 0;

    const result = await pool.query(
      `INSERT INTO medication_inventory (user_id, medication_name, current_stock, low_stock_threshold, refill_reminder_sent, updated_at)
       VALUES ($1, $2, $3, $4, FALSE, CURRENT_TIMESTAMP)
       ON CONFLICT (user_id, medication_name) 
       DO UPDATE SET 
         current_stock = COALESCE($3, medication_inventory.current_stock),
         low_stock_threshold = COALESCE($4, medication_inventory.low_stock_threshold),
         refill_reminder_sent = CASE WHEN COALESCE($3, medication_inventory.current_stock) > COALESCE($4, medication_inventory.low_stock_threshold) THEN FALSE ELSE medication_inventory.refill_reminder_sent END,
         updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [userId, medicationName, stock, threshold]
    );

    // Audit log
    await logAudit(req, 'UPDATE_INVENTORY', 'medication_inventory', result.rows[0].id, 'SUCCESS', `Inventory updated for ${medicationName}. Stock is ${stock}`);

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/inventory/:userId', validateToken, checkRelationship('userId'), async (req, res) => {
  try {
    const { userId } = req.params;
    const result = await pool.query(
      'SELECT * FROM medication_inventory WHERE user_id = $1 ORDER BY medication_name ASC',
      [userId]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Reminder service running on port ${PORT}`);
});
