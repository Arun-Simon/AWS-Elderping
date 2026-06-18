const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const { EventBridgeClient, PutEventsCommand } = require('@aws-sdk/client-eventbridge');
const { SchedulerClient, CreateScheduleCommand, DeleteScheduleCommand } = require('@aws-sdk/client-scheduler');
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

// AWS OIDC / IRSA detection
const awsRegion = process.env.AWS_REGION || 'us-east-1';
const eventBusName = process.env.EVENT_BUS_NAME || 'elderpinq-events';
const schedulerTargetArn = process.env.SCHEDULER_TARGET_ARN || 'arn:aws:sqs:us-east-1:462355914183:elderpinq-notifications-queue';
const schedulerRoleArn = process.env.SCHEDULER_ROLE_ARN || 'arn:aws:iam::462355914183:role/elderpinq-scheduler-role';

const isAwsConfigured = process.env.MOCK_AWS !== 'true' && (
  process.env.AWS_ACCESS_KEY_ID ||
  process.env.AWS_ROLE_ARN ||
  process.env.AWS_WEB_IDENTITY_TOKEN_FILE
);

let eventBridgeClient = null;
let schedulerClient = null;

if (isAwsConfigured) {
  try {
    eventBridgeClient = new EventBridgeClient({ region: awsRegion });
    schedulerClient = new SchedulerClient({ region: awsRegion });
  } catch (err) {
    console.log('⚠️ AWS clients could not initialize. Running in mock mode.', err.message);
  }
} else {
  console.log('ℹ️ AWS config missing or MOCK_AWS is true. Running AWS integrations in mock mode.');
}

// EventBridge Scheduler Helpers
const scheduleReminder = async (appt, offsetMinutes, suffix) => {
  const scheduledTime = new Date(appt.scheduled_at);
  const targetTime = new Date(scheduledTime.getTime() - offsetMinutes * 60 * 1000);

  if (targetTime <= new Date()) {
    // Skip if target time is in the past
    return;
  }

  const timeString = targetTime.toISOString().split('.')[0];
  const scheduleName = `reminder-appt-${appt.id}-${suffix}`;

  if (schedulerClient) {
    try {
      const command = new CreateScheduleCommand({
        Name: scheduleName,
        ScheduleExpression: `at(${timeString})`,
        FlexibleTimeWindow: { Mode: 'OFF' },
        Target: {
          Arn: schedulerTargetArn,
          RoleArn: schedulerRoleArn,
          Input: JSON.stringify({
            appointmentId: appt.id,
            elderId: appt.elder_id,
            type: 'APPOINTMENT_REMINDER',
            reminderType: suffix,
            scheduledAt: appt.scheduled_at,
            doctorName: appt.doctor_name,
            clinicName: appt.clinic_name || appt.hospital_name
          })
        },
        ActionAfterCompletion: 'DELETE'
      });
      await schedulerClient.send(command);
      console.log(`✅ EventBridge Scheduler created for ${scheduleName} at ${timeString}`);
    } catch (err) {
      console.error(`⚠️ EventBridge Scheduler CreateSchedule failed for ${scheduleName}:`, err.message);
    }
  } else {
    console.log(`[MOCK SCHEDULER] Created schedule: ${scheduleName} at ${timeString}`);
  }
};

const createAllReminders = async (appt) => {
  await scheduleReminder(appt, 24 * 60, '24h');
  await scheduleReminder(appt, 60, '1h');
  await scheduleReminder(appt, 15, '15m');
};

const deleteAllReminders = async (apptId) => {
  const suffixes = ['24h', '1h', '15m'];
  for (const suffix of suffixes) {
    const scheduleName = `reminder-appt-${apptId}-${suffix}`;
    if (schedulerClient) {
      try {
        const command = new DeleteScheduleCommand({ Name: scheduleName });
        await schedulerClient.send(command);
        console.log(`✅ EventBridge Scheduler deleted for ${scheduleName}`);
      } catch (err) {
        if (err.name !== 'ResourceNotFoundException') {
          console.error(`⚠️ EventBridge Scheduler DeleteSchedule failed for ${scheduleName}:`, err.message);
        }
      }
    } else {
      console.log(`[MOCK SCHEDULER] Deleted schedule: ${scheduleName}`);
    }
  }
};

