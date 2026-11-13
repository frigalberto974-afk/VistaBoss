// Lettura degli appuntamenti per l'interfaccia: GET /api/agenda?da=AAAA-MM-GGTHH:MM:SS&a=AAAA-MM-GGTHH:MM:SS
// DELETE /api/agenda?id=…: cancellazione dal cestino (conferma chiesta sul telefono).

import type { Config } from "@netlify/functions";
import { agendaDa, json } from "../../src/servizi.js";
import { durataMinuti, eOrarioLocale } from "../../src/tempo.js";

const MAX_GIORNI = 62;

export default async (req: Request): Promise<Response> => {
  const url = new URL(req.url);
  // Cancellazione dal cestino dell'interfaccia (la conferma la chiede il telefono).
  if (req.method === "DELETE") {
    const id = url.searchParams.get("id");
    if (!id || !/^[A-Za-z0-9_-]{5,1024}$/.test(id)) return json({ errore: "Id non valido" }, 400);
    try {
      await agendaDa((n) => Netlify.env.get(n)).cancella(id);
      return json({ ok: true });
    } catch (err) {
      console.error("Errore cancellazione", err);
      return json({ errore: "Non riesco a cancellare" }, 502);
    }
  }
  if (req.method !== "GET") return json({ errore: "Metodo non consentito" }, 405);
  const da = url.searchParams.get("da");
  const a = url.searchParams.get("a");
  if (!eOrarioLocale(da) || !eOrarioLocale(a) || a <= da || durataMinuti(da, a) > MAX_GIORNI * 24 * 60) {
    return json({ errore: "Intervallo non valido" }, 400);
  }
  try {
    return json({ appuntamenti: await agendaDa((n) => Netlify.env.get(n)).elenca(da, a) });
  } catch (err) {
    console.error("Errore lettura agenda", err);
    return json({ errore: "Calendario non raggiungibile" }, 502);
  }
};

export const config: Config = { path: "/api/agenda" };
