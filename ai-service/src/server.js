const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');
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

// Amazon Bedrock Client setup
const awsRegion = process.env.AWS_REGION || 'us-east-1';
let bedrockClient = null;
try {
  // Configured dynamically. If AWS configs are not present (local testing), we use fallback mock responses
  bedrockClient = new BedrockRuntimeClient({ region: awsRegion });
} catch (err) {
  console.log('⚠️ Amazon Bedrock runtime client could not initialize. Operating in mock mode.', err.message);
}

// Liveness probe
app.get('/health', (req, res) => res.status(200).json({ status: 'ok', service: 'ai-service' }));

// Helper to invoke Bedrock model or fallback to mockup
async function generateAIResponse(prompt, capability, modelId = 'anthropic.claude-3-haiku-20240307-v1:0') {
  if (bedrockClient && process.env.AWS_ACCESS_KEY_ID) {
    try {
      const payload = {
        anthropic_version: "bedrock-2023-05-31",
        max_tokens: 1000,
        messages: [{ role: "user", content: prompt }]
      };
      const command = new InvokeModelCommand({
        modelId: modelId,
        contentType: 'application/json',
        accept: 'application/json',
        body: JSON.stringify(payload)
      });
      const response = await bedrockClient.send(command);
      const resPayload = JSON.parse(Buffer.from(response.body).toString('utf-8'));
      const textResponse = resPayload.content[0].text;
      
      // Return details for audit tracking
      return {
        response: textResponse,
        inputTokens: resPayload.usage?.input_tokens || 0,
        outputTokens: resPayload.usage?.output_tokens || 0,
        cost: ((resPayload.usage?.input_tokens || 0) * 0.00025 + (resPayload.usage?.output_tokens || 0) * 0.00125) / 1000
      };
    } catch (err) {
      console.error('Amazon Bedrock invocation error, calling local fallback:', err.message);
    }
  }

  // Local Mock Fallback when running outside of AWS or in sandbox environments
  let responseText = `Mock response for: ${capability}. `;
  if (capability === 'symptom_check') {
    responseText += `Based on the provided symptoms, it is recommended to maintain hydration, rest, and log metrics regularly. Please seek a certified general practitioner if status degrades.`;
  } else if (capability === 'qa') {
    responseText += `Elderly individuals require a nutrient-dense diet containing high fiber, lean proteins, calcium, and Vitamin D. Exclude excess sodium.`;
  } else if (capability === 'risk_analysis') {
    responseText += `Risk parameters: Normal. Vitals patterns reflect steady levels. Daily compliance metrics verified at 94%.`;
  } else if (capability === 'finops_recs') {
    responseText += `FinOps Recommendation: scale down inactive EKS worker nodes during off-peak hours (10PM-6AM). Consolidate database instances to AWS Aurora Serverless v2 instances to save ~32% on monthly charges.`;
  } else {
    responseText += `AI Processing successful. Text analyzed.`;
  }

  return {
    response: responseText,
    inputTokens: prompt.length / 4,
    outputTokens: responseText.length / 4,
    cost: 0.00
  };
}

// General AI queries (Q&A, symptom checks, medication, risk assessment)
app.post('/ai/query', validateToken, checkRelationship('userId'), async (req, res) => {
  try {
    const { userId, capability, query } = req.body;
    if (!userId || !capability || !query) {
      return res.status(400).json({ error: 'userId, capability, and query are required' });
    }

    const prompt = `System: You are an intelligent healthcare assistant helping an elder/caregiver. Scoped capability: ${capability}. User query: ${query}`;
    const result = await generateAIResponse(prompt, capability);

    // Write to audit log in PostgreSQL
    await pool.query(
      `INSERT INTO ai_interactions (user_id, model_id, capability, prompt_payload, response_payload, input_tokens, output_tokens, estimated_cost)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [userId, 'anthropic.claude-3-haiku', capability, query, result.response, Math.round(result.inputTokens), Math.round(result.outputTokens), result.cost]
    );

    res.json({ result: result.response });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Voice check-in (Receives voice-transcribed text, processes it, creates summary note)
app.post('/ai/voice-checkin', validateToken, checkRelationship('userId'), async (req, res) => {
  try {
    const { userId, transcribedText } = req.body;
    if (!userId || !transcribedText) {
      return res.status(400).json({ error: 'userId and transcribedText are required' });
    }

    const prompt = `Analyze the following voice checkin transcript from an elderly patient. Summarize key issues, concerns, pain points, or notes. Keep the summary under 150 words. Transcript: "${transcribedText}"`;
    const result = await generateAIResponse(prompt, 'voice_summary');

    // Create Note in notes-service
    const notesServiceUrl = process.env.NOTES_SERVICE_URL || 'http://notes-service:3000';
    const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
    const noteResponse = await fetch(`${notesServiceUrl}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': req.headers.authorization },
      body: JSON.stringify({
        userId: userId,
        noteType: 'AI_NOTE',
        content: `AI Generated Voice Check-in Summary: ${result.response}`
      })
    });

    // Logging AI interaction
    await pool.query(
      `INSERT INTO ai_interactions (user_id, model_id, capability, prompt_payload, response_payload, input_tokens, output_tokens, estimated_cost)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [userId, 'anthropic.claude-3-haiku', 'voice_summary', transcribedText, result.response, Math.round(result.inputTokens), Math.round(result.outputTokens), result.cost]
    );

    let note = null;
    if (noteResponse.ok) {
      note = await noteResponse.json();
    }

    res.json({ summary: result.response, createdNote: note });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Cost optimization advisor (FinOps insights)
app.post('/ai/finops-recs', validateToken, async (req, res) => {
  try {
    const { costMetricsString } = req.body;
    const prompt = `Analyze the following infrastructure billing breakdown and suggest specific cost optimization improvements for EKS, RDS, and Bedrock: "${costMetricsString || 'Default metrics profile'}"`;
    const result = await generateAIResponse(prompt, 'finops_recs');

    res.json({ recommendation: result.response });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Fetch AI interactions summary for Super Admin
app.get('/ai/interactions', validateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM ai_interactions ORDER BY created_at DESC LIMIT 100');
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`AI service running on port ${PORT}`);
});
