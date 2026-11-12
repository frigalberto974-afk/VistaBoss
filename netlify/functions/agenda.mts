// Lettura degli appuntamenti per l'interfaccia: GET /api/agenda?da=AAAA-MM-GGTHH:MM:SS&a=AAAA-MM-GGTHH:MM:SS
// Solo lettura: le modifiche passano dall'assistente, con conferma per spostamenti e cancellazioni.

import type { Config } from "@netlify/functions";
import { AgendaGoogle } from "../../src/agenda.js";
import { durataMinuti, eOrarioLocale } from "../../src/tempo.js";

const MAX_GIORNI = 62;

function json(dati: unknown, status = 200): Response {
  return new Response(JSON.stringify(dati), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

let agenda: AgendaGoogle | undefined;

export default async (req: Request): Promise<Response> => {
  if (req.method !== "GET") return json({ errore: "Metodo non consentito" }, 405);
  const url = new URL(req.url);
  const da = url.searchParams.get("da");
  const a = url.searchParams.get("a");
  if (!eOrarioLocale(da) || !eOrarioLocale(a) || a <= da || durataMinuti(da, a) > MAX_GIORNI * 24 * 60) {
    return json({ errore: "Intervallo non valido" }, 400);
  }
  try {
    agenda ??= new AgendaGoogle(
      Netlify.env.get("GOOGLE_SA_EMAIL")?.trim() ?? "",
      Netlify.env.get("GOOGLE_SA_PRIVATE_KEY") ?? "",
      Netlify.env.get("GOOGLE_CALENDAR_ID")?.trim() ?? "",
    );
    return json({ appuntamenti: await agenda.elenca(da, a) });
  } catch (err) {
    console.error("Errore lettura agenda", err);
    return json({ errore: "Calendario non raggiungibile" }, 502);
  }
};

export const config: Config = { path: "/api/agenda" };
