const express = require('express');
const app = express();
app.use(express.json());

// Replace with your actual origin (frontend)
const ALLOWED_ORIGIN = 'https://ridercms-ced94.web.app';

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  next();
});

app.post('/closesession', async (req, res) => {
  // your deposit logic
  res.json({ ok: true, body: req.body });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Listening on ${PORT}`));
