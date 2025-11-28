const express = require("express");
const app = express();

const ALLOWED_ORIGIN = process.env.FRONTEND_ORIGIN || "https://ridercms-ced94.web.app";
app.use(express.json());

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
  res.header("Access-Control-Allow-Credentials", "true");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.get("/health", (req, res) => res.json({ status: "ok" }));

app.post("/deposit", (req, res) => {
  // TODO: replace with real deposit logic (mpesa, quotes, db writes)
  const data = req.body || {};
  res.json({ ok: true, service: "deposit", received: data });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Deposit service listening on ${PORT}`));
