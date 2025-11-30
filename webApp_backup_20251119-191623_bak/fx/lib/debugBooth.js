"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.debugBooth = void 0;
const https_1 = require("firebase-functions/v2/https");
const firebase_admin_1 = __importDefault(require("firebase-admin"));
// Safe admin init (no-op if already initialized)
try {
    firebase_admin_1.default.app();
}
catch {
    firebase_admin_1.default.initializeApp({
        databaseURL: "https://ridercms-ced94-default-rtdb.firebaseio.com",
    });
}
const db = firebase_admin_1.default.database();
// CORS allowlist (Hosting + localhost)
const ALLOWED = new Set([
    "https://ridercms-ced94.web.app",
    "https://ridercms-ced94.firebaseapp.com",
    "http://localhost:5000",
    "http://127.0.0.1:5000",
]);
function setCors(req, res) {
    const origin = String(req.headers.origin || "");
    if (ALLOWED.has(origin)) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Vary", "Origin");
    }
    else {
        res.setHeader("Access-Control-Allow-Origin", "*");
    }
    res.setHeader("Access-Control-Allow-Methods", "OPTIONS, POST");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Max-Age", "86400");
}
async function requireAuth(req) {
    const h = req.headers.authorization || "";
    if (!h.startsWith("Bearer "))
        throw new Error("Missing bearer token");
    const token = h.slice("Bearer ".length);
    try {
        return await firebase_admin_1.default.auth().verifyIdToken(token);
    }
    catch {
        throw new Error("Invalid or expired token");
    }
}
// helpers to normalize telemetry
const toBool = (v) => {
    if (typeof v === "boolean")
        return v;
    if (typeof v === "number")
        return v !== 0;
    if (typeof v === "string") {
        const s = v.toLowerCase().trim();
        if (["true", "yes", "on", "1", "locked", "closed"].includes(s))
            return true;
        if (["false", "no", "off", "0", "open", "unlocked"].includes(s))
            return false;
    }
    return undefined;
};
const normTs = (x) => {
    if (typeof x === "number")
        return x < 10_000_000_000 ? x * 1000 : x;
    if (typeof x === "string") {
        const n = Date.parse(x);
        if (!Number.isNaN(n))
            return n;
        const num = Number(x);
        if (!Number.isNaN(num))
            return num < 10_000_000_000 ? num * 1000 : num;
    }
    return undefined;
};
function normalize(raw) {
    if (!raw || typeof raw !== "object")
        return undefined;
    const ts = normTs(raw.ts) ?? normTs(raw.timestamp) ?? normTs(raw.updatedAt) ?? normTs(raw.time);
    const doorClosed = toBool(raw.doorClosed) ??
        (raw.doorState ? raw.doorState === "closed" : undefined) ??
        (typeof raw.door === "string" ? raw.door === "closed" : undefined) ??
        (typeof raw.doorOpen !== "undefined" ? !toBool(raw.doorOpen) : undefined) ??
        toBool(raw.door_closed);
    const doorLocked = toBool(raw.doorLocked) ?? toBool(raw.locked) ??
        (typeof raw.lockState === "string" ? raw.lockState === "locked" : undefined) ??
        toBool(raw.lockEngaged);
    const relayOn = toBool(raw.relayOn) ?? toBool(raw.charging) ?? toBool(raw.chargeRelay) ?? toBool(raw.relay);
    const batteryInserted = toBool(raw.batteryInserted) ?? toBool(raw.batteryPresent) ?? toBool(raw.battery) ?? toBool(raw.hasBattery) ?? toBool(raw.packPresent);
    const isBusy = toBool(raw.isBusy) ?? toBool(raw.busy) ?? toBool(raw.occupied);
    const disabled = toBool(raw.disabled) ?? toBool(raw.outOfService) ?? toBool(raw.oos);
    return { ts, doorClosed, doorLocked, relayOn, batteryInserted, isBusy, disabled };
}
exports.debugBooth = (0, https_1.onRequest)({ region: "europe-west1", cors: false }, async (req, res) => {
    setCors(req, res);
    if (req.method === "OPTIONS") {
        res.status(204).send("");
        return;
    }
    if (req.method !== "POST") {
        res.status(405).json({ error: "Method Not Allowed" });
        return;
    }
    try {
        await requireAuth(req);
    }
    catch (e) {
        res.status(401).json({ error: e?.message || String(e) });
        return;
    }
    const boothRaw = req.body?.booth;
    const booth = typeof boothRaw === "string"
        ? boothRaw.trim().replace(/^[?&\s]*booth\s*=\s*/i, "").replace(/[^a-z0-9_-]+$/i, "")
        : "";
    if (!booth) {
        res.status(400).json({ error: "Missing booth" });
        return;
    }
    const [slotsSnap, sessSnap, resvSnap, telSnap] = await Promise.all([
        db.ref(`/booths/${booth}/slots`).get(),
        db.ref(`/sessionsBySlot/${booth}`).get(),
        db.ref(`/slotReservations/${booth}`).get(),
        db.ref(`/deviceTelemetry/${booth}`).get(),
    ]);
    const slots = (slotsSnap.val() || {});
    const sessions = (sessSnap.val() || {});
    const reservations = (resvSnap.val() || {});
    const telRaw = (telSnap.val() || {});
    const tel = {};
    Object.keys(telRaw).forEach(k => tel[k] = normalize(telRaw[k]));
    const slotKeys = Object.keys(Object.keys(slots).length ? slots : tel).sort();
    if (!slotKeys.length) {
        res.status(404).json({ error: "Booth not found or has no slots", booth });
        return;
    }
    const now = Date.now();
    function evalSlot(s, strict) {
        const reasons = [];
        const t = tel[s] || {};
        if (sessions[s] && (sessions[s].sessionId || sessions[s].id))
            reasons.push("active-session");
        if (reservations[s])
            reasons.push("reserved");
        const ageOk = t.ts && (now - t.ts) >= 0 && (now - t.ts) <= (2 * 60 * 1000); // 2 min
        if (strict) {
            if (!t.ts)
                reasons.push("no-telemetry");
            else if (!ageOk)
                reasons.push("stale-telemetry");
            if (t.doorLocked !== true)
                reasons.push("door-unlocked");
        }
        if (t.disabled)
            reasons.push("disabled");
        if (t.relayOn)
            reasons.push("relay-on");
        if (t.batteryInserted)
            reasons.push("battery-inserted");
        if (t.isBusy)
            reasons.push("busy");
        if (t.doorClosed !== true)
            reasons.push("door-open");
        return { free: reasons.length === 0, reasons, ts: t.ts || null };
    }
    const strict = {};
    const relaxed = {};
    for (const s of slotKeys) {
        strict[s] = evalSlot(s, true);
        relaxed[s] = evalSlot(s, false);
    }
    res.status(200).json({
        booth, slotKeys, strict, relaxed,
        telemetryTs: Object.fromEntries(slotKeys.map(s => [s, tel[s]?.ts ?? null])),
    });
});
