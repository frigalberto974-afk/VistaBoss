// Conferma di ricezione: il telefono, appena mostra un avviso, avvisa il server.
// POST /api/ricevuta { chiave, endpoint }

import { getStore } from "@netlify/blobs";
import type { Config } from "@netlify/functions";
import { createHash } from "node:crypto";
import { json } from "../../src/servizi.js";

export default async (req: Request): Promise<Response> => {
  if (req.method !== "POST") return json({ errore: "Metodo non consentito" }, 405);
  const corpo = (await req.json().catch(() => null)) as { chiave?: unknown; endpoint?: unknown } | null;
  if (!corpo || typeof corpo.chiave !== "string" || typeof corpo.endpoint !== "string" || corpo.chiave.length > 200) {
    return json({ errore: "Richiesta non valida" }, 400);
  }
  const consegne = getStore({ name: "consegne-avvisi", consistency: "strong" });
  const chiave = `${corpo.chiave}|${createHash("sha256").update(corpo.endpoint).digest("hex")}`;
  const c = (await consegne.get(chiave, { type: "json" })) as Record<string, unknown> | null;
  if (!c) return json({ ok: false }, 404);
  if (!c.ricevuta) {
    await consegne.setJSON(chiave, { ...c, ricevuta: new Date().toISOString() });
    console.log("Avviso ricevuto dal telefono", corpo.chiave);
  }
  return json({ ok: true });
};

export const config: Config = { path: "/api/ricevuta", method: "POST" };
