import express from 'express';
import cors from 'cors';
import path from 'path';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import serverless from 'serverless-http';
import { db } from './db.js';
import { traverseTree } from './services/graphTraversal.js';
import { validateDepth } from './utils/validateDepth.js';
import { searchMembers } from './utils/searchMembers.js';
import { describeRelationship } from './services/aiRelationship.js';
import { rateLimiter } from './middleware/rateLimiter.js';
import { getRelationsFrom } from './services/relationQueries.js';
import { isDuplicate } from './utils/duplicateCheck.js';

const app = express();
app.use(cors());
app.use(express.json());

// Serve static uploads
app.use('/uploads', express.static('uploads'));

// Multer config
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname)}`)
});
const upload = multer({ storage });

// Auth check middleware
const auth = (req, res, next) => {
  const phone = req.headers['x-user-phone'];
  if (!phone) return res.status(401).json({ error: 'Login required' });
  req.userPhone = phone;
  next();
};

// --- Members API ---

// Search endpoint — must be defined before /:id routes to avoid Express treating "search" as an :id parameter
app.get('/api/members/search', async (req, res) => {
  try {
    const query = req.query.q;
    if (!query || query.length < 2) {
      return res.status(400).json({ error: 'Search query must be at least 2 characters' });
    }

    const result = await db.query('MEMBERS', 'MEMBER#');
    const members = result.Items || [];

    const matches = searchMembers(members, query);

    res.json(matches);
  } catch (err) {
    console.error('FAILED TO SEARCH MEMBERS:', err);
    res.status(500).json({ error: err.message });
  }
});

// Tree traversal endpoint — must be defined before /api/members to avoid route conflicts
app.get('/api/members/:id/tree', async (req, res) => {
  try {
    const { id } = req.params;

    // Parse and validate depth query parameter
    let depth = 2; // default
    if (req.query.depth !== undefined) {
      const result = validateDepth(req.query.depth);
      if (!result.valid) {
        return res.status(400).json({ error: result.error });
      }
      depth = result.depth;
    }

    // Verify member exists
    const existing = await db.get('MEMBERS', `MEMBER#${id}`);
    if (!existing.Item) {
      return res.status(404).json({ error: 'Member not found' });
    }

    // Traverse the tree and return the subgraph
    const result = await traverseTree(id, depth);
    res.json(result);
  } catch (err) {
    console.error('FAILED TO LOAD TREE:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/members', async (req, res) => {
  try {
    const result = await db.query('MEMBERS', 'MEMBER#');
    res.json(result.Items || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/members', auth, async (req, res) => {
  const { name, dob, manualAge, location, phone, photoUrl, gender, x, y } = req.body;
  const id = uuidv4();
  const now = new Date().toISOString();
  const member = {
    PK: 'MEMBERS',
    SK: `MEMBER#${id}`,
    id,
    name,
    dob, // Can be ISO date or null
    manualAge, // Number if DOB is null
    location,
    phone,
    photoUrl,
    gender: gender || 'Other',
    type: 'MEMBER',
    updatedAt: now,
    createdAt: now,
    createdBy: req.userPhone
  };
  try {
    await db.put(member);
    res.json(member);
  } catch (err) {
    console.error('FAILED TO CREATE MEMBER:', err);
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/members/:id', auth, async (req, res) => {
  const { id } = req.params;
  const { name, dob, manualAge, location, phone, photoUrl, gender, x, y } = req.body;
  const now = new Date().toISOString();
  try {
    const existing = await db.get('MEMBERS', `MEMBER#${id}`);
    if (!existing.Item) return res.status(404).json({ error: 'Not found' });
    
    const updated = {
      ...existing.Item,
      name, dob, manualAge, location, phone, photoUrl, gender,
      updatedAt: now
    };
    await db.put(updated);
    res.json(updated);
  } catch (err) {
    console.error('FAILED TO UPDATE MEMBER:', err);
    res.status(500).json({ error: err.message });
  }
});

// --- Relations API ---

app.get('/api/relations', async (req, res) => {
  try {
    const result = await db.query('RELATIONS', 'REL#');
    const relations = result.Items?.map(item => ({
        ...item,
        id: item.id || item.SK?.replace('REL#', '')
    })) || [];
    console.log(`FETCHED ${relations.length} RELATIONS`);
    res.json(relations);
  } catch (err) {
    console.error('FAILED TO FETCH RELATIONS:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/relations', auth, async (req, res) => {
  const { fromId, toId, type } = req.body;
  if (!fromId || !toId || !type) {
      console.error('MISSING RELATION DATA:', req.body);
      return res.status(400).json({ error: 'Missing IDs or type' });
  }
  
  try {
      // Check forward direction: fromId -> toId with same type
      const forwardRelations = await getRelationsFrom(fromId);
      // Check reverse direction: toId -> fromId with same type
      const reverseRelations = await getRelationsFrom(toId);

      if (isDuplicate(forwardRelations, reverseRelations, fromId, toId, type)) {
          return res.status(400).json({ error: 'Relation already exists' });
      }
  } catch (checkErr) {
      console.warn('Failed to verify dupes:', checkErr);
  }
  
  const relationId = uuidv4(); 
  const relation = {
    PK: 'RELATIONS',
    SK: `REL#${relationId}`,
    id: relationId,
    fromId,
    toId,
    type,
    createdAt: new Date().toISOString(),
    createdBy: req.userPhone
  };
  
  console.log('CREATING RELATION:', relation);

  try {
    const result = await db.put(relation);
    console.log('RELATION SAVED SUCCESSFULLY');
    res.json(relation);
  } catch (err) {
    console.error('FAILED TO SAVE RELATION:', err);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/relations/:id', auth, async (req, res) => {
  const { id } = req.params;
  try {
    const existing = await db.get('RELATIONS', `REL#${id}`);
    if (!existing.Item) return res.status(404).json({ error: 'Not found' });
    
    await db.delete('RELATIONS', `REL#${id}`);
    console.log('RELATION DELETED:', id);
    res.json({ success: true });
  } catch (err) {
    console.error('FAILED TO DELETE RELATION:', err);
    res.status(500).json({ error: err.message });
  }
});

// Photo Upload
app.post('/api/upload', auth, upload.single('photo'), (req, res) => {
  if (!req.file) return res.status(400).send('No file uploaded.');
  const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
  res.json({ fileUrl });
});

// --- AI API ---

app.post('/api/ai/relationship', auth, rateLimiter(10, 60000), async (req, res) => {
  try {
    if (!process.env.GOOGLE_AI_API_KEY) {
      return res.status(500).json({ error: 'AI service not configured' });
    }

    const { fromMemberId, toMemberId } = req.body;
    if (!fromMemberId || !toMemberId) {
      return res.status(400).json({ error: 'Both fromMemberId and toMemberId are required' });
    }

    const result = await describeRelationship(fromMemberId, toMemberId);
    res.json(result);
  } catch (err) {
    console.error('FAILED TO DESCRIBE RELATIONSHIP:', err);
    res.status(500).json({ error: err.message });
  }
});

export const handler = serverless(app);
export default app;
