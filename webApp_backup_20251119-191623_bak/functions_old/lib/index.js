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
Object.defineProperty(exports, "__esModule", { value: true });
exports.debugBooth = exports.closeSession = exports.sendDoorCmd = void 0;
const admin = __importStar(require("firebase-admin"));
const https_1 = require("firebase-functions/v2/https");
const options_1 = require("firebase-functions/v2/options");
// Set global region for all functions
(0, options_1.setGlobalOptions)({ region: "europe-west1" });
// Initialize Admin (idempotent)
if (admin.apps.length === 0) {
    admin.initializeApp();
}
const rtdb = admin.database();
// Small helper for auth header (optional; currently permissive)
function requirePost(req, res) {
    if (req.method !== "POST") {
        res.status(405).send("Method Not Allowed");
        return false;
    }
    return true;
}
/**
 * POST /api/openDoor  (rewritten to this function)
 * Body: { booth: string, slot: string }
 * Writes command to /booths/<booth>/slots/<slot>/cmd and returns { ok, id, nonce, ts }
 */
exports.sendDoorCmd = (0, https_1.onRequest)(async (req, res) => {
    if (!requirePost(req, res))
        return;
    try {
        const { booth, slot } = req.body || {};
        if (!booth || !slot) {
            res.status(400).json({ error: "booth and slot required" });
            return;
        }
        const id = `web-${Math.random().toString(36).slice(2, 12)}`;
        const nonce = Math.random().toString(36).slice(2, 12);
        const ts = Date.now();
        // IMPORTANT: write where the ESP32 listens
        const ref = rtdb.ref(`/booths/${booth}/slots/${slot}/cmd`);
        await ref.update({ openDoor: true, openDoorId: id, openDoorNonce: nonce, openDoorTs: ts });
        // Auto-reset the boolean so the device can edge-trigger safely
        setTimeout(() => ref.child("openDoor").set(false).catch(() => { }), 1500);
        res.json({ ok: true, id, nonce, ts });
    }
    catch (e) {
        res.status(500).json({ error: String(e?.message || e) });
    }
});
/**
 * POST /api/closeSession
 * Body: { booth: string, slot: string }
 * Clears reservation/session structures (adapt as needed).
 */
exports.closeSession = (0, https_1.onRequest)(async (req, res) => {
    if (!requirePost(req, res))
        return;
    try {
        const { booth, slot } = req.body || {};
        if (!booth || !slot) {
            res.status(400).json({ error: "booth and slot required" });
            return;
        }
        const updates = {};
        updates[`/slotReservations/${booth}/${slot}`] = null;
        updates[`/sessionsBySlot/${booth}/${slot}`] = null;
        await rtdb.ref().update(updates);
        res.json({ ok: true });
    }
    catch (e) {
        res.status(500).json({ error: String(e?.message || e) });
    }
});
/**
 * POST /api/debugBooth
 * Body: { booth: string }
 * Returns basic info to diagnose reservations vs slots.
 */
exports.debugBooth = (0, https_1.onRequest)(async (req, res) => {
    if (!requirePost(req, res))
        return;
    try {
        const { booth } = req.body || {};
        if (!booth) {
            res.status(400).json({ error: "booth required" });
            return;
        }
        const [slotsSnap, resvSnap] = await Promise.all([
            rtdb.ref(`/booths/${booth}/slots`).get(),
            rtdb.ref(`/slotReservations/${booth}`).get(),
        ]);
        res.json({
            booth,
            slots: slotsSnap.val() || {},
            reservations: resvSnap.val() || {},
        });
    }
    catch (e) {
        res.status(500).json({ error: String(e?.message || e) });
    }
});
