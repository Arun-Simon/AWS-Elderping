const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const multer = require('multer');
const { validateToken, checkRelationship } = require('./authMiddleware');
const { uploadToS3, getPresignedUrl, deleteFromS3 } = require('./s3Service');

const upload = multer({ storage: multer.memoryStorage() });

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
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', service: 'health-service' });
});

// Post an elder check-in
app.post('/checkin', validateToken, checkRelationship('userId'), async (req, res) => {
  try {
    const { userId, status } = req.body;
    if (!userId || !status) {
      return res.status(400).json({ error: 'userId and status are required' });
    }
    const result = await pool.query(
      'INSERT INTO health_logs (user_id, checkin_status) VALUES ($1, $2) RETURNING *',
      [userId, status]
    );
    
    // Log audit trail
    await logAudit(req, 'CREATE_CHECKIN', 'health_logs', result.rows[0].id, 'SUCCESS', `User checkin status recorded: ${status}`);
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Record vitals and diagnostics
app.post('/vitals', validateToken, checkRelationship('userId'), async (req, res) => {
  try {
    const {
      userId,
      heartRate,
      bloodPressure,
      bloodSugar,
      oxygenSaturation,
      temperature,
      weight,
      heightCm,
      tempUnit, // 'F' or 'C'
      weightUnit, // 'LBS' or 'KG'
      moodRating,
      mobilitySteps
    } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    // 1. INPUT VALIDATION
    if (heartRate && (heartRate < 30 || heartRate > 200)) {
      return res.status(400).json({ error: 'Heart rate must be between 30 and 200 bpm' });
    }
    if (bloodPressure && !/^\d{2,3}\/\d{2,3}$/.test(bloodPressure)) {
      return res.status(400).json({ error: 'Blood pressure must be in format Systolic/Diastolic (e.g. 120/80)' });
    }
    if (oxygenSaturation && (oxygenSaturation < 0 || oxygenSaturation > 100)) {
      return res.status(400).json({ error: 'Oxygen saturation must be between 0 and 100%' });
    }
    if (bloodSugar && bloodSugar <= 0) {
      return res.status(400).json({ error: 'Blood sugar must be positive numeric value' });
    }
    if (mobilitySteps && mobilitySteps < 0) {
      return res.status(400).json({ error: 'Mobility steps cannot be negative' });
    }

    // 2. UNIT NORMALIZATION (lbs/F -> kg/Celsius)
    let finalWeight = weight ? parseFloat(weight) : null;
    if (finalWeight && weightUnit && weightUnit.toUpperCase() === 'LBS') {
      finalWeight = finalWeight * 0.45359237; // convert lbs to kg
    }

    let finalTemp = temperature ? parseFloat(temperature) : null;
    if (finalTemp && tempUnit && tempUnit.toUpperCase() === 'F') {
      finalTemp = (finalTemp - 32) * 5 / 9; // convert Fahrenheit to Celsius
    }

    // 3. BMI CALCULATION
    let finalBmi = null;
    if (finalWeight && heightCm) {
      const heightM = heightCm / 100;
      finalBmi = finalWeight / (heightM * heightM);
    }

    // 4. RISK SCORE CALCULATION
    let riskLevel = 'LOW';
    let abnormalCount = 0;

    if (oxygenSaturation && oxygenSaturation < 92) {
      riskLevel = 'CRITICAL';
    } else {
      if (heartRate && (heartRate < 50 || heartRate > 100)) abnormalCount++;
      if (bloodPressure) {
        const [sys, dia] = bloodPressure.split('/').map(Number);
        if (sys > 140 || sys < 90 || dia > 90 || dia < 60) abnormalCount++;
      }
      if (bloodSugar && (bloodSugar < 70 || bloodSugar > 180)) abnormalCount++;
      if (finalTemp && (finalTemp < 35.5 || finalTemp > 37.8)) abnormalCount++;

      if (abnormalCount >= 3) {
        riskLevel = 'HIGH';
      } else if (abnormalCount >= 1) {
        riskLevel = 'MEDIUM';
      }
    }

    const result = await pool.query(
      `INSERT INTO health_logs 
        (user_id, checkin_status, heart_rate, blood_pressure, blood_sugar, oxygen_saturation, temperature_celsius, weight_kg, bmi, mood_rating, mobility_steps, health_risk_score)
       VALUES 
        ($1, 'vitals_logged', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        userId,
        heartRate || null,
        bloodPressure || null,
        bloodSugar || null,
        oxygenSaturation || null,
        finalTemp || null,
        finalWeight || null,
        finalBmi || null,
        moodRating || null,
        mobilitySteps || null,
        riskLevel
      ]
    );

    // Write audit trail
    await logAudit(req, 'CREATE_VITALS', 'health_logs', result.rows[0].id, 'SUCCESS', `Vitals and diagnostics uploaded. Calculated Risk: ${riskLevel}`);

    // If Risk is HIGH or CRITICAL, send alert to notifications (Internal Call)
    if (riskLevel === 'HIGH' || riskLevel === 'CRITICAL') {
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
            userId,
            type: 'HEALTH_ALERT',
            payload: {
              message: `Vitals alert registered for patient. Abnormal parameters count: ${abnormalCount}. SpO2 is ${oxygenSaturation || 'Normal'}%.`,
              severity: riskLevel
            }
          })
        });
      } catch (err) {
        console.error('⚠️ Failed to route emergency notifications:', err.message);
      }
    }

    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Fetch recent vitals history
app.get('/vitals/:userId', validateToken, checkRelationship('userId'), async (req, res) => {
  try {
    const { userId } = req.params;
    const result = await pool.query(
      'SELECT * FROM health_logs WHERE user_id = $1 ORDER BY logged_at DESC LIMIT 50',
      [userId]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Fetch Health Trends and compliance stats
app.get('/vitals/trends/:userId', validateToken, checkRelationship('userId'), async (req, res) => {
  try {
    const { userId } = req.params;

    // 1. Fetch vitals averages
    const vitalsRes = await pool.query(
      `SELECT 
        AVG(heart_rate) as avg_heart_rate,
        AVG(blood_sugar) as avg_blood_sugar,
        AVG(oxygen_saturation) as avg_spo2,
        AVG(temperature_celsius) as avg_temp_c,
        AVG(mobility_steps) as avg_steps
       FROM health_logs 
       WHERE user_id = $1 AND logged_at >= NOW() - INTERVAL '30 days'`,
      [userId]
    );

    // 2. Fetch medication compliance metrics from reminder-service
    let adherenceStats = { weeklyAdherence: null, monthlyAdherence: null, overallAdherence: null };
    try {
      const reminderServiceUrl = process.env.REMINDER_SERVICE_URL || 'http://reminder-service:3000';
      const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
      const response = await fetch(`${reminderServiceUrl}/compliance/stats/${userId}`, {
        headers: { 'Authorization': req.headers.authorization }
      });
      if (response.ok) {
        adherenceStats = await response.json();
      }
    } catch (err) {
      console.error('⚠️ Could not fetch compliance stats:', err.message);
    }

    res.json({
      userId,
      trends_last_30_days: vitalsRes.rows[0],
      medication_adherence: adherenceStats
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Document Upload Endpoint
app.post('/documents/upload', validateToken, upload.single('file'), async (req, res) => {
  try {
    const { elderId, documentType } = req.body;
    if (!elderId || !documentType || !req.file) {
      return res.status(400).json({ error: 'elderId, documentType, and file are required' });
    }

    const validTypes = ['PRESCRIPTION', 'LAB_REPORT', 'MEDICAL_RECORD', 'INSURANCE_DOCUMENT', 'DISCHARGE_SUMMARY'];
    if (!validTypes.includes(documentType.toUpperCase())) {
      return res.status(400).json({ error: `Invalid documentType. Allowed: ${validTypes.join(', ')}` });
    }

    // Access scope authorization check
    let allowed = false;
    const { userId, role } = req.user;
    if (role === 'SUPER_ADMIN' || role === 'ADMIN') {
      allowed = true;
    } else if (role === 'ELDER') {
      allowed = String(userId) === String(elderId);
    } else if (role === 'FAMILY') {
      const authServiceUrl = process.env.AUTH_SERVICE_URL || 'http://auth-service:3000';
      const response = await fetch(`${authServiceUrl}/links/verify/${userId}/${elderId}`);
      if (response.ok) {
        const data = await response.json();
        allowed = data.linked;
      }
    }

    if (!allowed) {
      return res.status(403).json({ error: 'Forbidden: You do not have access to this elder\'s records' });
    }

    const environment = process.env.NODE_ENV || 'development';
    const cleanFileName = req.file.originalname.replace(/\s+/g, '_');
    const key = `documents/${environment}/${elderId}/${documentType.toUpperCase()}/${Date.now()}_${cleanFileName}`;
    const bucket = process.env.S3_BUCKET_NAME || 'elderpinq-reports-bucket';

    // Upload to S3 (KMS envelope encrypted)
    await uploadToS3(req.file.buffer, key, req.file.mimetype);

    // Save metadata
    const result = await pool.query(
      `INSERT INTO medical_documents (elder_id, document_type, file_name, s3_bucket, s3_key, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [elderId, documentType.toUpperCase(), req.file.originalname, bucket, key, userId]
    );

    // Audit Log
    await logAudit(req, 'UPLOAD_DOCUMENT', 'medical_documents', result.rows[0].id, 'SUCCESS', `Document uploaded for elder: ${elderId}`);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// List Documents Endpoint
app.get('/documents/:elderId', validateToken, checkRelationship('elderId'), async (req, res) => {
  try {
    const { elderId } = req.params;
    const result = await pool.query(
      'SELECT id, elder_id, document_type, file_name, uploaded_by, uploaded_at FROM medical_documents WHERE elder_id = $1 ORDER BY uploaded_at DESC',
      [elderId]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Download Document Endpoint (Generates 15-minute secure presigned URL)
app.get('/documents/download/:docId', validateToken, async (req, res) => {
  try {
    const { docId } = req.params;
    const result = await pool.query('SELECT * FROM medical_documents WHERE id = $1', [docId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }
    const doc = result.rows[0];

    // Access authorization check
    let allowed = false;
    const { userId, role } = req.user;
    if (role === 'SUPER_ADMIN' || role === 'ADMIN') {
      allowed = true;
    } else if (role === 'ELDER') {
      allowed = String(userId) === String(doc.elder_id);
    } else if (role === 'FAMILY') {
      const authServiceUrl = process.env.AUTH_SERVICE_URL || 'http://auth-service:3000';
      const response = await fetch(`${authServiceUrl}/links/verify/${userId}/${doc.elder_id}`);
      if (response.ok) {
        const data = await response.json();
        allowed = data.linked;
      }
    }

    if (!allowed) {
      return res.status(403).json({ error: 'Forbidden: Access denied' });
    }

    // Generate secure presigned URL (valid for 15 minutes)
    const downloadUrl = await getPresignedUrl(doc.s3_key);

    // Audit Log
    await logAudit(req, 'DOWNLOAD_DOCUMENT', 'medical_documents', docId, 'SUCCESS', `Presigned URL generated for document: ${docId}`);

    res.json({ downloadUrl, fileName: doc.file_name });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete Document Endpoint
app.delete('/documents/:docId', validateToken, async (req, res) => {
  try {
    const { docId } = req.params;
    const result = await pool.query('SELECT * FROM medical_documents WHERE id = $1', [docId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }
    const doc = result.rows[0];

    // Access authorization check
    let allowed = false;
    const { userId, role } = req.user;
    if (role === 'SUPER_ADMIN' || role === 'ADMIN') {
      allowed = true;
    } else if (role === 'ELDER') {
      allowed = String(userId) === String(doc.elder_id);
    } else if (role === 'FAMILY') {
      const authServiceUrl = process.env.AUTH_SERVICE_URL || 'http://auth-service:3000';
      const response = await fetch(`${authServiceUrl}/links/verify/${userId}/${doc.elder_id}`);
      if (response.ok) {
        const data = await response.json();
        allowed = data.linked;
      }
    }

    if (!allowed) {
      return res.status(403).json({ error: 'Forbidden: Access denied' });
    }

    // Delete binary from S3
    await deleteFromS3(doc.s3_key);

    // Delete metadata from DB
    await pool.query('DELETE FROM medical_documents WHERE id = $1', [docId]);

    // Audit Log
    await logAudit(req, 'DELETE_DOCUMENT', 'medical_documents', docId, 'SUCCESS', `Document deleted: ${docId}`);

    res.json({ success: true, message: 'Document deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Helper to fetch external microservice data for timeline and dashboards
const fetchTimelineData = async (url, token) => {
  try {
    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (response.ok) return await response.json();
  } catch (err) {
    console.error(`Timeline aggregator failed to fetch from ${url}:`, err.message);
  }
  return [];
};

// Timeline aggregation API
app.get('/timeline/:elderId', validateToken, checkRelationship('elderId'), async (req, res) => {
  try {
    const { elderId } = req.params;
    const token = req.headers.authorization.split(' ')[1];

    // Local DB queries
    const healthLogsPromise = pool.query(
      'SELECT id, heart_rate, blood_pressure, blood_sugar, oxygen_saturation, temperature_celsius, weight_kg, bmi, mood_rating, mobility_steps, health_risk_score, logged_at FROM health_logs WHERE user_id = $1 ORDER BY logged_at DESC LIMIT 50',
      [elderId]
    );
    const medicalDocsPromise = pool.query(
      'SELECT id, document_type, file_name, uploaded_at FROM medical_documents WHERE elder_id = $1 ORDER BY uploaded_at DESC LIMIT 50',
      [elderId]
    );

    // Microservice URLs
    const apptUrl = `${process.env.APPOINTMENT_SERVICE_URL || 'http://appointment-service:3000'}/appointments/elder/${elderId}`;
    const alertUrl = `${process.env.ALERT_SERVICE_URL || 'http://alert-service:3000'}/alerts/user/${elderId}`;
    const notesUrl = `${process.env.NOTES_SERVICE_URL || 'http://notes-service:3000'}/notes/${elderId}`;
    const medUrl = `${process.env.REMINDER_SERVICE_URL || 'http://reminder-service:3000'}/reminders/${elderId}/compliance`;
    const reportsUrl = `${process.env.REPORT_SERVICE_URL || 'http://report-service:3000'}/reports/user/${elderId}`;

    const [healthLogsRes, medicalDocsRes, appts, alerts, notes, meds, reports] = await Promise.all([
      healthLogsPromise,
      medicalDocsPromise,
      fetchTimelineData(apptUrl, token),
      fetchTimelineData(alertUrl, token),
      fetchTimelineData(notesUrl, token),
      fetchTimelineData(medUrl, token),
      fetchTimelineData(reportsUrl, token)
    ]);

    const timelineEvents = [];

    // Map health logs
    healthLogsRes.rows.forEach(log => {
      timelineEvents.push({
        id: log.id,
        eventType: 'HEALTH_LOG',
        timestamp: log.logged_at,
        title: `Health Check-in - Risk: ${log.health_risk_score}`,
        details: {
          heartRate: log.heart_rate,
          bloodPressure: log.blood_pressure,
          bloodSugar: log.blood_sugar,
          spo2: log.oxygen_saturation,
          temp: log.temperature_celsius,
          weight: log.weight_kg,
          bmi: log.bmi,
          mood: log.mood_rating,
          steps: log.mobility_steps,
          risk: log.health_risk_score
        }
      });
    });

    // Map documents
    medicalDocsRes.rows.forEach(doc => {
      timelineEvents.push({
        id: doc.id,
        eventType: 'MEDICAL_DOCUMENT',
        timestamp: doc.uploaded_at,
        title: `Document Uploaded: ${doc.document_type}`,
        details: {
          fileName: doc.file_name,
          documentType: doc.document_type
        }
      });
    });

    // Map appointments
    appts.forEach(appt => {
      timelineEvents.push({
        id: appt.id,
        eventType: 'APPOINTMENT',
        timestamp: appt.scheduled_at,
        title: `Appointment - ${appt.status}`,
        details: {
          doctorName: appt.doctor_name,
          clinicName: appt.clinic_name,
          specialty: appt.doctor_specialty,
          hospitalName: appt.hospital_name,
          status: appt.status,
          notes: appt.notes
        }
      });
    });

    // Map alerts
    alerts.forEach(alert => {
      timelineEvents.push({
        id: alert.id,
        eventType: 'ALERT',
        timestamp: alert.created_at,
        title: `Alert: ${alert.alert_type}`,
        details: {
          type: alert.alert_type,
          message: alert.message,
          severity: alert.severity,
          isResolved: alert.is_resolved
        }
      });
    });

    // Map notes
    notes.forEach(note => {
      timelineEvents.push({
        id: note.id,
        eventType: 'NOTE',
        timestamp: note.created_at,
        title: `${note.note_category} Note by ${note.author_name || 'Caregiver'}`,
        details: {
          category: note.note_category,
          content: note.content,
          authorName: note.author_name
        }
      });
    });

    // Map medication compliance logs
    meds.forEach(med => {
      timelineEvents.push({
        id: med.id,
        eventType: 'MEDICATION_EVENT',
        timestamp: med.taken_at,
        title: `Medication ${med.status}: ${med.medication_name}`,
        details: {
          name: med.medication_name,
          dosage: med.dosage,
          status: med.status
        }
      });
    });

    // Map weekly reports
    reports.forEach(report => {
      timelineEvents.push({
        id: report.id,
        eventType: 'WEEKLY_REPORT',
        timestamp: report.created_at,
        title: 'Weekly Clinical Report Generated',
        details: {
          complianceScore: report.compliance_score,
          riskScore: report.health_risk_score
        }
      });
    });

    // Sort chronologically, descending
    timelineEvents.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // Audit Log
    await logAudit(req, 'ACCESS_TIMELINE', 'timeline', elderId, 'SUCCESS', `Timeline accessed for elder: ${elderId}`);

    res.json(timelineEvents);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Elder Dashboard aggregation API
app.get('/dashboard/elder/:elderId', validateToken, checkRelationship('elderId'), async (req, res) => {
  try {
    const { elderId } = req.params;
    const token = req.headers.authorization.split(' ')[1];

    const apptUrl = `${process.env.APPOINTMENT_SERVICE_URL || 'http://appointment-service:3000'}/appointments/upcoming/${elderId}`;
    const notesUrl = `${process.env.NOTES_SERVICE_URL || 'http://notes-service:3000'}/notes/${elderId}`;
    const reportsUrl = `${process.env.REPORT_SERVICE_URL || 'http://report-service:3000'}/reports/user/${elderId}`;
    const complianceUrl = `${process.env.REMINDER_SERVICE_URL || 'http://reminder-service:3000'}/compliance/stats/${elderId}`;
    const remindersUrl = `${process.env.REMINDER_SERVICE_URL || 'http://reminder-service:3000'}/reminders/${elderId}`;

    const vitalsPromise = pool.query(
      'SELECT * FROM health_logs WHERE user_id = $1 ORDER BY logged_at DESC LIMIT 10',
      [elderId]
    );
    const docsPromise = pool.query(
      'SELECT id, document_type, file_name, uploaded_at FROM medical_documents WHERE elder_id = $1 ORDER BY uploaded_at DESC LIMIT 5',
      [elderId]
    );

    const [vitalsRes, docsRes, appts, notes, reports, compliance, reminders] = await Promise.all([
      vitalsPromise,
      docsPromise,
      fetchTimelineData(apptUrl, token),
      fetchTimelineData(notesUrl, token),
      fetchTimelineData(reportsUrl, token),
      fetchTimelineData(complianceUrl, token),
      fetchTimelineData(remindersUrl, token)
    ]);

    const latestVitals = vitalsRes.rows[0] || null;
    const riskScore = latestVitals ? latestVitals.health_risk_score : 'LOW';

    // Audit Log
    await logAudit(req, 'ACCESS_ELDER_DASHBOARD', 'dashboard', elderId, 'SUCCESS', `Elder dashboard accessed: ${elderId}`);

    res.json({
      vitalsSummary: latestVitals,
      riskScore,
      medicationStatus: {
        reminders,
        compliance
      },
      upcomingAppointments: appts,
      recentNotes: notes.slice(0, 5),
      medicalDocuments: docsRes.rows,
      weeklyReports: reports,
      vitalsHistory: vitalsRes.rows
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Family Dashboard aggregation API
app.get('/dashboard/family/:elderId', validateToken, checkRelationship('elderId'), async (req, res) => {
  try {
    const { elderId } = req.params;
    const token = req.headers.authorization.split(' ')[1];

    const apptUrl = `${process.env.APPOINTMENT_SERVICE_URL || 'http://appointment-service:3000'}/appointments/elder/${elderId}`;
    const notesUrl = `${process.env.NOTES_SERVICE_URL || 'http://notes-service:3000'}/notes/${elderId}`;
    const reportsUrl = `${process.env.REPORT_SERVICE_URL || 'http://report-service:3000'}/reports/user/${elderId}`;
    const complianceUrl = `${process.env.REMINDER_SERVICE_URL || 'http://reminder-service:3000'}/compliance/stats/${elderId}`;
    const alertsUrl = `${process.env.ALERT_SERVICE_URL || 'http://alert-service:3000'}/alerts/user/${elderId}`;

    const vitalsPromise = pool.query(
      'SELECT * FROM health_logs WHERE user_id = $1 ORDER BY logged_at DESC LIMIT 30',
      [elderId]
    );
    const docsPromise = pool.query(
      'SELECT id, document_type, file_name, uploaded_at FROM medical_documents WHERE elder_id = $1 ORDER BY uploaded_at DESC',
      [elderId]
    );

    const [vitalsRes, docsRes, appts, notes, reports, compliance, alerts] = await Promise.all([
      vitalsPromise,
      docsPromise,
      fetchTimelineData(apptUrl, token),
      fetchTimelineData(notesUrl, token),
      fetchTimelineData(reportsUrl, token),
      fetchTimelineData(complianceUrl, token),
      fetchTimelineData(alertsUrl, token)
    ]);

    // Audit Log
    await logAudit(req, 'ACCESS_FAMILY_DASHBOARD', 'dashboard', elderId, 'SUCCESS', `Family dashboard accessed for elder: ${elderId}`);

    res.json({
      vitalsHistory: vitalsRes.rows,
      medicalDocuments: docsRes.rows,
      appointments: appts,
      notes: notes,
      reports: reports,
      medicationAdherence: compliance,
      alerts: alerts
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Mock download file delivery loopback
app.get('/documents/mock-download', async (req, res) => {
  try {
    const { key } = req.query;
    if (!key) return res.status(400).send('key is required');
    const fs = require('fs');
    const path = require('path');
    const filePath = path.join(__dirname, '../mock-s3-storage', key.replace(/\//g, '_'));
    if (fs.existsSync(filePath)) {
      res.setHeader('Content-Disposition', `attachment; filename="${path.basename(key)}"`);
      res.sendFile(filePath);
    } else {
      res.status(404).send('Mock file not found');
    }
  } catch (err) {
    res.status(500).send(err.message);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Health service running on port ${PORT}`);
});
