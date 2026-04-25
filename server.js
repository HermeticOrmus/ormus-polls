import express from 'express';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdirSync } from 'fs';
import { Buffer } from 'buffer';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 8096;

// Firebase configuration — set via env vars from your own Firebase project
const FIREBASE_PROJECT = process.env.FIREBASE_PROJECT_ID;
const FIREBASE_AUTH_DOMAIN = process.env.FIREBASE_AUTH_DOMAIN;
const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY;
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
const DB_PATH = process.env.DB_PATH || join(__dirname, 'data', 'polls.db');

if (!FIREBASE_PROJECT || !FIREBASE_AUTH_DOMAIN || !FIREBASE_API_KEY) {
  console.error('Missing required Firebase env vars: FIREBASE_PROJECT_ID, FIREBASE_AUTH_DOMAIN, FIREBASE_API_KEY');
  process.exit(1);
}
if (ADMIN_EMAILS.length === 0) {
  console.warn('ADMIN_EMAILS env var not set — no users will have admin access');
}

// ── Firebase ID token verification ──

let cachedCerts = null;
let certsExpiry = 0;

async function getGoogleCerts() {
  if (cachedCerts && Date.now() < certsExpiry) return cachedCerts;
  const res = await fetch('https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com');
  const certs = await res.json();
  const cc = res.headers.get('cache-control') || '';
  const match = cc.match(/max-age=(\d+)/);
  certsExpiry = Date.now() + (match ? parseInt(match[1]) * 1000 : 3600000);
  cachedCerts = certs;
  return certs;
}

function decodeBase64Url(str) {
  return Buffer.from(str.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

async function verifyFirebaseToken(idToken) {
  const parts = idToken.split('.');
  if (parts.length !== 3) throw new Error('Invalid token format');

  const header = JSON.parse(decodeBase64Url(parts[0]).toString());
  const payload = JSON.parse(decodeBase64Url(parts[1]).toString());

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp < now) throw new Error('Token expired');
  if (payload.iat > now + 10) throw new Error('Token issued in the future');
  if (payload.aud !== FIREBASE_PROJECT) throw new Error('Invalid audience');
  if (payload.iss !== `https://securetoken.google.com/${FIREBASE_PROJECT}`) throw new Error('Invalid issuer');
  if (!payload.sub) throw new Error('Missing subject');

  const certs = await getGoogleCerts();
  const cert = certs[header.kid];
  if (!cert) throw new Error('Unknown signing key');

  const { createVerify } = await import('crypto');
  const verifier = createVerify('RSA-SHA256');
  verifier.update(parts[0] + '.' + parts[1]);
  const isValid = verifier.verify(cert, decodeBase64Url(parts[2]));
  if (!isValid) throw new Error('Invalid signature');

  return payload;
}

async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing authorization token' });
  }
  try {
    req.firebaseUser = await verifyFirebaseToken(authHeader.slice(7));
    next();
  } catch (err) {
    return res.status(401).json({ error: `Auth failed: ${err.message}` });
  }
}

// ── Database ──

