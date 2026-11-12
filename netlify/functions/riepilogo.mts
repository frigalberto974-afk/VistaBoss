// Riepilogo della giornata che il segretario dice all'apertura dell'app: GET /api/riepilogo

import type { Config } from "@netlify/functions";
import { testoRiepilogo } from "../../src/riepilogo.js";
import { agendaDa, coseDa, json } from "../../src/servizi.js";
import { aggiungiMinuti, istanteALocale } from "../../src/tempo.js";

export default async (): Promise<Response> => {
  try {
    const adesso = new Date();
    const inizio = `${istanteALocale(adesso).slice(0, 10)}T00:00:00`;
    const [appuntamenti, cose] = await Promise.all([
      agendaDa((n) => Netlify.env.get(n)).elenca(inizio, aggiungiMinuti(inizio, 24 * 60)),
      coseDa().elenca(),
    ]);
    return json({ testo: testoRiepilogo(adesso, appuntamenti, cose) });
  } catch (err) {
    console.error("Errore riepilogo", err);
    return json({ testo: "Ciao. In questo momento non riesco a leggere l'agenda." });
  }
};

export const config: Config = { path: "/api/riepilogo", method: "GET" };
