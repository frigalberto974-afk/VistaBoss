// Lettura degli appuntamenti per l'interfaccia: GET /api/agenda?da=AAAA-MM-GGTHH:MM:SS&a=AAAA-MM-GGTHH:MM:SS
// Solo lettura: le modifiche passano dall'assistente, con conferma per spostamenti e cancellazioni.

import type { Config } from "@netlify/functions";
import { agendaDa, json } from "../../src/servizi.js";
import { durataMinuti, eOrarioLocale } from "../../src/tempo.js";

const MAX_GIORNI = 62;

export default async (req: Request): Promise<Response> => {
  if (req.method !== "GET") return json({ errore: "Metodo non consentito" }, 405);
  const url = new URL(req.url);
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
