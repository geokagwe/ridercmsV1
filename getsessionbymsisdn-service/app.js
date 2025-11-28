// getsessionbymsisdn-service - app.js
const express = require("express");
const bodyParser = require("body-parser");
const app = express();

app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} -> ${req.method} ${req.url}`);
  next();
});
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.get("/", (req, res) => res.send("Service is running"));
app.get("/health", (req, res) => res.send("OK"));

// Mock: get current session by msisdn
app.get("/getSessionByMsisdn", (req, res) => {
  const msisdn = req.query.msisdn || (req.body && req.body.msisdn);
  console.log("getSessionByMsisdn query:", msisdn);
  if (!msisdn) return res.status(400).json({ error: "msisdn required" });
  // return a mock session or null
  return res.json({ msisdn, session: null });
});

app.post("/collectionPay", (req, res) => {
  const { msisdn, amount, slot } = req.body || {};
  console.log("collectionPay payload:", { msisdn, amount, slot });
  if (!msisdn || !amount) return res.status(400).json({ error: "msisdn and amount required" });
  return res.json({ message: "Payment received", msisdn, amount, slot: slot || null });
});

app.all("*", (req, res) => res.status(404).json({ error: "Not found" }));

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`getsessionbymsisdn service listening on ${PORT}`));
