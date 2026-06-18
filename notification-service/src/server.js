const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');
const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns');
const { SQSClient, ReceiveMessageCommand, DeleteMessageCommand } = require('@aws-sdk/client-sqs');
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
const sesSourceEmail = process.env.SES_SOURCE_EMAIL || 'alerts@elderpinq.com';
const queueUrl = process.env.SQS_QUEUE_URL;

const isAwsConfigured = process.env.MOCK_AWS !== 'true' && (
  process.env.AWS_ACCESS_KEY_ID ||
  process.env.AWS_ROLE_ARN ||
  process.env.AWS_WEB_IDENTITY_TOKEN_FILE
);

let sesClient = null;
let snsClient = null;
let sqsClient = null;

if (isAwsConfigured) {
  try {
    sesClient = new SESClient({ region: awsRegion });
    snsClient = new SNSClient({ region: awsRegion });
    if (queueUrl) {
      sqsClient = new SQSClient({ region: awsRegion });
    }
  } catch (err) {
    console.log('⚠️ AWS clients could not initialize.', err.message);
  }
} else {
  console.log('ℹ️ Running notification integrations in mock mode.');
}

// Liveness probe
app.get('/health', (req, res) => res.status(200).json({ status: 'ok', service: 'notification-service' }));

// Helper to send email via SES
async function sendSESEmail(recipient, subject, body) {
  if (sesClient) {
    const command = new SendEmailCommand({
      Source: sesSourceEmail,
      Destination: { ToAddresses: [recipient] },
      Message: {
        Subject: { Data: subject },
        Body: { Text: { Data: body } }
      }
    });
    await sesClient.send(command);
  } else {
    console.log(`[MOCK EMAIL] From: ${sesSourceEmail}, To: ${recipient}, Subject: ${subject}\nBody:\n${body}`);
  }
}

// Helper to send SMS via SNS
async function sendSNSSMS(phone, body, isWhatsApp = false) {
  if (isWhatsApp) {
    // WhatsApp is stubbed as Phase 5 extension
    console.log(`[STUB WHATSAPP] Phone: ${phone}\nMessage: ${body}`);
    return;
  }
  
  if (snsClient) {
    const command = new PublishCommand({
      PhoneNumber: phone,
      Message: body,
      MessageAttributes: {
        'AWS.MM.SMS.SenderID': { DataType: 'String', StringValue: 'ElderPinq' }
      }
    });
    await snsClient.send(command);
  } else {
    console.log(`[MOCK SMS] To: ${phone}\nMessage:\n${body}`);
  }
}

