import * as admin from "firebase-admin";
import { onRequest } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2/options";

// Set global region for all functions
setGlobalOptions({ region: "europe-west1" });

// Initialize Admin (idempotent)
if (admin.apps.length === 0) {
  admin.initializeApp();
}
const rtdb = admin.database();

// Small helper for auth header (optional; currently permissive)
function requirePost(req: any, res: any): boolean {
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
export const sendDoorCmd = onRequest(async (req, res) => {
  if (!requirePost(req, res)) return;
  try {
    const { booth, slot } = req.body || {};
    if (!booth || !slot) {
      res.status(400).json({ error: "booth and slot required" });
      return;
    }

    const id    = `web-${Math.random().toString(36).slice(2, 12)}`;
    const nonce = Math.random().toString(36).slice(2, 12);
    const ts    = Date.now();

    // IMPORTANT: write where the ESP32 listens
    const ref = rtdb.ref(`/booths/${booth}/slots/${slot}/cmd`);
    await ref.update({ openDoor: true, openDoorId: id, openDoorNonce: nonce, openDoorTs: ts });

    // Auto-reset the boolean so the device can edge-trigger safely
    setTimeout(() => ref.child("openDoor").set(false).catch(() => {}), 1500);

    res.json({ ok: true, id, nonce, ts });
  } catch (e: any) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

/**
 * POST /api/closeSession
 * Body: { booth: string, slot: string }
 * Clears reservation/session structures (adapt as needed).
 */
export const closeSession = onRequest(async (req, res) => {
  if (!requirePost(req, res)) return;
  try {
    const { booth, slot } = req.body || {};
    if (!booth || !slot) {
      res.status(400).json({ error: "booth and slot required" });
      return;
    }

    const updates: Record<string, any> = {};
    updates[`/slotReservations/${booth}/${slot}`] = null;
    updates[`/sessionsBySlot/${booth}/${slot}`]  = null;
    await rtdb.ref().update(updates);

    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

/**
 * POST /api/debugBooth
 * Body: { booth: string }
 * Returns basic info to diagnose reservations vs slots.
 */
export const debugBooth = onRequest(async (req, res) => {
  if (!requirePost(req, res)) return;
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
  } catch (e: any) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});