mkdirSync(join(__dirname, 'data'), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS polls (
    id TEXT PRIMARY KEY,
    slug TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    required_selections INTEGER NOT NULL,
    entries TEXT NOT NULL,
    status TEXT DEFAULT 'open',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS voters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS votes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    voter_id INTEGER NOT NULL,
    poll_id TEXT NOT NULL,
    entry_id TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (voter_id) REFERENCES voters(id),
    UNIQUE(voter_id, poll_id, entry_id)
  );

  CREATE INDEX IF NOT EXISTS idx_votes_voter_poll ON votes(voter_id, poll_id);
  CREATE INDEX IF NOT EXISTS idx_votes_poll ON votes(poll_id);
`);

// Add unique_entries column if missing (safe migration)
try {
  db.exec(`ALTER TABLE polls ADD COLUMN unique_entries INTEGER DEFAULT 0`);
} catch (_) { /* column already exists */ }

// Add vote_weight column to voters (safe migration)
try {
  db.exec(`ALTER TABLE voters ADD COLUMN vote_weight INTEGER DEFAULT 1`);
} catch (_) { /* column already exists */ }

// Ana Alicia Marcano's votes count as 2
db.prepare(`UPDATE voters SET vote_weight = 2 WHERE first_name = 'Ana' AND last_name LIKE '%Marcano%'`).run();

// Seed the first poll if it doesn't exist
const existingPoll = db.prepare('SELECT id FROM polls WHERE slug = ?').get('maestrosvisibles');
if (!existingPoll) {
  db.prepare(`INSERT INTO polls (id, slug, title, description, required_selections, entries) VALUES (?, ?, ?, ?, ?, ?)`).run(
    'founders-vote',
    'maestrosvisibles',
    'Maestros Visibles',
    'Selecciona los 14 Maestros Visibles de los 20 candidatos.',
    14,
    JSON.stringify([
      'Donald J. Trump',
      'Nikola Tesla',
      'Marian Rojas Estape',
      'Ana Alicia Marcano Ramirez',
      'Rudolf Steiner',
      'Frederik Alexander Medrano Righini',
      'Mama Mella',
      'Warren Buffet',
      'Leonardo Da Vinci',
      'Elon Musk',
      'Miyamoto Musashi',
      'Carl Jung',
      'Barachium Merida',
      'Amalgama Merida (Roberto Rodriguez)',
      'Galeno Merida (Raul Moreno)',
      'Hipocrates',
      'SPDA Amor De Las Esferas Doradas',
      'Paracelso',
      'Joyce',
      'SPDA Antares Merida',
    ])
  );
}

// Seed the second poll if it doesn't exist
// Ensure postulacion poll has unique_entries flag
db.prepare('UPDATE polls SET unique_entries = 1 WHERE slug = ?').run('postulacion-maestros-visibles');

const existingPoll2 = db.prepare('SELECT id FROM polls WHERE slug = ?').get('postulacion-maestros-visibles');
if (!existingPoll2) {
  db.prepare(`INSERT INTO polls (id, slug, title, description, required_selections, entries, unique_entries) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
    'postulacion-mv',
    'postulacion-maestros-visibles',
    'Postulacion de Maestros Visibles',
    'Selecciona 1 Maestro Visible de los 48 candidatos. Cada candidato solo puede ser elegido por una persona.',
    1,
    JSON.stringify([
      'Jābir ibn Ḥayyān',
      'Leonardo da Vinci',
      'René Schwaller de Lubicz',
      'Robert Boyle',
      'Ada Lovelace',
      'Marie Curie',
      'Thomas Edison',
      'Fei-Fei Li',
      'Yoshua Bengio',
      'Hipócrates',
      'Joseph L. Greenstein, «Mighty Atom»',
      'John Dewey',
      'Al-Ghazali',
      'Carl Jung',
      'Ibn Arabi',
      'Ramana Maharshi',
      'Paracelso',
      'Carlos Raúl Villanueva',
      'Isambard Kingdom Brunel',
      'Jane Jacobs',
      'Le Corbusier',
      'Norman Ernest Borlaug',
      'Thomas Malthus',
      'Buckminster Fuller',
      'Elon Musk',
      'Marco Tulio Cicerón',
      'Charles Thomas Munger',
      'Indra Nooyi',
      'Warren Buffett',
      'Fyodor Dostoevski',
      'Hans Ulrich',
      'Jesús Rafael Soto',
      'Michelangelo Buonarroti',
      'Miguel de Cervantes',
      'William Shakespeare',
      'Miyamoto Musashi',
      'Sun Tzu',
      'Henry Kissinger',
      'Klemens von Metternich',
      'SPDA Jessa O\'My Heart',
      'SPDA Adi Da Samraj',
      'SPDA Abuelo Bolívar',
      'SPDA Querubín Queta',
      'SPDA Óscar Giovanny Queta',
      'Serapis Bey',
      'Sanat Kumara',
      'Aleister Crowley',
      'Allan Kardec',
    ]),
    1  // unique_entries = true
  );
}

// Seed the final selection poll if it doesn't exist
const existingPoll3 = db.prepare('SELECT id FROM polls WHERE slug = ?').get('seleccion-maestros-visibles');
if (!existingPoll3) {
  db.prepare(`INSERT INTO polls (id, slug, title, description, required_selections, entries) VALUES (?, ?, ?, ?, ?, ?)`).run(
    'seleccion-mv',
    'seleccion-maestros-visibles',
    'Seleccion de Maestros Visibles',
    'De los 18 candidatos postulados, selecciona los 14 que seran los Maestros Visibles.',
    14,
    JSON.stringify([
      'Allan Kardec',
      'Buckminster Fuller',
      'Carl Jung',
      'Charles Thomas Munger',
      'Elon Musk',
      'Fyodor Dostoevski',
      'Hipócrates',
      'Indra Nooyi',
      'Leonardo da Vinci',
      'Marie Curie',
      'Michelangelo Buonarroti',
      'Miyamoto Musashi',
      'René Schwaller de Lubicz',
      'Sanat Kumara',
      'Serapis Bey',
      'SPDA Jessa O\'My Heart',
      'SPDA Querubín Queta',
      'Warren Buffett',
    ])
  );
}