// Core notification dispatcher (shared by HTTP triggers and SQS queue worker)
async function handleNotificationDispatch(userId, type, payload) {
  if (!userId || !type || !payload) {
    throw new Error('userId, type, and payload are required');
  }

  // Retrieve user contact info from auth-service
  const authServiceUrl = process.env.AUTH_SERVICE_URL || 'http://auth-service:3000';
  const userResponse = await fetch(`${authServiceUrl}/users/${userId}`);
  if (!userResponse.ok) {
    throw new Error(`User contact details not found for user: ${userId}`);
  }
  const user = await userResponse.json();

  const emailRecipient = user.email || `${user.username}@elderpinq.com`;
  const phoneRecipient = user.phone || '+15550199'; // default mock phone

  // Get Preferences (fallback to default)
  let prefs = { 
    email_enabled: true, 
    sms_enabled: false, 
    whatsapp_enabled: false,
    reports_enabled: true,
    appointments_enabled: true,
    medication_enabled: true,
    emergency_enabled: true
  };
  const prefsRes = await pool.query('SELECT * FROM notification_preferences WHERE user_id = $1', [userId]);
  if (prefsRes.rows.length > 0) {
    prefs = { ...prefs, ...prefsRes.rows[0] };
  }

  // Granular preference checks based on notification topic
  let topicEnabled = true;
  if (type.startsWith('APPOINTMENT_')) {
    topicEnabled = prefs.appointments_enabled;
  } else if (type.startsWith('MEDICATION_') || type === 'LOW_STOCK_ALERT') {
    topicEnabled = prefs.medication_enabled;
  } else if (type === 'WEEKLY_REPORT') {
    topicEnabled = prefs.reports_enabled;
  } else if (type === 'EMERGENCY_ALERT' || type === 'FALL_DETECTION') {
    topicEnabled = prefs.emergency_enabled;
  }

  if (!topicEnabled) {
    console.log(`[PREFERENCE FILTER] Topic ${type} is disabled for user ${userId}. Skipping notification dispatch.`);
    return { status: 'SKIPPED', reason: 'Topic preference disabled' };
  }

  let subject = 'ElderPinq Alert Update';
  let body = `Hello ${user.username || 'User'},\n\n`;

  if (type === 'APPOINTMENT_BOOKED') {
    subject = `Appointment Confirmed: Dr. ${payload.doctorName}`;
    body += `A medical appointment has been scheduled with Dr. ${payload.doctorName} at ${payload.clinicName || 'Clinic'}.\nDate/Time: ${payload.scheduledAt}.`;
  } else if (type === 'APPOINTMENT_RESCHEDULED') {
    subject = `Appointment Rescheduled: Dr. ${payload.doctorName}`;
    body += `Your medical appointment with Dr. ${payload.doctorName} has been rescheduled.\nNew Date/Time: ${payload.scheduledAt}\nClinic: ${payload.clinicName || 'Clinic'}.`;
  } else if (type === 'APPOINTMENT_CANCELLED') {
    subject = `Appointment CANCELLED: Dr. ${payload.doctorName}`;
    body += `Your medical appointment with Dr. ${payload.doctorName} has been CANCELLED.\nReason: ${payload.cancellationReason || 'No reason provided'}.`;
  } else if (type === 'APPOINTMENT_REMINDER') {
    const label = payload.reminderType ? `(${payload.reminderType} reminder)` : '';
    subject = `Upcoming Appointment Reminder ${label}: Dr. ${payload.doctorName}`;
    body += `This is a reminder that you have an upcoming medical appointment with Dr. ${payload.doctorName} scheduled at ${payload.scheduledAt} at ${payload.clinicName || 'Clinic'}.`;
  } else if (type === 'WEEKLY_REPORT') {
    subject = 'Weekly Health Summary Compiled';
    body += `Your weekly health metrics analysis is complete.\nYou can download your report details at: https://elderpinq.com/reports/${payload.reportId}`;
  } else if (type === 'HEALTH_ALERT') {
    subject = `⚠️ CRITICAL: Health Alert Logged`;
    body += `An alert was flagged for you.\nDetails: ${payload.message}\nSeverity: ${payload.severity}`;
  } else if (type === 'MEDICATION_REMINDER') {
    subject = `Medication Reminder: ${payload.medicationName}`;
    body += `It is time to take ${payload.medicationName} (${payload.dosage || '1 dose'}). Scheduled time was: ${payload.scheduledTime}.`;
  } else if (type === 'LOW_STOCK_ALERT') {
    subject = `⚠️ Low Stock Warning: ${payload.medicationName}`;
    body += `Medication inventory for ${payload.medicationName} is low (Current stock: ${payload.currentStock}, threshold: ${payload.lowStockThreshold}). Please replenish soon.`;
  } else if (type === 'EMERGENCY_ALERT') {
    subject = `🚨 CRITICAL EMERGENCY ALERT`;
    body += `An emergency alert has been triggered!\nIncident details: ${payload.message}`;
  } else if (type === 'MISSED_CHECKIN') {
    subject = `⚠️ Alert: Missed Daily Check-In`;
    body += `An elder has missed their daily scheduled health check-in. Please contact them or verify status immediately.`;
  } else if (type === 'FAMILY_NOTIFICATION') {
    subject = payload.subject || 'Family Health Update';
    body += payload.message || 'There is a new update regarding your linked elder.';
  } else if (type === 'FALL_DETECTION') {
    subject = `🚨 URGENT: Fall Event Detected`;
    body += `A fall sensor alert has been logged at ${payload.timestamp || 'now'}!\nImpact force: ${payload.impactForce || 'N/A'}G. Immediate verification required.`;
  } else {
    body += `A notification has been triggered: ${JSON.stringify(payload)}`;
  }

  body += `\n\nBest wishes,\nElderPinq Operations Team.`;

  // Dispatch based on preferences
  if (prefs.email_enabled) {
    try {
      await sendSESEmail(emailRecipient, subject, body);
      await pool.query(
        'INSERT INTO notification_logs (user_id, channel, recipient, subject, body, status) VALUES ($1, $2, $3, $4, $5, $6)',
        [userId, 'EMAIL', emailRecipient, subject, body, 'SENT']
      );
    } catch (err) {
      await pool.query(
        'INSERT INTO notification_logs (user_id, channel, recipient, subject, body, status, error_message) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [userId, 'EMAIL', emailRecipient, subject, body, 'FAILED', err.message]
      );
    }
  }

  if (prefs.sms_enabled) {
    try {
      await sendSNSSMS(phoneRecipient, body, false);
      await pool.query(
        'INSERT INTO notification_logs (user_id, channel, recipient, subject, body, status) VALUES ($1, $2, $3, $4, $5, $6)',
        [userId, 'SMS', phoneRecipient, subject, body, 'SENT']
      );
    } catch (err) {
      await pool.query(
        'INSERT INTO notification_logs (user_id, channel, recipient, subject, body, status, error_message) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [userId, 'SMS', phoneRecipient, subject, body, 'FAILED', err.message]
      );
    }
  }

  if (prefs.whatsapp_enabled) {
    try {
      await sendSNSSMS(phoneRecipient, body, true);
      await pool.query(
        'INSERT INTO notification_logs (user_id, channel, recipient, subject, body, status) VALUES ($1, $2, $3, $4, $5, $6)',
        [userId, 'WHATSAPP', phoneRecipient, subject, body, 'SENT']
      );
    } catch (err) {
      await pool.query(
        'INSERT INTO notification_logs (user_id, channel, recipient, subject, body, status, error_message) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [userId, 'WHATSAPP', phoneRecipient, subject, body, 'FAILED', err.message]
      );
    }
  }

  return { status: 'DISPATCHED' };
}

