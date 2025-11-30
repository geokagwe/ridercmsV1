"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.debugBooth = void 0;
const https_1 = require("firebase-functions/v2/https");
const firebase_admin_1 = __importDefault(require("firebase-admin"));
const db = firebase_admin_1.default.database();
function setCors(res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "OPTIONS, POST");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}
exports.debugBooth = (0, https_1.onRequest)({ region: "europe-west1", cors: false }, async (req, res) => {
    setCors(res);
    if (req.method === "OPTIONS") {
        res.status(204).send("");
        return;
    }
    if (req.method !== "POST") {
        res.status(405).json({ error: "Method Not Allowed" });
        return;
    }
    try {
        const booth = String(req.body?.booth || "");
        if (!booth) {
            res.status(400).json({ error: "Missing booth" });
            return;
        }
        const [slots, sessions, reservations] = await Promise.all([
            db.ref(`/booths/${booth}/slots`).get().then(s => s.val() || {}),
            db.ref(`/sessionsBySlot/${booth}`).get().then(s => s.val() || {}),
            db.ref(`/slotReservations/${booth}`).get().then(s => s.val() || {}),
        ]);
        const strict = {};
        Object.keys(slots || {}).forEach((k) => {
            const reasons = [];
            const active = sessions[k] && (sessions[k].sessionId || sessions[k].id);
            if (active)
                reasons.push("active-session");
            if (reservations && reservations[k])
                reasons.push("reserved");
            strict[k] = { free: reasons.length === 0, reasons, ts: Date.now() };
        });
        res.status(200).json({ booth, strict });
        return;
    }
    catch (e) {
        res.status(500).json({ error: e?.message || String(e) });
        return;
    }
});
