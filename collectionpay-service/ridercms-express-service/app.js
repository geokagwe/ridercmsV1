const express = require('express');
const app = express();

// ----------------------
// CONFIG
// ----------------------
const ALLOWED_ORIGIN = process.env.FRONTEND_ORIGIN || 'https://ridercms-ced94\.web\.app';
app.use(express.json());

// ----------------------
// GLOBAL CORS MIDDLEWARE
// ----------------------
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
  res.header("Access-Control-Allow-Credentials", "true");

  // If OPTIONS request → return immediately
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  next();
});

// ----------------------
// ROUTES
// ----------------------
app.get('/health', (req, res) => {
  res.json({ status: "ok" });
});

app.post('/deposit', (req, res) => {
  // Example logic
  const data = req.body;
  res.json({ received: true, data });
});

// ----------------------
// START SERVER
// ----------------------
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Service running on port ${PORT}`);
});
