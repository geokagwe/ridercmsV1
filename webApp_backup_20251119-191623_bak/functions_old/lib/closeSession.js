"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.closeSession = void 0;
const https_1 = require("firebase-functions/v2/https");
const firebase_admin_1 = __importDefault(require("firebase-admin"));
const db = firebase_admin_1.default.database();
function setCors(res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "OPTIONS, POST");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}
exports.closeSession = (0, https_1.onRequest)({ region: "europe-west1", cors: false }, async (req, res) => {
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
        const slot = String(req.body?.slot || "");
        if (!booth || !slot) {
            res.status(400).json({ error: "Missing booth or slot" });
            return;
        }
        await db.ref(`/slotReservations/${booth}/${slot}`).set(null);
        await db.ref(`/sessionsBySlot/${booth}/${slot}`).set(null);
        res.status(200).json({ ok: true, booth, slot });
        return;
    }
    catch (e) {
        res.status(500).json({ error: e?.message || String(e) });
        return;
    }
});
