import { onRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import admin from "firebase-admin";

// Safe init (no-op if already initialized in index.ts)
try {
  admin.app();
} catch {
  admin.initializeApp({
    databaseURL: "https://ridercms-ced94-default-rtdb.firebaseio.com",
  });
}
const db = admin.database();

// CORS allowlist (Hosting + local emu)
const ALLOWED_ORIGINS = new Set<string>([
  "https://ridercms-ced94.web.app",
  "http://localhost:5000",
  "http://127.0.0.1:5000",
]);

function setCors(req: any, res: any) {
  const origin = String(req.headers.origin || "");
  if (ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  } else {
    res.setHeader("Access-Control-Allow-Origin", "*");
  }
  res.setHeader("Access-Control-Allow-Methods", "OPTIONS, POST");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "86400");
}

async function requireAuth(req: any) {
  const h: string = req.headers.authorization || "";
  if (!h.startsWith("Bearer ")) throw new Error("Missing bearer token");
  const token = h.slice("Bearer ".length);
  try {
    return await admin.auth().verifyIdToken(token);
  } catch {
    throw new Error("Invalid or expired token");
  }
}

function rid(prefix = "web"): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 12)}`;
}

export const sendDoorCmd = onRequest(
  { region: "europe-west1", cors: false },
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
      await requireAuth(req);

      const booth = String(req.body?.booth || "").trim();
      const slot  = String(req.body?.slot  || "").trim().toLowerCase();
      if (!booth || !slot) {
        res.status(400).json({ error: "Missing booth or slot" });
        return;
      }

      const id    = rid("web");
      const nonce = rid("").slice(4);
      const ts    = Date.now();
      const seq   = ts; // monotonic signal in case boolean pulse is missed
      const base  = `/deviceTelemetry/${booth}/${slot}/cmd`;

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
    } catch (e: any) {
      const msg = e?.message || String(e);
      logger.warn("sendDoorCmd error", msg);
      if (/Missing bearer token|Invalid or expired token/i.test(msg)) {
        res.status(401).json({ error: msg });
      } else {
        res.status(500).json({ error: msg });
      }
    }
  }
);
