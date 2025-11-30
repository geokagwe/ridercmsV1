"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.debugBooth = exports.cleanOldReservations = exports.closeSession = exports.allocateNextSlot = void 0;
const https_1 = require("firebase-functions/v2/https");
const scheduler_1 = require("firebase-functions/v2/scheduler");
const logger = __importStar(require("firebase-functions/logger"));
const firebase_admin_1 = __importDefault(require("firebase-admin"));
// --- Admin init with explicit RTDB URL ---
try {
    firebase_admin_1.default.app();
}
catch {
    firebase_admin_1.default.initializeApp({
        databaseURL: "https://ridercms-ced94-default-rtdb.firebaseio.com",
    });
}
const db = firebase_admin_1.default.database();
// --- CORS allowlist (Hosting + local emulators) ---
const ALLOWED_ORIGINS = new Set([
    "https://ridercms-ced94.web.app",
    "https://ridercms-ced94.firebaseapp.com",
    "http://localhost:5000",
    "http://127.0.0.1:5000",
]);
function setCors(req, res) {
    const origin = String(req.headers.origin || "");
    if (ALLOWED_ORIGINS.has(origin)) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Vary", "Origin");
    }
    else {
        // permissive during bring-up; tighten later if desired
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
// ---------- helpers ----------
async function pickNextFreeSlot(booth) {
    const [slotsSnap, sessSnap, resvSnap] = await Promise.all([
        db.ref(`/booths/${booth}/slots`).get(),
        db.ref(`/sessionsBySlot/${booth}`).get(),
        db.ref(`/slotReservations/${booth}`).get(),
    ]);
    if (!slotsSnap.exists())
        throw new Error("Booth not found");
    const slots = (slotsSnap.val() || {});
    const sessions = (sessSnap.val() || {});
    const reservations = (resvSnap.val() || {});
    const reserved = new Set(Object.keys(reservations || {}));
    const keys = Object.keys(slots).sort();
    for (const k of keys) {
        const active = sessions[k] && (sessions[k].sessionId || sessions[k].id);
        if (active)
            continue;
        if (reserved.has(k))
            continue;
        return k;
    }
    return null;
}
// ========== HTTPS: allocateNextSlot ==========
exports.allocateNextSlot = (0, https_1.onRequest)({ region: "europe-west1", cors: false }, // manual CORS
async (req, res) => {
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
        const decoded = await requireAuth(req);
        const boothRaw = req.body?.booth;
        const booth = typeof boothRaw === "string"
            ? boothRaw
                .trim()
                .replace(/^[?&\s]*booth\s*=\s*/i, "")
                .replace(/[^a-z0-9_-]+$/i, "")
            : "";
        if (!booth) {
            res.status(400).json({ error: "Missing booth" });
            return;
        }
        const slot = await pickNextFreeSlot(booth);
        if (!slot) {
            res.status(409).json({ error: "No free slot" });
            return;
        }
        // short reservation (avoid races)
        await db.ref(`/slotReservations/${booth}/${slot}`).set({
            uid: decoded.uid,
            ts: Date.now(),
        });
        res.status(200).json({ booth, slot });
    }
    catch (e) {
        const msg = e?.message || String(e);
        logger.warn("allocateNextSlot error", msg);
        if (/Missing bearer token|Invalid or expired token/i.test(msg)) {
            res.status(401).json({ error: msg });
        }
        else if (/Booth not found/i.test(msg)) {
            res.status(404).json({ error: msg });
        }
        else {
            res.status(500).json({ error: msg });
        }
    }
});
// ========== HTTPS: closeSession (simple cleaner) ==========
exports.closeSession = (0, https_1.onRequest)({ region: "europe-west1", cors: false }, async (req, res) => {
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
        const { booth, slot, sessionId } = req.body || {};
        if (!booth || !(slot || sessionId)) {
            res.status(400).json({ error: "Missing booth and slot or sessionId" });
            return;
        }
        let useSlot = slot;
        // If only sessionId is provided, find its slot mirror under sessionsBySlot
        if (!useSlot && sessionId) {
            const sessSnap = await db.ref(`/sessionsBySlot/${booth}`).get();
            const map = (sessSnap.val() || {});
            useSlot = Object.keys(map).find((s) => map[s] && (map[s].sessionId === sessionId || map[s].id === sessionId));
        }
        if (!useSlot) {
            res.status(404).json({ error: "Session not found for this booth" });
            return;
        }
        const updates = {};
        updates[`/sessionsBySlot/${booth}/${useSlot}`] = null;
        updates[`/slotReservations/${booth}/${useSlot}`] = null;
        await db.ref().update(updates);
        res.status(200).json({ ok: true, booth, slot: useSlot });
    }
    catch (e) {
        res.status(500).json({ error: e?.message || String(e) });
    }
});
// ========== Scheduled: cleanOldReservations ==========
exports.cleanOldReservations = (0, scheduler_1.onSchedule)({ region: "europe-west1", schedule: "every 5 minutes" }, async () => {
    const cutoff = Date.now() - 5 * 60 * 1000;
    const root = await db.ref("/slotReservations").get();
    if (!root.exists())
        return;
    const updates = {};
    root.forEach((boothSnap) => {
        boothSnap.forEach((slotSnap) => {
            const v = slotSnap.val() || {};
            if ((v.ts || 0) < cutoff) {
                updates[`/slotReservations/${boothSnap.key}/${slotSnap.key}`] = null;
            }
        });
    });
    if (Object.keys(updates).length) {
        await db.ref().update(updates);
        logger.info("cleanOldReservations removed", Object.keys(updates).length);
    }
});
// ---- Re-export the standalone debug function (in its own file) ----
var debugBooth_1 = require("./debugBooth");
Object.defineProperty(exports, "debugBooth", { enumerable: true, get: function () { return debugBooth_1.debugBooth; } });
