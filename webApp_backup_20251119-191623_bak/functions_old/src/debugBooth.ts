import { onRequest } from "firebase-functions/v2/https";
import admin from "firebase-admin";

const db = admin.database();

function setCors(res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "OPTIONS, POST");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

export const debugBooth = onRequest(
  { region: "europe-west1", cors: false },
  async (req, res): Promise<void> => {
    setCors(res);
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }
    if (req.method !== "POST") { res.status(405).json({ error: "Method Not Allowed" }); return; }

    try {
      const booth = String(req.body?.booth || "");
      if (!booth) { res.status(400).json({ error: "Missing booth" }); return; }

      const [slots, sessions, reservations] = await Promise.all([
        db.ref(`/booths/${booth}/slots`).get().then(s => s.val() || {}),
        db.ref(`/sessionsBySlot/${booth}`).get().then(s => s.val() || {}),
        db.ref(`/slotReservations/${booth}`).get().then(s => s.val() || {}),
      ]);

      const strict: any = {};
      Object.keys(slots || {}).forEach((k) => {
        const reasons: string[] = [];
        const active = sessions[k] && (sessions[k].sessionId || sessions[k].id);
        if (active) reasons.push("active-session");
        if (reservations && reservations[k]) reasons.push("reserved");
        strict[k] = { free: reasons.length === 0, reasons, ts: Date.now() };
      });

      res.status(200).json({ booth, strict }); return;
    } catch (e: any) {
      res.status(500).json({ error: e?.message || String(e) }); return;
    }
  }
);
