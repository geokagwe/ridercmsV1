import { onRequest } from "firebase-functions/v2/https";
import admin from "firebase-admin";

const db = admin.database();

function setCors(res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "OPTIONS, POST");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

export const closeSession = onRequest(
  { region: "europe-west1", cors: false },
  async (req, res): Promise<void> => {
    setCors(res);
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }
    if (req.method !== "POST") { res.status(405).json({ error: "Method Not Allowed" }); return; }

    try {
      const booth = String(req.body?.booth || "");
      const slot = String(req.body?.slot || "");
      if (!booth || !slot) { res.status(400).json({ error: "Missing booth or slot" }); return; }

      await db.ref(`/slotReservations/${booth}/${slot}`).set(null);
      await db.ref(`/sessionsBySlot/${booth}/${slot}`).set(null);

      res.status(200).json({ ok: true, booth, slot }); return;
    } catch (e: any) {
      res.status(500).json({ error: e?.message || String(e) }); return;
    }
  }
);
