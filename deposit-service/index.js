'use strict';
const express = require('express');
const admin = require('firebase-admin');
const { nanoid } = require('nanoid');
const app = express();

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'https://ridercms-ced94.web.app').split(',');
const FIREBASE_RTDB_URL = process.env.FIREBASE_RTDB_URL || '';
const REQUIRE_AUTH = process.env.REQUIRE_AUTH !== 'false';

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    databaseURL: FIREBASE_RTDB_URL || undefined
  });
}
const db = admin.database();
app.use(express.json({ limit: '1mb' }));

function setCorsHeaders(req, res) {
  const origin = req.get('origin');
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.set('Access-Control-Allow-Origin', origin);
  } else {
    res.set('Access-Control-Allow-Origin', 'null');
  }
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.set('Access-Control-Max-Age', '600');
}

app.get('/healthz', (req, res) => res.status(200).json({ status: 'ok' }));
app.options('/deposit', (req, res) => { setCorsHeaders(req, res); res.status(204).send(''); });

async function verifyAuth(req, res, next) {
  if (!REQUIRE_AUTH) return next();
  const authHeader = req.get('authorization') || '';
  const match = authHeader.match(/^Bearer (.+)$/);
  if (!match) return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  const idToken = match[1];
  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    req.user = decoded;
    return next();
  } catch (err) {
    console.error('Token verification failed:', err);
    return res.status(401).json({ error: 'Invalid auth token' });
  }
}

app.post('/deposit', verifyAuth, async (req, res) => {
  setCorsHeaders(req, res);
  try {
    const { msisdn, amount, boothId, slotId, sessionId, paymentMethod='mpesa', metadata={} } = req.body || {};
    if (!msisdn || !amount || !boothId || !slotId) return res.status(400).json({ error: 'Missing required fields: msisdn, amount, boothId, slotId' });
    const depositId = deposit_;
    const timestamp = Date.now();
    const depositRecord = { id: depositId, createdAt: timestamp, msisdn, amount, boothId, slotId, sessionId: sessionId||null, paymentMethod, metadata, createdBy: (req.user && req.user.uid) || null, status: 'pending' };
    await db.ref(/payments/).set(depositRecord);
    return res.status(200).json({ ok:true, depositId, data: depositRecord, message: 'Deposit recorded. payment processing should proceed asynchronously.' });
  } catch (err) {
    console.error('Deposit error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.use((req, res) => res.status(404).json({ error: 'not_found' }));

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(Deposit service listening on port ));
