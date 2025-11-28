const express = require("express");
const bodyParser = require("body-parser");
const app = express();
app.use((req,res,next)=>{ console.log(`${new Date().toISOString()} -> ${req.method} ${req.url}`); next(); });
app.use(bodyParser.json());

app.get("/", (req,res)=> res.send("getSessionByMsisdn service is running"));
app.get("/health", (req,res)=> res.send("OK"));

// GET /getSessionByMsisdn?msisdn=2547...
app.get("/getSessionByMsisdn", (req,res)=>{
  const msisdn = req.query.msisdn || (req.body && req.body.msisdn);
  console.log("getSessionByMsisdn request:", msisdn);
  if (!msisdn) return res.status(400).json({ error: "msisdn required" });
  // Simulate a response (null if none)
  const sample = {
    msisdn,
    currentSession: null
  };
  return res.json(sample);
});

// also allow POST for convenience
app.post("/getSessionByMsisdn", (req,res)=>{
  const msisdn = req.body && req.body.msisdn;
  if (!msisdn) return res.status(400).json({ error: "msisdn required" });
  return res.json({ msisdn, currentSession: null });
});

app.all("*", (req,res)=> res.status(404).json({ error: "Not found" }));
const PORT = process.env.PORT || 8080;
app.listen(PORT, ()=> console.log(`getSessionByMsisdn service listening on ${PORT}`));
