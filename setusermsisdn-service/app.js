// setusermsisdn-service - app.js
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

// Example: set user MSISDN for a session (mock)
app.post("/setUserMsisdn", (req, res) => {
  const { uid, msisdn } = req.body || {};
  console.log("setUserMsisdn payload:", { uid, msisdn });
  if (!uid || !msisdn) return res.status(400).json({ error: "uid and msisdn required" });
  // mock success
  return res.json({ message: "msisdn set", uid, msisdn });
});

app.post("/collectionPay", (req, res) => {
  const { msisdn, amount, slot } = req.body || {};
  console.log("collectionPay payload:", { msisdn, amount, slot });
  if (!msisdn || !amount) return res.status(400).json({ error: "msisdn and amount required" });
  return res.json({ message: "Payment received", msisdn, amount, slot: slot || null });
});

app.all("*", (req, res) => res.status(404).json({ error: "Not found" }));

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`setusermsisdn service listening on ${PORT}`));
/* ci-redeploy: 1764491605 */
