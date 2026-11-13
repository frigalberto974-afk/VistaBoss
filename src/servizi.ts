// Costruzione dei servizi a partire dalle variabili d'ambiente (una sola volta per istanza).

import { AgendaGoogle } from "./agenda.js";
import { CoseBlobs } from "./cose.js";

export type LeggiVariabile = (nome: string) => string | undefined;

export function variabile(leggi: LeggiVariabile, nome: string): string {
  const v = leggi(nome)?.trim();
  if (!v) throw new Error(`Variabile d'ambiente mancante: ${nome}`);
  return v;
}

let agenda: AgendaGoogle | undefined;

export function agendaDa(leggi: LeggiVariabile): AgendaGoogle {
  agenda ??= new AgendaGoogle(variabile(leggi, "GOOGLE_SA_EMAIL"), variabile(leggi, "GOOGLE_SA_PRIVATE_KEY"), variabile(leggi, "GOOGLE_CALENDAR_ID"));
  return agenda;
}

export function coseDa(): CoseBlobs {
  return new CoseBlobs();
}

export function json(dati: unknown, status = 200): Response {
  return new Response(JSON.stringify(dati), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}
