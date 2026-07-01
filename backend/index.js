import express from 'express';
import cors from 'cors';
import path from 'path';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import serverless from 'serverless-http';

import { listMembers, getMember, createMember, updateMember, updatePosition } from './store/members.js';
import { listRelations, createRelation, deleteRelation, relationExists } from './store/relations.js';
import { linkComponents, componentInfo } from './store/components.js';
import { traverseTree } from './services/traversal.js';
import { validateDepth } from './utils/validateDepth.js';
import { searchMembers } from './utils/searchMembers.js';
import { describeRelationship } from './services/aiRelationship.js';
import { rateLimiter } from './middleware/rateLimiter.js';
import { listPacks } from './services/kinship/index.js';

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

// Identity middleware: phone is a handle only (no auth yet).
const auth = (req, res, next) => {
  const phone = req.headers['x-user-phone'];
  if (!phone) return res.status(401).json({ error: 'Login required' });
  req.userPhone = phone;
  next();
};

// --- Members API ---

// Search — defined before /:id routes so "search" isn't treated as an :id.
app.get('/api/members/search', async (req, res) => {
  try {
    const query = req.query.q;
    if (!query || query.length < 2) {
      return res.status(400).json({ error: 'Search query must be at least 2 characters' });
    }
    const members = await listMembers();
    res.json(searchMembers(members, query));
  } catch (err) {
    console.error('FAILED TO SEARCH MEMBERS:', err);
    res.status(500).json({ error: err.message });
  }
});

// Tree traversal — defined before /api/members/:id to avoid route conflicts.
app.get('/api/members/:id/tree', async (req, res) => {
  try {
    const { id } = req.params;

    let depth = 2;
    if (req.query.depth !== undefined) {
      const result = validateDepth(req.query.depth);
      if (!result.valid) return res.status(400).json({ error: result.error });
      depth = result.depth;
    }

    const existing = await getMember(id);
    if (!existing) return res.status(404).json({ error: 'Member not found' });

    const result = await traverseTree(id, depth);
    res.json(result);
  } catch (err) {
    console.error('FAILED TO LOAD TREE:', err);
    res.status(500).json({ error: err.message });
  }
});

// Component info — "largest tree you're part of".
app.get('/api/members/:id/component', async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await getMember(id);
    if (!existing) return res.status(404).json({ error: 'Member not found' });
    res.json(await componentInfo(id));
  } catch (err) {
    console.error('FAILED TO LOAD COMPONENT:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/members', async (req, res) => {
  try {
    res.json(await listMembers());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/members', auth, async (req, res) => {
  const { name, dob, manualAge, location, phone, photoUrl, gender, x, y } = req.body;
  const id = uuidv4();
  try {
    const member = await createMember(id, {
      name, dob, manualAge, location, phone, photoUrl, gender, x, y,
      createdBy: req.userPhone,
    });
    res.json(member);
  } catch (err) {
    console.error('FAILED TO CREATE MEMBER:', err);
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/members/:id', auth, async (req, res) => {
  const { id } = req.params;
  try {
    const existing = await getMember(id);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    const updated = await updateMember(id, req.body);
    res.json(updated);
  } catch (err) {
    console.error('FAILED TO UPDATE MEMBER:', err);
    res.status(500).json({ error: err.message });
  }
});

// Persist a dragged node position.
app.patch('/api/members/:id/position', auth, async (req, res) => {
  const { id } = req.params;
  const { x, y } = req.body;
  try {
    await updatePosition(id, x, y);
    res.json({ success: true });
  } catch (err) {
    console.error('FAILED TO UPDATE POSITION:', err);
    res.status(500).json({ error: err.message });
  }
});

// --- Relations API ---

app.get('/api/relations', async (req, res) => {
  try {
    res.json(await listRelations());
  } catch (err) {
    console.error('FAILED TO FETCH RELATIONS:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/relations', auth, async (req, res) => {
  const { fromId, toId, type } = req.body;
  if (!fromId || !toId || !type) {
    return res.status(400).json({ error: 'Missing IDs or type' });
  }

  try {
    if (await relationExists(fromId, toId, type)) {
      return res.status(400).json({ error: 'Relation already exists' });
    }
  } catch (checkErr) {
    console.warn('Failed to verify dupes:', checkErr);
  }

  try {
    const relation = await createRelation({ fromId, toId, type, createdBy: req.userPhone });
    // Merge the two members' connected components (non-fatal on failure).
    linkComponents(fromId, toId).catch((e) => console.warn('linkComponents failed:', e.message));
    res.json(relation);
  } catch (err) {
    console.error('FAILED TO SAVE RELATION:', err);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/relations/:id', auth, async (req, res) => {
  const { id } = req.params;
  try {
    const removed = await deleteRelation(id);
    if (!removed) return res.status(404).json({ error: 'Not found' });
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

// --- Kinship API ---

// Available terminology packs (spoken Tamil, Iyer, ...).
app.get('/api/kinship/packs', (req, res) => {
  res.json(listPacks());
});

app.post('/api/ai/relationship', auth, rateLimiter(10, 60000), async (req, res) => {
  try {
    const { fromMemberId, toMemberId, packId } = req.body;
    if (!fromMemberId || !toMemberId) {
      return res.status(400).json({ error: 'Both fromMemberId and toMemberId are required' });
    }
    const result = await describeRelationship(fromMemberId, toMemberId, packId);
    res.json(result);
  } catch (err) {
    console.error('FAILED TO DESCRIBE RELATIONSHIP:', err);
    res.status(500).json({ error: err.message });
  }
});

export const handler = serverless(app);
export default app;
