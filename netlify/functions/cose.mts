// Cose da fare: GET elenco; POST { azione: "aggiungi", testo } | { azione: "completa", id }.

import type { Config } from "@netlify/functions";
import { coseDa, json } from "../../src/servizi.js";

export default async (req: Request): Promise<Response> => {
  const cose = coseDa();
  try {
    if (req.method === "GET") return json({ cose: await cose.elenca() });
    if (req.method !== "POST") return json({ errore: "Metodo non consentito" }, 405);
    const corpo = (await req.json().catch(() => ({}))) as { azione?: string; testo?: unknown; id?: unknown };
    if (corpo.azione === "aggiungi" && typeof corpo.testo === "string" && corpo.testo.trim()) {
      return json({ cosa: await cose.aggiungi(corpo.testo) });
    }
    if (corpo.azione === "completa" && typeof corpo.id === "string") {
      const fatta = await cose.completa(corpo.id);
      return fatta ? json({ cosa: fatta }) : json({ errore: "Non trovata" }, 404);
    }
    return json({ errore: "Richiesta non valida" }, 400);
  } catch (err) {
    console.error("Errore cose da fare", err);
    return json({ errore: "Archivio non raggiungibile" }, 502);
  }
};

export const config: Config = { path: "/api/cose" };
