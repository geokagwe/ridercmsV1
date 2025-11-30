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
exports.sendDoorCmd = void 0;
const https_1 = require("firebase-functions/v2/https");
const logger = __importStar(require("firebase-functions/logger"));
const firebase_admin_1 = __importDefault(require("firebase-admin"));
// Safe init (no-op if already initialized in index.ts)
try {
    firebase_admin_1.default.app();
}
catch {
    firebase_admin_1.default.initializeApp({
        databaseURL: "https://ridercms-ced94-default-rtdb.firebaseio.com",
    });
}
const db = firebase_admin_1.default.database();
// CORS allowlist (Hosting + local emu)
const ALLOWED_ORIGINS = new Set([
    "https://ridercms-ced94.web.app",
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
function rid(prefix = "web") {
    return `${prefix}-${Math.random().toString(36).slice(2, 12)}`;
}
exports.sendDoorCmd = (0, https_1.onRequest)({ region: "europe-west1", cors: false }, async (req, res) => {
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
        const booth = String(req.body?.booth || "").trim();
        const slot = String(req.body?.slot || "").trim().toLowerCase();
        if (!booth || !slot) {
            res.status(400).json({ error: "Missing booth or slot" });
            return;
        }
        const id = rid("web");
        const nonce = rid("").slice(4);
        const ts = Date.now();
        const seq = ts; // monotonic signal in case boolean pulse is missed
        const base = `/deviceTelemetry/${booth}/${slot}/cmd`;
        // 1) ensure known start (false)
        await db.ref(base).update({ openDoor: false });
        // 2) raise edge with id/nonce/seq
        await db.ref(base).update({
            openDoor: true,
            openDoorId: id,
            openDoorNonce: nonce,
            openDoorTs: ts,
            openDoorSeq: seq,
        });
        // 3) hold true for a bit, then reset to false
        setTimeout(() => {
            db.ref(`${base}/openDoor`)
                .set(false)
                .catch((e) => logger.warn("openDoor reset failed", e));
        }, 1000);
        res.status(200).json({ ok: true, id, nonce, ts, seq });
    }
    catch (e) {
        const msg = e?.message || String(e);
        logger.warn("sendDoorCmd error", msg);
        if (/Missing bearer token|Invalid or expired token/i.test(msg)) {
            res.status(401).json({ error: msg });
        }
        else {
            res.status(500).json({ error: msg });
        }
    }
});
