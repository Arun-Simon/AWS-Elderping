const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
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

// S3 Client configuration
const s3BucketName = process.env.REPORTS_S3_BUCKET || 'elderpinq-reports-bucket';
const awsRegion = process.env.AWS_REGION || 'us-east-1';
let s3Client = null;
try {
  s3Client = new S3Client({ region: awsRegion });
} catch (err) {
  console.log('⚠️ S3 Client could not initialize. Operating in mock mode.', err.message);
}

// Liveness probe
app.get('/health', (req, res) => res.status(200).json({ status: 'ok', service: 'report-service' }));

// Helper to fetch microservices telemetry
async function fetchServiceData(url, token) {
  try {
    const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (response.ok) return await response.json();
  } catch (err) {
    console.error(`Telemetry retrieval error for [${url}]:`, err.message);
  }
  return [];
}

// Generate weekly report
app.post('/reports/generate', validateToken, checkRelationship('elderId'), async (req, res) => {
  try {
    const { elderId } = req.body;
    const token = req.headers.authorization.split(' ')[1];

    if (!elderId) return res.status(400).json({ error: 'elderId is required' });

    // Internal URLs
    const healthUrl = `${process.env.HEALTH_SERVICE_URL || 'http://health-service:3000'}/vitals/${elderId}`;
    const reminderUrl = `${process.env.REMINDER_SERVICE_URL || 'http://reminder-service:3000'}/reminders/${elderId}/compliance`;
    const apptUrl = `${process.env.APPOINTMENT_SERVICE_URL || 'http://appointment-service:3000'}/appointments/elder/${elderId}`;
    const alertUrl = `${process.env.ALERT_SERVICE_URL || 'http://alert-service:3000'}/alerts/user/${elderId}`;
    const aiUrl = `${process.env.AI_SERVICE_URL || 'http://ai-service:3000'}/ai/query`;

    // Fetch Telemetry datasets in parallel
    const [vitals, compliance, appts, alerts] = await Promise.all([
      fetchServiceData(healthUrl, token),
      fetchServiceData(reminderUrl, token),
      fetchServiceData(apptUrl, token),
      fetchServiceData(alertUrl, token)
    ]);

    // Calculate metrics
    const totalMedicationsScheduled = compliance.length;
    const medicationsTakenCount = compliance.filter(c => c.status === 'TAKEN').length;
    const complianceRate = totalMedicationsScheduled > 0 ? (medicationsTakenCount / totalMedicationsScheduled) * 100 : 100.0;
    
    // Generate AI Insights via Bedrock
    let aiInsights = 'No metrics recorded. Maintain general caregiver oversight.';
    try {
      const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
      const aiResponse = await fetch(aiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          userId: elderId,
          capability: 'risk_analysis',
          query: `Vitals logged: ${JSON.stringify(vitals.slice(0, 5))}. Compliance: ${complianceRate}%. Alerts logged: ${alerts.length}. Please generate a risk summary.`
        })
      });
      if (aiResponse.ok) {
        const aiData = await aiResponse.json();
        aiInsights = aiData.result;
      }
    } catch (err) {
      console.error('Failed to retrieve AI insights:', err.message);
    }

    // Compile JSON Report Structure
    const reportData = {
      elderId,
      generatedAt: new Date().toISOString(),
      complianceRate: complianceRate.toFixed(2),
      vitalsTrend: vitals,
      appointments: appts,
      activeAlertsCount: alerts.filter(a => !a.is_resolved).length,
      aiInsights
    };

    // Calculate Composite Risk Score
    const riskScore = alerts.length > 5 ? 7.5 : (complianceRate < 70 ? 5.2 : 2.1);

    const s3Key = `reports/${elderId}/weekly-${Date.now()}.json`;

    // S3 upload fallback mock
    if (s3Client && process.env.AWS_ACCESS_KEY_ID) {
      await s3Client.send(new PutObjectCommand({
        Bucket: s3BucketName,
        Key: s3Key,
        Body: JSON.stringify(reportData, null, 2),
        ContentType: 'application/json'
      }));
    } else {
      console.log(`[MOCK] Uploaded report details to S3 Bucket: ${s3BucketName}, Key: ${s3Key}`);
    }

    // Write to postgres
    const result = await pool.query(
      `INSERT INTO weekly_reports (elder_id, s3_bucket, s3_key, compliance_score, health_risk_score)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [elderId, s3BucketName, s3Key, complianceRate, riskScore]
    );

    // Call notification-service to trigger email automatically
    const notifServiceUrl = process.env.NOTIFICATION_SERVICE_URL || 'http://notification-service:3000';
    const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
    fetch(`${notifServiceUrl}/notifications/trigger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({
        userId: elderId,
        type: 'WEEKLY_REPORT',
        payload: { reportId: result.rows[0].id, s3Key }
      })
    }).catch(err => console.error('Failed to trigger report notification:', err.message));

    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Fetch all reports generated for an elder
app.get('/reports/user/:elderId', validateToken, checkRelationship('elderId'), async (req, res) => {
  try {
    const { elderId } = req.params;
    const result = await pool.query(
      'SELECT * FROM weekly_reports WHERE elder_id = $1 ORDER BY created_at DESC',
      [elderId]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Retrieve specific S3 Report payload
app.get('/reports/:id/download', validateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const reportRes = await pool.query('SELECT * FROM weekly_reports WHERE id = $1', [id]);
    if (reportRes.rows.length === 0) {
      return res.status(404).json({ error: 'Report profile not found' });
    }
    const report = reportRes.rows[0];

    // Auth check
    const authServiceUrl = process.env.AUTH_SERVICE_URL || 'http://auth-service:3000';
    let allowed = false;

    if (req.user.role === 'SUPER_ADMIN' || req.user.role === 'ADMIN') {
      allowed = true;
    } else if (req.user.role === 'ELDER') {
      allowed = String(req.user.userId) === String(report.elder_id);
    } else if (req.user.role === 'FAMILY') {
      const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
      const response = await fetch(`${authServiceUrl}/links/verify/${req.user.userId}/${report.elder_id}`);
      if (response.ok) {
        const data = await response.json();
        allowed = data.linked;
      }
    }

    if (!allowed) {
      return res.status(403).json({ error: 'Forbidden: Access denied' });
    }

    // Return the pre-signed URL or S3 URL config
    res.json({
      id: report.id,
      elderId: report.elder_id,
      complianceScore: report.compliance_score,
      riskScore: report.health_risk_score,
      downloadUrl: `https://${report.s3_bucket}.s3.${awsRegion}.amazonaws.com/${report.s3_key}`,
      createdAt: report.created_at
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Report service running on port ${PORT}`);
});
