// public/assets/js/api.js
// Calls your HTTPS Functions with Firebase ID token (Bearer).

import { auth } from "./firebase-init.js";

const ENDPOINTS = {
  deposit:            "https://deposit-2tjseqt5pq-ew.a.run.app",
  linkOwner:          "https://linkowner-2tjseqt5pq-ew.a.run.app",
  collectionQuote:    "https://collectionquote-2tjseqt5pq-ew.a.run.app",
  collectionPay:      "https://collectionpay-2tjseqt5pq-ew.a.run.app",
  mpesaCallback:      "https://mpesacallback-2tjseqt5pq-ew.a.run.app",
  setUserMsisdn:      "https://setusermsisdn-2tjseqt5pq-ew.a.run.app",
  getSessionByMsisdn: "https://getsessionbymsisdn-2tjseqt5pq-ew.a.run.app",
  closeSession:       "https://europe-west1-ridercms-ced94.cloudfunctions.net/closeSession"
};

async function idToken() {
  const u = auth.currentUser;
  if (!u) throw new Error("Not signed in");
  return await u.getIdToken(true); // force refresh
}

async function callJson(url, body, method = "POST") {
  const token = await idToken();
  const res = await fetch(url, {
    method,
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let data; try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (!res.ok) {
    const msg = data?.error || data?.message || text || `${res.status} ${res.statusText}`;
    throw new Error(msg);
  }
  return data;
}

export async function deposit(msisdn, booth, slot) {
  return callJson(ENDPOINTS.deposit, { msisdn, booth, slot });
}
export async function collectionQuote(msisdn, booth, slot) {
  return callJson(ENDPOINTS.collectionQuote, { msisdn, booth, slot });
}
export async function collectionPay(sessionId) {
  return callJson(ENDPOINTS.collectionPay, { sessionId });
}
export async function closeSession(msisdn) {
  return callJson(ENDPOINTS.closeSession, { msisdn });
}

// optional helpers
export async function getSessionByMsisdn(msisdn) {
  return callJson(ENDPOINTS.getSessionByMsisdn + `?msisdn=${encodeURIComponent(msisdn)}`, null, "GET");
}
export async function setUserMsisdn(uid, msisdn) {
  return callJson(ENDPOINTS.setUserMsisdn, { uid, msisdn });
}
export async function linkOwner(uid, msisdn) {
  return callJson(ENDPOINTS.linkOwner, { uid, msisdn });
}
