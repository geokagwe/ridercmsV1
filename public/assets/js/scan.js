// assets/js/scan.js
import { auth } from "./firebase-init.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";

const boothEl = document.getElementById("booth");
const slotEl  = document.getElementById("slot");
const form    = document.getElementById("scanForm");
const qrArea  = document.getElementById("qrPayload");
const parseQr = document.getElementById("parseQr");
const qrMsg   = document.getElementById("qrMsg");

const url = new URL(location.href);
const boothParam = url.searchParams.get("booth") || "";
const slotParam  = url.searchParams.get("slot") || "";
if (boothParam) boothEl.value = boothParam;
if (slotParam)  slotEl.value  = slotParam;

parseQr?.addEventListener("click", () => {
  qrMsg.textContent = "";
  try {
    const obj = JSON.parse(qrArea.value);
    if (obj.booth) boothEl.value = obj.booth;
    if (obj.slot)  slotEl.value  = obj.slot;
    qrMsg.textContent = "QR payload parsed.";
  } catch (e) {
    qrMsg.textContent = "Invalid JSON payload.";
  }
});

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const booth = boothEl.value.trim();
  const slot  = slotEl.value.trim();
  if (!booth || !slot) return;
  sessionStorage.setItem("booth", booth);
  sessionStorage.setItem("slot", slot);
  location.href = "operations.html";
});

onAuthStateChanged(auth, () => {});
