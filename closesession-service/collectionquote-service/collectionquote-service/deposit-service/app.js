const express = require("express");
const bodyParser = require("body-parser");
const app = express();
app.use((req,res,next)=>{ console.log(`${new Date().toISOString()} -> ${req.method} ${req.url}`); next(); });
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended:true }));

app.get("/", (req,res)=> res.send("Deposit service is healthy"));
app.get("/health", (req,res)=> res.send("OK"));

app.post("/collectionPay", (req,res)=>{
  const { msisdn, amount, slot } = req.body || {};
  console.log("collectionPay payload:", {msisdn, amount, slot});
  if (!msisdn || !amount) return res.status(400).json({ error: "msisdn and amount required" });
  return res.json({ message: "Payment received", msisdn, amount, slot: slot || null });
});

app.all("*", (req,res) => res.status(404).json({ error: "Not found" }));

const PORT = process.env.PORT || 8080;
app.listen(PORT, ()=> console.log(`Deposit service listening on ${PORT}`));