// Helper for EventBridge publishing
const publishEventBridge = async (eventType, payload) => {
  if (eventBridgeClient) {
    try {
      const command = new PutEventsCommand({
        Entries: [{
          Source: 'elderpinq.appointment-service',
          DetailType: eventType,
          Detail: JSON.stringify(payload),
          EventBusName: eventBusName
        }]
      });
      await eventBridgeClient.send(command);
    } catch (err) {
      console.error('⚠️ EventBridge PutEvents failed:', err.message);
    }
  } else {
    console.log(`[MOCK EVENTBRIDGE] Type: ${eventType}\nPayload:\n`, JSON.stringify(payload, null, 2));

    // Simulate EventBridge routing: Trigger notification-service directly
    try {
      const notifServiceUrl = process.env.NOTIFICATION_SERVICE_URL || 'http://notification-service:3000';
      let notificationType = 'APPOINTMENT_ALERT';
      if (eventType === 'BOOK_APPOINTMENT') notificationType = 'APPOINTMENT_BOOKED';
      if (eventType === 'RESCHEDULE_APPOINTMENT') notificationType = 'APPOINTMENT_RESCHEDULED';
      if (eventType === 'CANCEL_APPOINTMENT') notificationType = 'APPOINTMENT_CANCELLED';

      await fetch(`${notifServiceUrl}/notifications/trigger`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: payload.elderId,
          type: notificationType,
          payload
        })
      });
    } catch (err) {
      console.log('⚠️ Mock EventBridge trigger forwarding failed:', err.message);
    }
  }
};