const stmts = {
  findVoter: db.prepare('SELECT * FROM voters WHERE email = ?'),
  createVoter: db.prepare('INSERT INTO voters (email, first_name, last_name) VALUES (?, ?, ?)'),
  getVoterVotes: db.prepare('SELECT entry_id FROM votes WHERE voter_id = ? AND poll_id = ?'),
  deleteVoterVotes: db.prepare('DELETE FROM votes WHERE voter_id = ? AND poll_id = ?'),
  insertVote: db.prepare('INSERT INTO votes (voter_id, poll_id, entry_id) VALUES (?, ?, ?)'),
  countVoters: db.prepare(`
    SELECT COALESCE(SUM(v.vote_weight), 0) as count
    FROM (SELECT DISTINCT voter_id FROM votes WHERE poll_id = ?) dv
    INNER JOIN voters v ON v.id = dv.voter_id
  `),
  tallyVotes: db.prepare(`
    SELECT vo.entry_id, SUM(v.vote_weight) as count
    FROM votes vo
    INNER JOIN voters v ON v.id = vo.voter_id
    WHERE vo.poll_id = ?
    GROUP BY vo.entry_id ORDER BY count DESC
  `),
  getPoll: db.prepare('SELECT * FROM polls WHERE slug = ?'),
  getPollById: db.prepare('SELECT * FROM polls WHERE id = ?'),
  allPolls: db.prepare('SELECT id, slug, title, description, required_selections, status, created_at FROM polls ORDER BY created_at DESC'),
  takenEntries: db.prepare(`
    SELECT vo.entry_id, v.first_name, v.last_name, v.id as voter_id
    FROM votes vo
    INNER JOIN voters v ON v.id = vo.voter_id
    WHERE vo.poll_id = ?
  `),
};

app.use(express.json());
app.use(express.static(join(__dirname, 'static')));

// ── Routes ──

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'ormus-polls' });
});

// Firebase client config — served as JS so HTML can load it as a regular
// <script> before initializing Firebase. Configure via env vars; no need
// to edit static HTML.
app.get('/api/config.js', (_req, res) => {
  const cfg = {
    apiKey: FIREBASE_API_KEY,
    authDomain: FIREBASE_AUTH_DOMAIN,
    projectId: FIREBASE_PROJECT,
  };
  res.type('application/javascript').send(`window.FIREBASE_CONFIG = ${JSON.stringify(cfg)};`);
});

// Admin results page
app.get('/:slug/results', (req, res) => {
  const poll = stmts.getPoll.get(req.params.slug);
  if (!poll) return res.status(404).sendFile(join(__dirname, 'static', 'index.html'));
  res.sendFile(join(__dirname, 'static', 'results.html'));
});

// Info page for a poll's candidates
app.get('/:slug/info', (req, res) => {
  const poll = stmts.getPoll.get(req.params.slug);
  if (!poll) return res.status(404).sendFile(join(__dirname, 'static', 'index.html'));
  res.sendFile(join(__dirname, 'static', 'info.html'));
});

// Serve poll page for any slug
app.get('/:slug', (req, res) => {
  const poll = stmts.getPoll.get(req.params.slug);
  if (!poll) return res.status(404).sendFile(join(__dirname, 'static', 'index.html'));
  res.sendFile(join(__dirname, 'static', 'poll.html'));
});

// ── API ──

// List all polls
app.get('/api/polls', (_req, res) => {
  const polls = stmts.allPolls.all();
  const enriched = polls.map(p => {
    const voterCount = stmts.countVoters.get(p.id);
    return { ...p, totalVoters: voterCount.count };
  });
  res.json(enriched);
});

// Get single poll data
app.get('/api/polls/:slug', (req, res) => {
  const poll = stmts.getPoll.get(req.params.slug);
  if (!poll) return res.status(404).json({ error: 'Poll not found' });
  const voterCount = stmts.countVoters.get(poll.id);

  const result = { ...poll, entries: JSON.parse(poll.entries), totalVoters: voterCount.count };

  // For unique_entries polls, include which entries are taken and by whom
  if (poll.unique_entries) {
    const taken = stmts.takenEntries.all(poll.id);
    result.takenEntries = {};
    for (const t of taken) {
      result.takenEntries[t.entry_id] = {
        name: `${t.first_name} ${t.last_name}`,
        voterId: t.voter_id,
      };
    }
  }

  res.json(result);
});

