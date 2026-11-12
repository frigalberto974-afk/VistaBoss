// Gestione di date e orari nel fuso del titolare (Europe/Rome).
// Gli orari scambiati con il modello sono "locali" senza offset: "2026-11-13T10:00:00".

export const FUSO = "Europe/Rome";

const LOCALE_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

/** Verifica che la stringa sia un orario locale nel formato AAAA-MM-GGTHH:MM[:SS]. */
export function eOrarioLocale(valore: unknown): valore is string {
  if (typeof valore !== "string") return false;
  const m = LOCALE_RE.exec(valore);
  if (!m) return false;
  const [, a, me, g, h, mi] = m.map(Number);
  const d = new Date(Date.UTC(a, me - 1, g, h, mi));
  return d.getUTCFullYear() === a && d.getUTCMonth() === me - 1 && d.getUTCDate() === g && h < 24 && mi < 60;
}

/** Offset del fuso in minuti rispetto a UTC nell'istante dato (es. +60 d'inverno, +120 d'estate). */
export function offsetMinuti(istante: Date, fuso = FUSO): number {
  const parti = new Intl.DateTimeFormat("en-US", { timeZone: fuso, timeZoneName: "longOffset" })
    .formatToParts(istante)
    .find((p) => p.type === "timeZoneName")?.value;
  const m = /GMT([+-])(\d{2}):?(\d{2})?/.exec(parti ?? "");
  if (!m) return 0;
  const segno = m[1] === "-" ? -1 : 1;
  return segno * (Number(m[2]) * 60 + Number(m[3] ?? 0));
}

/** Converte un orario locale del fuso in un istante assoluto. */
export function localeAIstante(locale: string, fuso = FUSO): Date {
  const m = LOCALE_RE.exec(locale);
  if (!m) throw new Error(`Orario non valido: ${locale}`);
  const [, a, me, g, h, mi, s] = m.map((x) => Number(x ?? 0));
  const comeUtc = Date.UTC(a, me - 1, g, h, mi, s || 0);
  // Doppio passaggio per gestire correttamente i cambi d'ora legale.
  let istante = comeUtc - offsetMinuti(new Date(comeUtc), fuso) * 60_000;
  istante = comeUtc - offsetMinuti(new Date(istante), fuso) * 60_000;
  return new Date(istante);
}

/** Converte un orario locale in RFC 3339 con offset, come richiesto da Google Calendar per timeMin/timeMax. */
export function localeARfc3339(locale: string, fuso = FUSO): string {
  const istante = localeAIstante(locale, fuso);
  const off = offsetMinuti(istante, fuso);
  const segno = off >= 0 ? "+" : "-";
  const hh = String(Math.floor(Math.abs(off) / 60)).padStart(2, "0");
  const mm = String(Math.abs(off) % 60).padStart(2, "0");
  return `${istanteALocale(istante, fuso)}${segno}${hh}:${mm}`;
}

/** Converte un istante assoluto nell'orario locale del fuso (AAAA-MM-GGTHH:MM:SS). */
export function istanteALocale(istante: Date, fuso = FUSO): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: fuso,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(istante)
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;
}

/** Aggiunge minuti a un orario locale, tenendo conto dell'ora legale. */
export function aggiungiMinuti(locale: string, minuti: number, fuso = FUSO): string {
  return istanteALocale(new Date(localeAIstante(locale, fuso).getTime() + minuti * 60_000), fuso);
}

/** Durata in minuti tra due orari locali. */
export function durataMinuti(inizio: string, fine: string, fuso = FUSO): number {
  return Math.round((localeAIstante(fine, fuso).getTime() - localeAIstante(inizio, fuso).getTime()) / 60_000);
}

/** "venerdì 14 novembre alle 10:00", per le risposte parlate. */
export function descriviOrario(locale: string, fuso = FUSO): string {
  const istante = localeAIstante(locale, fuso);
  const giorno = new Intl.DateTimeFormat("it-IT", { timeZone: fuso, weekday: "long", day: "numeric", month: "long" }).format(istante);
  const ora = new Intl.DateTimeFormat("it-IT", { timeZone: fuso, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(istante);
  return `${giorno} alle ${ora}`;
}

/** Calendario dei prossimi giorni, da mettere nel prompt per evitare errori su "giovedì prossimo". */
export function prossimiGiorni(adesso: Date, quanti = 14, fuso = FUSO): string {
  const righe: string[] = [];
  const fmt = new Intl.DateTimeFormat("it-IT", { timeZone: fuso, weekday: "long", day: "numeric", month: "long", year: "numeric" });
  for (let i = 0; i < quanti; i++) {
    const giorno = new Date(adesso.getTime() + i * 86_400_000);
    const data = istanteALocale(giorno, fuso).slice(0, 10);
    const etichetta = i === 0 ? " (oggi)" : i === 1 ? " (domani)" : i === 2 ? " (dopodomani)" : "";
    righe.push(`- ${data}: ${fmt.format(giorno)}${etichetta}`);
  }
  return righe.join("\n");
}
