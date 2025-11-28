// collectionquote-service - app.js
const express = require("express");
const bodyParser = require("body-parser");
const app = express();

// logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} -> ${req.method} ${req.url}`);
  next();
});

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.get("/", (req, res) => res.send("Service is running"));
app.get("/health", (req, res) => res.send("OK"));

// Example endpoint - returns a mock quote for collection
app.post("/collectionQuote", (req, res) => {
  const { msisdn, amount } = req.body || {};
  console.log("collectionQuote payload:", { msisdn, amount });
  if (!msisdn || !amount) return res.status(400).json({ error: "msisdn and amount required" });
  // Return a mock quote (id, fee, total)
  const fee = Math.max(10, Math.round(amount * 0.02));
  return res.json({ quoteId: `q-${Date.now()}`, msisdn, amount, fee, total: amount + fee });
});

app.post("/collectionPay", (req, res) => {
  const { msisdn, amount, slot } = req.body || {};
  console.log("collectionPay payload:", { msisdn, amount, slot });
  if (!msisdn || !amount) return res.status(400).json({ error: "msisdn and amount required" });
  return res.json({ message: "Payment received", msisdn, amount, slot: slot || null });
});

app.all("*", (req, res) => res.status(404).json({ error: "Not found" }));

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`collectionquote service listening on ${PORT}`));