// Helper for auditing
const logAudit = async (req, actionType, resource, resourceId, status, message) => {
  try {
    const auditServiceUrl = process.env.AUDIT_SERVICE_URL || 'http://audit-service:3000';
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
app.get('/health', (req, res) => res.status(200).json({ status: 'ok', service: 'appointment-service' }));

// Book an appointment
app.post('/appointments', validateToken, checkRelationship('elderId'), async (req, res) => {
  try {
    const { elderId, doctorName, clinicName, scheduledAt, hospitalName, doctorSpecialty, notes } = req.body;
    if (!elderId || !doctorName || !scheduledAt) {
      return res.status(400).json({ error: 'elderId, doctorName, and scheduledAt are required' });
    }
    const result = await pool.query(
      `INSERT INTO appointments (elder_id, doctor_name, clinic_name, scheduled_at, status, hospital_name, doctor_specialty, notes)
       VALUES ($1, $2, $3, $4, 'SCHEDULED', $5, $6, $7) RETURNING *`,
      [elderId, doctorName, clinicName || null, scheduledAt, hospitalName || null, doctorSpecialty || null, notes || null]
    );
    const appointment = result.rows[0];

    // Audit Log
    await logAudit(req, 'BOOK_APPOINTMENT', 'appointments', appointment.id, 'SUCCESS', `Appointment booked with Dr. ${doctorName}`);

    // Create EventBridge Scheduler Reminders (24h, 1h, 15m)
    await createAllReminders(appointment);

    // Publish to EventBridge
    await publishEventBridge('BOOK_APPOINTMENT', {
      appointmentId: appointment.id,
      elderId,
      doctorName,
      clinicName: clinicName || hospitalName,
      scheduledAt
    });

    res.status(201).json(appointment);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get appointments for a specific elder
app.get('/appointments/elder/:elderId', validateToken, checkRelationship('elderId'), async (req, res) => {
  try {
    const { elderId } = req.params;
    const result = await pool.query(
      'SELECT * FROM appointments WHERE elder_id = $1 ORDER BY scheduled_at ASC',
      [elderId]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Upcoming Appointments View (future schedule only)
app.get('/appointments/upcoming/:elderId', validateToken, checkRelationship('elderId'), async (req, res) => {
  try {
    const { elderId } = req.params;
    const result = await pool.query(
      `SELECT * FROM appointments 
       WHERE elder_id = $1 
         AND status IN ('SCHEDULED', 'CONFIRMED') 
         AND scheduled_at >= NOW() 
       ORDER BY scheduled_at ASC`,
      [elderId]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Search and Filter Appointments
app.get('/appointments/search/:elderId', validateToken, checkRelationship('elderId'), async (req, res) => {
  try {
    const { elderId } = req.params;
    const { status, doctor, hospital, startDate, endDate } = req.query;

    let query = 'SELECT * FROM appointments WHERE elder_id = $1';
    let params = [elderId];
    let index = 2;

    if (status) {
      query += ` AND status = $${index++}`;
      params.push(status);
    }
    if (doctor) {
      query += ` AND doctor_name ILIKE $${index++}`;
      params.push(`%${doctor}%`);
    }
    if (hospital) {
      query += ` AND (hospital_name ILIKE $${index} OR clinic_name ILIKE $${index})`;
      index++;
      params.push(`%${hospital}%`);
    }
    if (startDate) {
      query += ` AND scheduled_at >= $${index++}`;
      params.push(startDate);
    }
    if (endDate) {
      query += ` AND scheduled_at <= $${index++}`;
      params.push(endDate);
    }

    query += ' ORDER BY scheduled_at ASC';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update/Reschedule appointment details
app.put('/appointments/:id', validateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { doctorName, clinicName, scheduledAt, status, hospitalName, doctorSpecialty, notes } = req.body;

    // Fetch appointment
    const apptRes = await pool.query('SELECT * FROM appointments WHERE id = $1', [id]);
    if (apptRes.rows.length === 0) {
      return res.status(404).json({ error: 'Appointment not found' });
    }
    const appt = apptRes.rows[0];

    // Authorize check
    const authServiceUrl = process.env.AUTH_SERVICE_URL || 'http://auth-service:3000';
    let allowed = false;

    if (req.user.role === 'SUPER_ADMIN' || req.user.role === 'ADMIN') {
      allowed = true;
    } else if (req.user.role === 'ELDER') {
      allowed = String(req.user.userId) === String(appt.elder_id);
    } else if (req.user.role === 'FAMILY') {
      const response = await fetch(`${authServiceUrl}/links/verify/${req.user.userId}/${appt.elder_id}`);
      if (response.ok) {
        const data = await response.json();
        allowed = data.linked;
      }
    }

    if (!allowed) return res.status(403).json({ error: 'Forbidden: Access denied' });

    // Rescheduling tracking: check if date is changing
    let history = appt.history || [];
    let isRescheduled = false;
    if (scheduledAt && new Date(scheduledAt).getTime() !== new Date(appt.scheduled_at).getTime()) {
      history.push({
        previous_schedule: appt.scheduled_at,
        rescheduled_at: new Date().toISOString()
      });
      isRescheduled = true;
    }

    const finalStatus = isRescheduled ? 'CONFIRMED' : (status || appt.status);

    const result = await pool.query(
      `UPDATE appointments 
       SET doctor_name = COALESCE($1, doctor_name),
           clinic_name = COALESCE($2, clinic_name),
           scheduled_at = COALESCE($3, scheduled_at),
           status = COALESCE($4, status),
           hospital_name = COALESCE($5, hospital_name),
           doctor_specialty = COALESCE($6, doctor_specialty),
           notes = COALESCE($7, notes),
           history = $8,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $9 RETURNING *`,
      [doctorName, clinicName, scheduledAt, finalStatus, hospitalName, doctorSpecialty, notes, JSON.stringify(history), id]
    );
    const updatedAppt = result.rows[0];

    // Audit log
    const auditAction = isRescheduled ? 'RESCHEDULE_APPOINTMENT' : 'UPDATE_APPOINTMENT';
    await logAudit(req, auditAction, 'appointments', id, 'SUCCESS', `Appointment status updated to ${finalStatus}`);

    // Adjust Scheduler reminders if rescheduled
    if (isRescheduled) {
      await deleteAllReminders(id);
      await createAllReminders(updatedAppt);

      // Publish to EventBridge
      await publishEventBridge('RESCHEDULE_APPOINTMENT', {
        appointmentId: id,
        elderId: appt.elder_id,
        doctorName: doctorName || appt.doctor_name,
        clinicName: clinicName || appt.clinic_name || hospitalName,
        scheduledAt: scheduledAt
      });
    }

    res.json(updatedAppt);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Complete Appointment
app.put('/appointments/:id/complete', validateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const apptRes = await pool.query('SELECT * FROM appointments WHERE id = $1', [id]);
    if (apptRes.rows.length === 0) return res.status(404).json({ error: 'Appointment not found' });
    
    // Clear scheduled reminders
    await deleteAllReminders(id);

    const result = await pool.query(
      "UPDATE appointments SET status = 'COMPLETED', updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *",
      [id]
    );

    await logAudit(req, 'COMPLETE_APPOINTMENT', 'appointments', id, 'SUCCESS', 'Appointment marked as completed');
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Cancel appointment
app.put('/appointments/:id/cancel', validateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { cancellationReason } = req.body;

    const apptRes = await pool.query('SELECT * FROM appointments WHERE id = $1', [id]);
    if (apptRes.rows.length === 0) return res.status(404).json({ error: 'Appointment not found' });
    const appt = apptRes.rows[0];

    // Clear scheduled reminders
    await deleteAllReminders(id);

    const result = await pool.query(
      `UPDATE appointments 
       SET status = 'CANCELLED', cancellation_reason = $1, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $2 RETURNING *`,
      [cancellationReason || 'No reason provided', id]
    );

    // Audit
    await logAudit(req, 'CANCEL_APPOINTMENT', 'appointments', id, 'SUCCESS', `Appointment cancelled: ${cancellationReason}`);

    // Trigger Cancel Event
    await publishEventBridge('CANCEL_APPOINTMENT', {
      appointmentId: id,
      elderId: appt.elder_id,
      doctorName: appt.doctor_name,
      cancellationReason
    });

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Mark appointment as missed
app.put('/appointments/:id/missed', validateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const apptRes = await pool.query('SELECT * FROM appointments WHERE id = $1', [id]);
    if (apptRes.rows.length === 0) return res.status(404).json({ error: 'Appointment not found' });
    
    // Clear scheduled reminders
    await deleteAllReminders(id);

    const result = await pool.query(
      "UPDATE appointments SET status = 'MISSED', updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *",
      [id]
    );

    await logAudit(req, 'MISSED_APPOINTMENT', 'appointments', id, 'SUCCESS', 'Appointment marked as missed');
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Doctor Directory endpoints
app.post('/doctors', validateToken, async (req, res) => {
  try {
    const { name, email, phone, hospitalId, specialization, location, availability } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    const result = await pool.query(
      `INSERT INTO doctors (name, email, phone, hospital_id, specialization, location, availability) 
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [name, email || null, phone || null, hospitalId || null, specialization || null, location || null, availability ? JSON.stringify(availability) : '[]']
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/doctors', validateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM doctors ORDER BY name ASC');
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Hospital directory endpoints
app.post('/hospitals', validateToken, async (req, res) => {
  try {
    const { name, address, phone } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    const result = await pool.query(
      'INSERT INTO hospitals (name, address, phone) VALUES ($1, $2, $3) RETURNING *',
      [name, address || null, phone || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/hospitals', validateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM hospitals ORDER BY name ASC');
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Verify DB structure and start server
const PORT = process.env.PORT || 3000;
async function start() {
  try {
    await pool.query('SELECT 1');
  } catch (err) {
    console.error('⚠️ DB Initialization failed:', err.message);
  }
  app.listen(PORT, () => {
    console.log(`Appointment service running on port ${PORT}`);
  });
}
start();
