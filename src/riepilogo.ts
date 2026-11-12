// Testi del segretario: riepilogo della giornata e notifiche.

import type { Appuntamento } from "./agenda.js";
import type { Cosa } from "./cose.js";
import { istanteALocale } from "./tempo.js";

function oraParlata(locale: string): string {
  const [h, m] = locale.slice(11, 16).split(":").map(Number);
  return m === 0 ? `alle ${h}` : `alle ${h} e ${m}`;
}

export function saluto(adesso: Date): string {
  const h = Number(istanteALocale(adesso).slice(11, 13));
  return h < 13 ? "Buongiorno" : h < 18 ? "Buon pomeriggio" : "Buonasera";
}

export function elencoAppuntamenti(appuntamenti: Appuntamento[]): string {
  const conOra = appuntamenti.filter((a) => !a.tuttoIlGiorno);
  const giornata = appuntamenti.filter((a) => a.tuttoIlGiorno);
  const parti = [
    ...giornata.map((a) => `per tutto il giorno ${a.titolo}`),
    ...conOra.map((a) => `${oraParlata(a.inizio)} ${a.titolo}${a.luogo ? `, ${a.luogo}` : ""}`),
  ];
  return parti.join("; ");
}

/** Riepilogo parlato: appuntamenti rimasti di oggi e cose da fare aperte. */
export function testoRiepilogo(adesso: Date, appuntamentiOggi: Appuntamento[], cose: Cosa[]): string {
  const ora = istanteALocale(adesso);
  const rimasti = appuntamentiOggi.filter((a) => a.tuttoIlGiorno || a.fine > ora);
  const aperte = cose.filter((c) => !c.fatta);
  const frasi = [`${saluto(adesso)}.`];
  if (rimasti.length === 0) frasi.push("Oggi non hai altri appuntamenti.");
  else if (rimasti.length === 1) frasi.push(`Oggi hai un appuntamento: ${elencoAppuntamenti(rimasti)}.`);
  else frasi.push(`Oggi hai ${rimasti.length} appuntamenti: ${elencoAppuntamenti(rimasti)}.`);
  if (aperte.length === 1) frasi.push(`Hai una cosa da fare: ${aperte[0].testo}.`);
  else if (aperte.length > 1) frasi.push(`Hai ${aperte.length} cose da fare: ${aperte.map((c) => c.testo).join("; ")}.`);
  return frasi.join(" ");
}

export interface Notifica {
  chiave: string;
  titolo: string;
  testo: string;
}

const MATTINO = 8;
const SERA = 17;
const PREAVVISO_MIN = 30;

/**
 * Decide quali notifiche mandare adesso. Chiamata ogni 5 minuti.
 * `giaInviate` evita i doppioni: ogni notifica ha una chiave stabile.
 */
export function notificheDaInviare(adesso: Date, appuntamenti: Appuntamento[], cose: Cosa[], giaInviate: Set<string>): Notifica[] {
  const locale = istanteALocale(adesso);
  const giorno = locale.slice(0, 10);
  const ora = Number(locale.slice(11, 13));
  const minuto = Number(locale.slice(14, 16));
  const giornoSettimana = new Date(`${giorno}T12:00:00Z`).getUTCDay(); // 0 domenica
  const lavorativo = giornoSettimana >= 1 && giornoSettimana <= 5;
  const aperte = cose.filter((c) => !c.fatta);
  const fuori: Notifica[] = [];

  // Riepilogo del mattino: tutti i giorni, sabato e domenica compresi.
  if (ora === MATTINO && minuto < 30) {
    const oggi = appuntamenti.filter((a) => a.inizio.slice(0, 10) === giorno);
    fuori.push({ chiave: `mattino-${giorno}`, titolo: "La tua giornata", testo: testoRiepilogo(adesso, oggi, cose) });
  }

  for (const a of appuntamenti) {
    if (a.tuttoIlGiorno) continue;
    const mancano = (Date.parse(`${a.inizio}Z`) - Date.parse(`${locale}Z`)) / 60_000;
    if (mancano > 0 && mancano <= PREAVVISO_MIN) {
      fuori.push({
        chiave: `app-${a.id}-${a.inizio}`,
        titolo: `Tra ${Math.round(mancano)} minuti`,
        testo: `${a.titolo} ${oraParlata(a.inizio)}${a.luogo ? `, ${a.luogo}` : ""}.`,
      });
    }
  }

  if (lavorativo && ora === SERA && minuto < 30 && aperte.length > 0) {
    fuori.push({
      chiave: `cose-${giorno}`,
      titolo: aperte.length === 1 ? "Hai una cosa da fare" : `Hai ${aperte.length} cose da fare`,
      testo: aperte.map((c) => c.testo).join("; "),
    });
  }

  return fuori.filter((n) => !giaInviate.has(n.chiave));
}