// Trigger a notification (triggered internally or by other services)
app.post('/notifications/trigger', validateToken, checkRelationship('userId'), async (req, res) => {
  try {
    const { userId, type, payload } = req.body;
    const result = await handleNotificationDispatch(userId, type, payload);
    res.json({ message: 'Notifications dispatch completed', result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin visibility logs endpoint
app.get('/notifications/logs', validateToken, async (req, res) => {
  if (req.user.role !== 'ADMIN' && req.user.role !== 'SUPER_ADMIN') {
    return res.status(403).json({ error: 'Forbidden: Admin access required' });
  }
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
    const offset = parseInt(req.query.offset, 10) || 0;
    const result = await pool.query(
      'SELECT * FROM notification_logs ORDER BY sent_at DESC LIMIT $1 OFFSET $2',
      [limit, offset]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get preferences
app.get('/notifications/preferences/:userId', validateToken, checkRelationship('userId'), async (req, res) => {
  try {
    const { userId } = req.params;
    const result = await pool.query('SELECT * FROM notification_preferences WHERE user_id = $1', [userId]);
    if (result.rows.length === 0) {
      return res.json({ 
        user_id: userId, 
        email_enabled: true, 
        sms_enabled: false, 
        whatsapp_enabled: false,
        reports_enabled: true,
        appointments_enabled: true,
        medication_enabled: true,
        emergency_enabled: true
      });
    }
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update preferences
app.put('/notifications/preferences/:userId', validateToken, checkRelationship('userId'), async (req, res) => {
  try {
    const { userId } = req.params;
    const { 
      emailEnabled, 
      smsEnabled, 
      whatsappEnabled, 
      reportsEnabled, 
      appointmentsEnabled, 
      medicationEnabled, 
      emergencyEnabled 
    } = req.body;
    
    const result = await pool.query(
      `INSERT INTO notification_preferences (
         user_id, 
         email_enabled, 
         sms_enabled, 
         whatsapp_enabled, 
         reports_enabled, 
         appointments_enabled, 
         medication_enabled, 
         emergency_enabled, 
         updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
       ON CONFLICT (user_id) 
       DO UPDATE SET 
         email_enabled = COALESCE($2, notification_preferences.email_enabled),
         sms_enabled = COALESCE($3, notification_preferences.sms_enabled),
         whatsapp_enabled = COALESCE($4, notification_preferences.whatsapp_enabled),
         reports_enabled = COALESCE($5, notification_preferences.reports_enabled),
         appointments_enabled = COALESCE($6, notification_preferences.appointments_enabled),
         medication_enabled = COALESCE($7, notification_preferences.medication_enabled),
         emergency_enabled = COALESCE($8, notification_preferences.emergency_enabled),
         updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [
        userId, 
        emailEnabled, 
        smsEnabled, 
        whatsappEnabled, 
        reportsEnabled, 
        appointmentsEnabled, 
        medicationEnabled, 
        emergencyEnabled
      ]
    );
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// SQS Queue consumer polling worker
async function processQueueMessage(body) {
  console.log('📬 SQS Message received:', JSON.stringify(body));
  let type = null;
  let payload = null;
  let userId = null;

  // 1. EventBridge SQS wrapping (standard event bus payload)
  if (body['detail-type'] && body.detail) {
    const detailType = body['detail-type'];
    const detail = typeof body.detail === 'string' ? JSON.parse(body.detail) : body.detail;
    
    if (detailType === 'BOOK_APPOINTMENT') type = 'APPOINTMENT_BOOKED';
    else if (detailType === 'RESCHEDULE_APPOINTMENT') type = 'APPOINTMENT_RESCHEDULED';
    else if (detailType === 'CANCEL_APPOINTMENT') type = 'APPOINTMENT_CANCELLED';
    else type = detailType;

    payload = detail;
    userId = detail.elderId;
  } 
  // 2. Direct Scheduler target or standard message payload
  else if (body.type) {
    type = body.type;
    payload = body;
    userId = body.elderId;
  }
  
  if (userId && type && payload) {
    await handleNotificationDispatch(userId, type, payload);
    console.log(`✅ Queue event ${type} successfully processed for user: ${userId}`);
  } else {
    console.log('⚠️ SQS Message format not recognized or missing required fields. Skipping processing.');
  }
}

async function startSQSPoller() {
  if (!sqsClient || !queueUrl) {
    console.log('ℹ️ Background SQS poller not active (missing client or SQS_QUEUE_URL).');
    return;
  }
  console.log(`🚀 Starting SQS Polling Worker for queue: ${queueUrl}`);
  while (true) {
    try {
      const command = new ReceiveMessageCommand({
        QueueUrl: queueUrl,
        MaxNumberOfMessages: 5,
        WaitTimeSeconds: 15
      });
      const response = await sqsClient.send(command);
      if (response.Messages && response.Messages.length > 0) {
        for (const msg of response.Messages) {
          try {
            const body = JSON.parse(msg.Body);
            await processQueueMessage(body);
            
            // Delete processed message from queue
            const deleteCmd = new DeleteMessageCommand({
              QueueUrl: queueUrl,
              ReceiptHandle: msg.ReceiptHandle
            });
            await sqsClient.send(deleteCmd);
          } catch (err) {
            console.error('⚠️ Error processing SQS message:', err.message);
          }
        }
      }
    } catch (err) {
      console.error('⚠️ SQS polling encountered an error. Retrying in 10 seconds...', err.message);
      await new Promise((resolve) => setTimeout(resolve, 10000));
    }
  }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Notification service running on port ${PORT}`);
  // Start background queue listener
  startSQSPoller();
});
