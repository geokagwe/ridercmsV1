const express = require("express");
const bodyParser = require("body-parser");
const app = express();
app.use((req,res,next)=>{ console.log(`${new Date().toISOString()} -> ${req.method} ${req.url}`); next(); });
app.use(bodyParser.json());

app.get("/", (req,res)=> res.send("closesession service is running"));
app.get("/health", (req,res)=> res.send("OK"));

app.post("/closeSession", (req,res)=>{
  const { msisdn, sessionId } = req.body || {};
  console.log("closeSession payload:", { msisdn, sessionId });
  if (!msisdn || !sessionId) return res.status(400).json({ error: "msisdn and sessionId required" });
  // Simulate closing
  return res.json({ message: "session closed", msisdn, sessionId });
});

app.all("*", (req,res)=> res.status(404).json({ error: "Not found" }));
const PORT = process.env.PORT || 8080;
app.listen(PORT, ()=> console.log(`closeSession service listening on ${PORT}`));
