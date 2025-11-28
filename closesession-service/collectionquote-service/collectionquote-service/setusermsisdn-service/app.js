const express = require("express");
const bodyParser = require("body-parser");
const app = express();
app.use((req,res,next)=>{ console.log(`${new Date().toISOString()} -> ${req.method} ${req.url}`); next(); });
app.use(bodyParser.json());

app.get("/", (req,res)=> res.send("setUserMsisdn service is running"));
app.get("/health", (req,res)=> res.send("OK"));

// Accepts { msisdn, uid } and stores (simulated)
app.post("/setUserMsisdn", (req,res)=>{
  const { msisdn, uid } = req.body || {};
  console.log("setUserMsisdn payload:", { msisdn, uid });
  if (!msisdn || !uid) return res.status(400).json({ error: "msisdn and uid required" });
  // Simulate storing mapping
  return res.json({ message: "msisdn saved", msisdn, uid });
});

app.all("*", (req,res)=> res.status(404).json({ error: "Not found" }));
const PORT = process.env.PORT || 8080;
app.listen(PORT, ()=> console.log(`setUserMsisdn service listening on ${PORT}`));
