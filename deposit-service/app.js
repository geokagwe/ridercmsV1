// deposit-service - app.js
const express = require("express");
const bodyParser = require("body-parser");

const app = express();

// logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} -> ${req.method} ${req.url}`);
  next();
});

// accept json & form bodies
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// simple health endpoint
app.get("/", (req, res) => {
  res.send("Deposit service is healthy");
});
app.get("/health", (req, res) => res.send("OK"));

// sample payment endpoint (for e2e tests)
app.post("/collectionPay", (req, res) => {
  const { msisdn, amount, slot } = req.body || {};
  console.log("collectionPay payload:", { msisdn, amount, slot });
  if (!msisdn || !amount) {
    return res.status(400).json({ error: "msisdn and amount required" });
  }
  // simulate processing
  return res.json({ message: "Payment received", msisdn, amount, slot: slot || null });
});

// fallback route
app.all("*", (req, res) => {
  res.status(404).json({ error: "Not found" });
});

// start listening on assigned PORT
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Deposit service listening on port ${PORT}`);
});
