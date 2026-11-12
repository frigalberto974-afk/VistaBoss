// Iscrizione alle notifiche push del telefono.
// GET: chiave pubblica VAPID. POST: salva l'iscrizione (PushSubscription in JSON).

import { getStore } from "@netlify/blobs";
import type { Config } from "@netlify/functions";
import { createHash } from "node:crypto";
import { json } from "../../src/servizi.js";

export default async (req: Request): Promise<Response> => {
  if (req.method === "GET") return json({ chiavePubblica: Netlify.env.get("VAPID_PUBLIC_KEY") ?? "" });
  if (req.method !== "POST") return json({ errore: "Metodo non consentito" }, 405);
  const iscr = (await req.json().catch(() => null)) as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } | null;
  if (
    !iscr ||
    typeof iscr.endpoint !== "string" ||
    !iscr.endpoint.startsWith("https://") ||
    typeof iscr.keys?.p256dh !== "string" ||
    typeof iscr.keys?.auth !== "string"
  ) {
    return json({ errore: "Iscrizione non valida" }, 400);
  }
  const chiave = createHash("sha256").update(iscr.endpoint).digest("hex");
  await getStore({ name: "iscrizioni-push", consistency: "strong" }).setJSON(chiave, {
    endpoint: iscr.endpoint,
    keys: { p256dh: iscr.keys.p256dh, auth: iscr.keys.auth },
  });
  return json({ ok: true });
};

export const config: Config = { path: "/api/iscrizione" };
