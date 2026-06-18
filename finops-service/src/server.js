const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const { CostExplorerClient, GetCostAndUsageCommand } = require('@aws-sdk/client-cost-explorer');
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

// AWS Cost Explorer client setup
const awsRegion = process.env.AWS_REGION || 'us-east-1';
let ceClient = null;
try {
  ceClient = new CostExplorerClient({ region: awsRegion });
} catch (err) {
  console.log('⚠️ Cost Explorer Client could not initialize. Running in mock FinOps mode.', err.message);
}

// Liveness probe
app.get('/health', (req, res) => res.status(200).json({ status: 'ok', service: 'finops-service' }));

// Helper to fetch actual AWS costs or return mocks
async function getAWSCosts() {
  if (ceClient && process.env.AWS_ACCESS_KEY_ID) {
    try {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
      const end = now.toISOString().split('T')[0];
      const command = new GetCostAndUsageCommand({
        TimePeriod: { Start: start, End: end },
        Granularity: 'MONTHLY',
        Metrics: ['UnblendedCost'],
        GroupBy: [{ Type: 'DIMENSION', Key: 'SERVICE' }]
      });
      const data = await ceClient.send(command);
      // Simplify AWS response for dashboard
      return data.ResultsByTime || [];
    } catch (err) {
      console.error('Failed to query Cost Explorer APIs, calling local fallback:', err.message);
    }
  }

  // Return Mocks
  return {
    billingPeriod: 'Current Month',
    eks_cost: 142.50,
    rds_cost: 84.20,
    bedrock_cost: 28.10,
    cloudwatch_cost: 12.45,
    sns_cost: 4.80,
    ses_cost: 1.20,
    total_cost: 273.25
  };
}

// Fetch FinOps Cost Analytics Dashboard (Restricted to SUPER_ADMIN)
app.get('/finops/dashboard', validateToken, requireRole(['SUPER_ADMIN']), async (req, res) => {
  try {
    const costs = await getAWSCosts();
    
    // Read cached daily history if present
    const historyRes = await pool.query('SELECT * FROM finops_daily_costs ORDER BY billing_date DESC LIMIT 30');
    
    res.json({
      costs,
      history: historyRes.rows
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Fetch Cost optimization recommendations (Generates recommendations via ai-service)
app.get('/finops/recommendations', validateToken, requireRole(['SUPER_ADMIN']), async (req, res) => {
  try {
    // Read from DB cache first
    const cacheRes = await pool.query('SELECT * FROM finops_recommendations WHERE is_applied = FALSE ORDER BY recommendation_date DESC LIMIT 10');
    
    if (cacheRes.rows.length > 0) {
      return res.json(cacheRes.rows);
    }

    // Otherwise, generate recommendations via Bedrock (ai-service)
    const costs = await getAWSCosts();
    const costString = JSON.stringify(costs);

    const aiServiceUrl = process.env.AI_SERVICE_URL || 'http://ai-service:3000';
    const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
    
    let recommendationText = 'Consolidate workloads and enable scaling limits.';
    try {
      const aiResponse = await fetch(`${aiServiceUrl}/ai/finops-recs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': req.headers.authorization },
        body: JSON.stringify({ costMetricsString: costString })
      });
      if (aiResponse.ok) {
        const aiData = await aiResponse.json();
        recommendationText = aiData.recommendation;
      }
    } catch (err) {
      console.error('Failed to retrieve AI cost advisor recommendations:', err.message);
    }

    // Insert to DB Cache
    const result = await pool.query(
      `INSERT INTO finops_recommendations (recommendation_date, category, finding, action_item, potential_savings)
       VALUES (CURRENT_DATE, 'Infrastructure', 'Aggregated resource utilization checks', $1, 45.00) RETURNING *`,
      [recommendationText]
    );

    res.json([result.rows[0]]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`FinOps service running on port ${PORT}`);
});
