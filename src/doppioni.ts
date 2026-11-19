// Riconoscimento dei doppioni in agenda: stesso orario e titolo simile
// (es. "Incontro con il broker per il leasing" e "Broker per il leasing").

import type { Appuntamento } from "./agenda.js";

const PAROLE_VUOTE = new Set(["con", "il", "lo", "la", "i", "gli", "le", "un", "una", "uno", "per", "di", "del", "della", "dei", "delle", "a", "al", "alla", "da", "dal", "in", "e", "ed", "su", "sul", "che", "mio", "mia"]);

export function paroleChiave(titolo: string): Set<string> {
  return new Set(
    titolo
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9 ]/g, " ")
      .split(/\s+/)
      .filter((p) => p.length > 1 && !PAROLE_VUOTE.has(p)),
  );
}

export function titoliSimili(a: string, b: string): boolean {
  const pa = paroleChiave(a), pb = paroleChiave(b);
  if (pa.size === 0 || pb.size === 0) return a.trim().toLowerCase() === b.trim().toLowerCase();
  let comuni = 0;
  for (const p of pa) if (pb.has(p)) comuni++;
  return comuni / Math.min(pa.size, pb.size) >= 0.6;
}

export function sonoDoppioni(a: Pick<Appuntamento, "titolo" | "inizio" | "tuttoIlGiorno">, b: Pick<Appuntamento, "titolo" | "inizio" | "tuttoIlGiorno">): boolean {
  return a.tuttoIlGiorno === b.tuttoIlGiorno && a.inizio === b.inizio && titoliSimili(a.titolo, b.titolo);
}

/** Restituisce gli impegni da cancellare: per ogni gruppo di doppioni si tiene il primo creato. */
export function doppioniDaCancellare(lista: Appuntamento[]): Appuntamento[] {
  const ordinati = [...lista].sort((x, y) => (x.creato ?? "").localeCompare(y.creato ?? "") || x.id.localeCompare(y.id));
  const tenuti: Appuntamento[] = [];
  const via: Appuntamento[] = [];
  for (const a of ordinati) {
    if (tenuti.some((t) => sonoDoppioni(t, a))) via.push(a);
    else tenuti.push(a);
  }
  return via;
}