// Register / identify voter
app.post('/api/voter', requireAuth, (req, res) => {
  const { firstName, lastName, pollId } = req.body;
  const email = req.firebaseUser.email;

  if (!email) return res.status(400).json({ error: 'No email in auth token' });
  if (!firstName || !lastName) return res.status(400).json({ error: 'First name and last name are required' });

  const normalizedEmail = email.trim().toLowerCase();
  const trimFirst = firstName.trim();
  const trimLast = lastName.trim();

  let voter = stmts.findVoter.get(normalizedEmail);

  if (voter) {
    const existingVotes = stmts.getVoterVotes.all(voter.id, pollId || 'founders-vote');
    return res.json({
      voter: { id: voter.id, email: voter.email, firstName: voter.first_name, lastName: voter.last_name },
      existingVotes: existingVotes.map(v => v.entry_id),
    });
  }

  const result = stmts.createVoter.run(normalizedEmail, trimFirst, trimLast);
  res.json({
    voter: { id: result.lastInsertRowid, email: normalizedEmail, firstName: trimFirst, lastName: trimLast },
    existingVotes: [],
  });
});

// Submit votes
app.post('/api/vote', requireAuth, (req, res) => {
  const { voterId, pollId, selections } = req.body;

  const poll = stmts.getPollById.get(pollId);
  if (!poll) return res.status(404).json({ error: 'Poll not found' });
  if (poll.status !== 'open') return res.status(400).json({ error: 'Poll is closed' });

  if (!voterId || !Array.isArray(selections)) {
    return res.status(400).json({ error: 'Voter ID and selections array required' });
  }

  if (selections.length !== poll.required_selections) {
    return res.status(400).json({ error: `Exactly ${poll.required_selections} selections required, got ${selections.length}` });
  }

  const voter = stmts.findVoter.get(req.firebaseUser.email.trim().toLowerCase());
  if (!voter || voter.id !== voterId) {
    return res.status(403).json({ error: 'Not authorized to vote as this user' });
  }

  // Unique entries check: reject if any selection is taken by another voter
  if (poll.unique_entries) {
    const taken = stmts.takenEntries.all(poll.id);
    for (const t of taken) {
      if (selections.includes(t.entry_id) && t.voter_id !== voterId) {
        return res.status(409).json({
          error: `"${t.entry_id}" ya fue elegido por ${t.first_name} ${t.last_name}`,
        });
      }
    }
  }

  const submit = db.transaction((vid, pid, entries) => {
    stmts.deleteVoterVotes.run(vid, pid);
    for (const entry of entries) {
      stmts.insertVote.run(vid, pid, entry);
    }
  });

  try {
    submit(voterId, pollId, selections);
    res.json({ success: true, message: 'Vote recorded' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to record vote' });
  }
});

// Results (public tally)
app.get('/api/results/:pollId', (req, res) => {
  const poll = stmts.getPollById.get(req.params.pollId);
  if (!poll) return res.status(404).json({ error: 'Poll not found' });
  const tally = stmts.tallyVotes.all(poll.id);
  const voterCount = stmts.countVoters.get(poll.id);
  res.json({ poll: poll.id, title: poll.title, totalVoters: voterCount.count, results: tally });
});

// Admin results (full breakdown — admin only)
app.get('/api/admin/results/:slug', requireAuth, (req, res) => {
  if (!ADMIN_EMAILS.includes(req.firebaseUser.email.toLowerCase())) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const poll = stmts.getPoll.get(req.params.slug);
  if (!poll) return res.status(404).json({ error: 'Poll not found' });

  const entries = JSON.parse(poll.entries);
  const tally = stmts.tallyVotes.all(poll.id);
  const voterCount = stmts.countVoters.get(poll.id);

  // Get all voters who voted in this poll with their selections
  const voterRows = db.prepare(`
    SELECT v.id, v.email, v.first_name, v.last_name, v.created_at,
           GROUP_CONCAT(vo.entry_id, '||') as selections
    FROM voters v
    INNER JOIN votes vo ON vo.voter_id = v.id AND vo.poll_id = ?
    GROUP BY v.id
    ORDER BY v.created_at DESC
  `).all(poll.id);

  const voters = voterRows.map(v => ({
    id: v.id,
    email: v.email,
    firstName: v.first_name,
    lastName: v.last_name,
    votedAt: v.created_at,
    selections: v.selections ? v.selections.split('||') : [],
  }));

  // Entries not selected by anyone
  const tallyMap = Object.fromEntries(tally.map(t => [t.entry_id, t.count]));
  const ranked = entries.map(e => ({
    name: e,
    votes: tallyMap[e] || 0,
    pct: voterCount.count > 0 ? Math.round(((tallyMap[e] || 0) / voterCount.count) * 100) : 0,
  })).sort((a, b) => b.votes - a.votes);

  res.json({
    poll: { id: poll.id, slug: poll.slug, title: poll.title, status: poll.status, required: poll.required_selections },
    totalVoters: voterCount.count,
    totalEntries: entries.length,
    ranked,
    voters,
  });
});

app.listen(PORT, () => {
  console.log(`Ormus Polls running on :${PORT}`);
});
