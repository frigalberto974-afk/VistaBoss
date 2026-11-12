// Firma delle azioni in attesa di conferma (spostamento, cancellazione).
// L'azione viene preparata dall'assistente, restituita al telefono firmata,
// ed eseguita solo quando il titolare conferma. La firma impedisce di alterarla.

import { createHmac, timingSafeEqual } from "node:crypto";

export type Azione =
  | { tipo: "sposta"; id: string; titolo: string; inizio: string; fine: string; scade: number }
  | { tipo: "cancella"; id: string; titolo: string; inizio: string; scade: number };

export const VALIDITA_MS = 10 * 60_000;

function calcola(azione: Azione, segreto: string): string {
  return createHmac("sha256", segreto).update(JSON.stringify(azione)).digest("base64url");
}

export function firma(azione: Azione, segreto: string): string {
  return calcola(azione, segreto);
}

export function verificaFirma(azione: Azione, firmaRicevuta: string, segreto: string, adesso = Date.now()): boolean {
  if (typeof firmaRicevuta !== "string" || !azione || typeof azione.scade !== "number") return false;
  if (adesso > azione.scade) return false;
  const attesa = Buffer.from(calcola(azione, segreto));
  const ricevuta = Buffer.from(firmaRicevuta);
  return attesa.length === ricevuta.length && timingSafeEqual(attesa, ricevuta);
}

/** Confronto del PIN a tempo costante. */
export function pinValido(ricevuto: string | null, atteso: string): boolean {
  if (!ricevuto || !atteso) return false;
  const a = createHmac("sha256", "pin").update(ricevuto).digest();
  const b = createHmac("sha256", "pin").update(atteso).digest();
  return timingSafeEqual(a, b);
}
