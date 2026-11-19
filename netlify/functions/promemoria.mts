// Agente del segretario, eseguito ogni 5 minuti sul server:
// 1. manda gli avvisi (riepilogo alle 8, 30 minuti prima di ogni impegno);
// 2. controlla che ogni avviso sia stato ricevuto dal telefono e, se non arriva la conferma, lo rimanda;
// 3. ogni 15 minuti cancella i doppioni in agenda (stesso orario, titolo simile).

import { getStore } from "@netlify/blobs";
import type { Config } from "@netlify/functions";
import webpush from "web-push";
import { doppioniDaCancellare } from "../../src/doppioni.js";
import { notificheDaInviare, type Notifica } from "../../src/riepilogo.js";
import { agendaDa, variabile } from "../../src/servizi.js";
import { aggiungiMinuti, istanteALocale } from "../../src/tempo.js";

const MINUTI_PER_CONFERMA = 4; // dopo quanto un avviso senza conferma viene rimandato
const MAX_TENTATIVI = 3;
const FINESTRA_RINVII_MIN = 40; // oltre questo tempo l'avviso non ha più senso
const GIORNI_CONTROLLO_DOPPIONI = 60;

interface Consegna {
  chiave: string;
  iscrizione: string;
  titolo: string;
  testo: string;
  primoInvio: string;
  ultimoInvio: string;
  tentativi: number;
  ricevuta?: string;
}

export default async (): Promise<void> => {
  const leggi = (n: string) => Netlify.env.get(n);
  const agenda = agendaDa(leggi);
  const adesso = new Date();
  const minuto = Number(istanteALocale(adesso).slice(14, 16));

  // ---- 3. Doppioni (ogni 15 minuti) ----
  if (minuto % 15 < 5) {
    try {
      const oggi = `${istanteALocale(adesso).slice(0, 10)}T00:00:00`;
      const futuri = await agenda.elenca(oggi, aggiungiMinuti(oggi, GIORNI_CONTROLLO_DOPPIONI * 24 * 60));
      for (const d of doppioniDaCancellare(futuri)) {
        await agenda.cancella(d.id);
        console.log("Doppione cancellato", d.inizio, d.titolo);
      }
    } catch (err) {
      console.error("Controllo doppioni non riuscito", err);
    }
  }

  const iscrizioni = getStore({ name: "iscrizioni-push", consistency: "strong" });
  const inviate = getStore({ name: "notifiche-inviate", consistency: "strong" });
  const consegne = getStore({ name: "consegne-avvisi", consistency: "strong" });
  const { blobs } = await iscrizioni.list();
  if (blobs.length === 0) {
    console.warn("Nessun telefono iscritto agli avvisi");
    return;
  }
  webpush.setVapidDetails("https://vistaboss.netlify.app", variabile(leggi, "VAPID_PUBLIC_KEY"), variabile(leggi, "VAPID_PRIVATE_KEY"));

  // Restituisce "conferma" se il telefono confermerà la ricezione, "ok" se no, false se l'invio fallisce.
  async function invia(chiaveIscrizione: string, n: Pick<Notifica, "chiave" | "titolo" | "testo">): Promise<"conferma" | "ok" | false> {
    const iscr = (await iscrizioni.get(chiaveIscrizione, { type: "json" })) as (webpush.PushSubscription & { ricevute?: boolean }) | null;
    if (!iscr) return false;
    try {
      await webpush.sendNotification(iscr, JSON.stringify({ titolo: n.titolo, testo: n.testo, chiave: n.chiave }), { TTL: 3600, urgency: "high" });
      return iscr.ricevute ? "conferma" : "ok";
    } catch (err) {
      const codice = (err as { statusCode?: number }).statusCode;
      if (codice === 404 || codice === 410) {
        await iscrizioni.delete(chiaveIscrizione);
        console.warn("Telefono non più iscritto, iscrizione rimossa", chiaveIscrizione.slice(0, 8));
      } else {
        console.error("Invio avviso fallito", codice, chiaveIscrizione.slice(0, 8));
      }
      return false;
    }
  }

  // ---- 1. Nuovi avvisi ----
  const inizioGiorno = `${istanteALocale(adesso).slice(0, 10)}T00:00:00`;
  const [appuntamenti, gia] = await Promise.all([agenda.elenca(inizioGiorno, aggiungiMinuti(inizioGiorno, 24 * 60)), inviate.list()]);
  const nuove = notificheDaInviare(adesso, appuntamenti, [], new Set(gia.blobs.map((b) => b.key)));
  for (const n of nuove) {
    await inviate.set(n.chiave, adesso.toISOString());
    for (const b of blobs) {
      const ok = await invia(b.key, n);
      const c: Consegna = { chiave: n.chiave, iscrizione: b.key, titolo: n.titolo, testo: n.testo, primoInvio: adesso.toISOString(), ultimoInvio: adesso.toISOString(), tentativi: 1 };
      if (ok === "conferma") await consegne.setJSON(`${n.chiave}|${b.key}`, c);
      console.log("Avviso inviato", n.chiave, b.key.slice(0, 8), ok ? "ok" : "fallito");
    }
  }

  // ---- 2. Verifica di ricezione e rinvio ----
  const { blobs: inCorso } = await consegne.list();
  for (const { key } of inCorso) {
    const c = (await consegne.get(key, { type: "json" })) as Consegna | null;
    if (!c) continue;
    const etaMin = (adesso.getTime() - Date.parse(c.primoInvio)) / 60_000;
    if (etaMin > 48 * 60) { await consegne.delete(key); continue; } // pulizia
    if (c.ricevuta || etaMin > FINESTRA_RINVII_MIN) continue;
    const daUltimo = (adesso.getTime() - Date.parse(c.ultimoInvio)) / 60_000;
    if (daUltimo < MINUTI_PER_CONFERMA) continue;
    if (c.tentativi >= MAX_TENTATIVI) {
      if (c.tentativi === MAX_TENTATIVI) {
        console.error("Avviso mai confermato dal telefono", c.chiave, c.iscrizione.slice(0, 8));
        await consegne.setJSON(key, { ...c, tentativi: c.tentativi + 1 });
      }
      continue;
    }
    const ok = await invia(c.iscrizione, c);
    await consegne.setJSON(key, { ...c, ultimoInvio: adesso.toISOString(), tentativi: c.tentativi + 1 });
    console.warn("Avviso non confermato, rimandato", c.chiave, c.iscrizione.slice(0, 8), ok ? "ok" : "fallito");
  }
};

export const config: Config = { schedule: "*/5 * * * *" };
