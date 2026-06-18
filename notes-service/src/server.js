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
app.get('/health', (req, res) => res.status(200).json({ status: 'ok', service: 'notes-service' }));

// Create a new note
app.post('/notes', validateToken, checkRelationship('userId'), async (req, res) => {
  try {
    const { userId, elderId, category, content } = req.body;
    const targetId = elderId || userId;
    const authorId = req.user.userId;

    if (!targetId || !category || !content) {
      return res.status(400).json({ error: 'elderId (or userId), category, and content are required' });
    }

    const validCategories = ['PATIENT', 'FAMILY', 'CAREGIVER', 'DOCTOR', 'AI'];
    if (!validCategories.includes(category.toUpperCase())) {
      return res.status(400).json({ error: `Invalid category. Allowed: ${validCategories.join(', ')}` });
    }

    // Map category to db note_type
    let noteType = 'MANUAL_NOTE';
    if (category.toUpperCase() === 'AI') noteType = 'AI_NOTE';
    else if (category.toUpperCase() === 'DOCTOR') noteType = 'DOCTOR_NOTE';

    const result = await pool.query(
      `INSERT INTO notes (user_id, author_id, note_type, content, note_category)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [targetId, authorId, noteType, content, category.toUpperCase()]
    );
    const createdNote = result.rows[0];

    // Audit Log
    const auditAction = category.toUpperCase() === 'AI' ? 'AI_NOTE_CREATED' : 'CREATE_NOTE';
    await logAudit(req, auditAction, 'notes', createdNote.id, 'SUCCESS', `Note created with category: ${category}`);

    res.status(201).json(createdNote);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Search notes (supports both GET /notes/search/:elderId and GET /notes/search?elderId=...)
const searchHandler = async (req, res) => {
  try {
    const elderId = req.params.elderId || req.query.elderId;
    if (!elderId) {
      return res.status(400).json({ error: 'elderId is required for notes search' });
    }

    const { category, author, startDate, endDate, keyword } = req.query;

    let sql = `
      SELECT n.*, u.username as author_name 
      FROM notes n 
      JOIN users u ON n.author_id = u.id 
      WHERE n.user_id = $1
    `;
    const params = [elderId];
    let index = 2;

    if (category) {
      sql += ` AND n.note_category = $${index++}`;
      params.push(category.toUpperCase());
    }
    if (author) {
      sql += ` AND u.username ILIKE $${index++}`;
      params.push(`%${author}%`);
    }
    if (startDate) {
      sql += ` AND n.created_at >= $${index++}`;
      params.push(startDate);
    }
    if (endDate) {
      sql += ` AND n.created_at <= $${index++}`;
      params.push(endDate);
    }
    if (keyword) {
      sql += ` AND n.content ILIKE $${index++}`;
      params.push(`%${keyword}%`);
    }

    sql += ' ORDER BY n.created_at DESC';
    const result = await pool.query(sql, params);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

app.get('/notes/search/:elderId', validateToken, checkRelationship('elderId'), searchHandler);
app.get('/notes/search', validateToken, checkRelationship('elderId'), searchHandler);

// Get notes for a specific elder
app.get('/notes/:elderId', validateToken, checkRelationship('elderId'), async (req, res) => {
  try {
    const { elderId } = req.params;
    const result = await pool.query(
      `SELECT n.*, u.username as author_name 
       FROM notes n 
       JOIN users u ON n.author_id = u.id 
       WHERE n.user_id = $1 
       ORDER BY n.created_at DESC`,
      [elderId]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Alias route to fetch notes by user ID
app.get('/notes/user/:userId', validateToken, checkRelationship('userId'), async (req, res) => {
  try {
    const { userId } = req.params;
    const result = await pool.query(
      `SELECT n.*, u.username as author_name 
       FROM notes n 
       JOIN users u ON n.author_id = u.id 
       WHERE n.user_id = $1 
       ORDER BY n.created_at DESC`,
      [userId]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update an existing note
app.put('/notes/:id', validateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { category, content } = req.body;

    // Fetch note to check ownership
    const noteRes = await pool.query('SELECT * FROM notes WHERE id = $1', [id]);
    if (noteRes.rows.length === 0) {
      return res.status(404).json({ error: 'Note not found' });
    }
    const note = noteRes.rows[0];

    // Authorize note edit (Only Admin or author)
    let allowed = false;
    if (req.user.role === 'SUPER_ADMIN' || req.user.role === 'ADMIN') {
      allowed = true;
    } else if (String(req.user.userId) === String(note.author_id)) {
      allowed = true;
    }

    if (!allowed) {
      return res.status(403).json({ error: 'Forbidden: Insufficient permissions to update this note' });
    }

    let noteType = undefined;
    if (category) {
      const validCategories = ['PATIENT', 'FAMILY', 'CAREGIVER', 'DOCTOR', 'AI'];
      if (!validCategories.includes(category.toUpperCase())) {
        return res.status(400).json({ error: 'Invalid category choice' });
      }
      noteType = 'MANUAL_NOTE';
      if (category.toUpperCase() === 'AI') noteType = 'AI_NOTE';
      else if (category.toUpperCase() === 'DOCTOR') noteType = 'DOCTOR_NOTE';
    }

    const result = await pool.query(
      `UPDATE notes 
       SET content = COALESCE($1, content),
           note_category = COALESCE($2, note_category),
           note_type = COALESCE($3, note_type),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $4 RETURNING *`,
      [content, category ? category.toUpperCase() : null, noteType, id]
    );

    // Audit Log
    await logAudit(req, 'UPDATE_NOTE', 'notes', id, 'SUCCESS', 'Note content/category updated');

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete a note
app.delete('/notes/:id', validateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Fetch note to check ownership
    const noteRes = await pool.query('SELECT * FROM notes WHERE id = $1', [id]);
    if (noteRes.rows.length === 0) {
      return res.status(404).json({ error: 'Note not found' });
    }
    const note = noteRes.rows[0];

    // Authorize note deleting
    let allowed = false;
    if (req.user.role === 'SUPER_ADMIN' || req.user.role === 'ADMIN') {
      allowed = true;
    } else if (String(req.user.userId) === String(note.author_id)) {
      allowed = true;
    }

    if (!allowed) {
      return res.status(403).json({ error: 'Forbidden: Insufficient permissions to delete note' });
    }

    await pool.query('DELETE FROM notes WHERE id = $1', [id]);

    // Audit Log
    await logAudit(req, 'DELETE_NOTE', 'notes', id, 'SUCCESS', 'Note deleted successfully');

    res.json({ message: 'Note deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// AI placeholder generation endpoint
app.post('/notes/ai', validateToken, checkRelationship('elderId'), async (req, res) => {
  try {
    const { elderId, content, vitals } = req.body;
    const authorId = req.user.userId;

    if (!elderId) {
      return res.status(400).json({ error: 'elderId is required' });
    }

    const mockContent = content || `[MOCK AI SUMMARY] Health log assessment check completed. SpO2 parameters and blood pressure are steady. Recommended precautions: maintain daily tracking, regular exercise.`;

    const result = await pool.query(
      `INSERT INTO notes (user_id, author_id, note_type, content, note_category)
       VALUES ($1, $2, 'AI_NOTE', $3, 'AI') RETURNING *`,
      [elderId, authorId, mockContent]
    );
    const aiNote = result.rows[0];

    // Audit Log
    await logAudit(req, 'AI_NOTE_CREATED', 'notes', aiNote.id, 'SUCCESS', 'AI clinical notes summary generated');

    res.status(201).json(aiNote);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Notes service running on port ${PORT}`);
});
