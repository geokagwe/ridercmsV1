const express = require("express");
const bodyParser = require("body-parser");

const app = express();
const PORT = process.env.PORT || 8080;

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.get("/", (req, res) => {
  res.status(200).send("CollectionPay service is running");
});

app.post("/collectionPay", (req, res) => {
  const { msisdn, amount, slot } = req.body;
  if (!msisdn || !amount) {
    return res.status(400).json({ error: "Missing msisdn or amount" });
  }
  console.log(`Payment requested: msisdn=${msisdn}, amount=${amount}, slot=${slot||""}`);
  res.status(200).json({ message: "Payment received", msisdn, amount, slot });
});

app.post("/pay", (req, res) => {
  const { msisdn, amount } = req.body;
  if (!msisdn || !amount) return res.status(400).json({ error: "Missing msisdn or amount" });
  res.status(200).json({ message: "Pay endpoint received request", msisdn, amount });
});

app.listen(PORT, () => {
  console.log(`CollectionPay service listening on port ${PORT}`);
});
