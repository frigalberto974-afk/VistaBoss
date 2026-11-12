// Funzione pianificata: ogni 5 minuti decide e manda le notifiche push del segretario.
// Riepilogo alle 8 (tutti i giorni), avviso 30 minuti prima di ogni appuntamento, cose da fare alle 17.

import { getStore } from "@netlify/blobs";
import type { Config } from "@netlify/functions";
import webpush from "web-push";
import { notificheDaInviare } from "../../src/riepilogo.js";
import { agendaDa, coseDa, variabile } from "../../src/servizi.js";
import { aggiungiMinuti, istanteALocale } from "../../src/tempo.js";

export default async (): Promise<void> => {
  const leggi = (n: string) => Netlify.env.get(n);
  const iscrizioni = getStore({ name: "iscrizioni-push", consistency: "strong" });
  const inviate = getStore({ name: "notifiche-inviate", consistency: "strong" });

  const { blobs } = await iscrizioni.list();
  if (blobs.length === 0) return;

  const adesso = new Date();
  const inizio = `${istanteALocale(adesso).slice(0, 10)}T00:00:00`;
  const [appuntamenti, cose, gia] = await Promise.all([
    agendaDa(leggi).elenca(inizio, aggiungiMinuti(inizio, 24 * 60)),
    coseDa().elenca(),
    inviate.list(),
  ]);
  const da = notificheDaInviare(adesso, appuntamenti, cose, new Set(gia.blobs.map((b) => b.key)));
  if (da.length === 0) return;

  webpush.setVapidDetails("https://vistaboss.netlify.app", variabile(leggi, "VAPID_PUBLIC_KEY"), variabile(leggi, "VAPID_PRIVATE_KEY"));

  for (const n of da) {
    // Si registra prima dell'invio: meglio una notifica persa che una ripetuta ogni 5 minuti.
    await inviate.set(n.chiave, new Date().toISOString());
    for (const b of blobs) {
      const iscr = (await iscrizioni.get(b.key, { type: "json" })) as webpush.PushSubscription | null;
      if (!iscr) continue;
      try {
        await webpush.sendNotification(iscr, JSON.stringify({ titolo: n.titolo, testo: n.testo }), { TTL: 3600, urgency: "high" });
      } catch (err) {
        const codice = (err as { statusCode?: number }).statusCode;
        if (codice === 404 || codice === 410) await iscrizioni.delete(b.key);
        else console.error("Invio notifica fallito", codice);
      }
    }
  }
};

// Ogni 5 minuti (UTC: l'orario locale è calcolato nel codice con il fuso Europe/Rome).
export const config: Config = { schedule: "*/5 * * * *" };
