import { describe, expect, it } from "vitest";
import type { Appuntamento } from "../src/agenda.js";
import type { Cosa } from "../src/cose.js";
import { notificheDaInviare, testoRiepilogo } from "../src/riepilogo.js";

const app = (id: string, inizio: string, fine: string, titolo: string, luogo?: string): Appuntamento => ({ id, inizio, fine, titolo, luogo, tuttoIlGiorno: false });
const cosa = (testo: string): Cosa => ({ id: testo, testo, creata: "2026-11-12T08:00:00Z", fatta: false });
// Venerdì 13 novembre 2026, ore locali di Roma (UTC+1).
const roma = (hhmm: string) => new Date(`2026-11-13T${hhmm}:00+01:00`);

describe("riepilogo", () => {
  it("conta solo gli impegni non ancora finiti e rimanda all'agenda", () => {
    const testo = testoRiepilogo(
      roma("09:00"),
      [app("a", "2026-11-13T08:00:00", "2026-11-13T08:30:00", "Colazione"), app("b", "2026-11-13T10:30:00", "2026-11-13T11:00:00", "Rossi", "sede")],
      [cosa("chiamare Bianchi")],
    );
    expect(testo).toBe("Buongiorno. Oggi hai un impegno: guarda l'agenda.");
  });
  it("giornata libera", () => {
    expect(testoRiepilogo(roma("19:00"), [], [])).toBe("Buonasera. Oggi non hai altri impegni.");
  });
});

describe("notifiche", () => {
  const appuntamenti = [app("x", "2026-11-13T10:00:00", "2026-11-13T11:00:00", "Rossi")];

  it("manda il riepilogo alle 8 una sola volta", () => {
    const n = notificheDaInviare(roma("08:05"), appuntamenti, [], new Set());
    expect(n.map((x) => x.chiave)).toEqual(["mattino-2026-11-13"]);
    expect(notificheDaInviare(roma("08:10"), appuntamenti, [], new Set(["mattino-2026-11-13"]))).toEqual([]);
  });
  it("avvisa entro 30 minuti dall'appuntamento", () => {
    expect(notificheDaInviare(roma("09:25"), appuntamenti, [], new Set())).toEqual([]);
    const n = notificheDaInviare(roma("09:30"), appuntamenti, [], new Set());
    expect(n).toEqual([{ chiave: "app-x-2026-11-13T10:00:00", titolo: "Tra 30 minuti", testo: "Rossi alle 10." }]);
    expect(notificheDaInviare(roma("10:00"), appuntamenti, [], new Set())).toEqual([]);
  });
  it("ricorda le cose da fare alle 17 solo se ce ne sono", () => {
    expect(notificheDaInviare(roma("17:00"), [], [], new Set())).toEqual([]);
    expect(notificheDaInviare(roma("17:00"), [], [cosa("pagare fattura")], new Set())[0]).toMatchObject({ chiave: "cose-2026-11-13", testo: "pagare fattura" });
  });
  it("riepilogo del mattino anche nel fine settimana", () => {
    expect(notificheDaInviare(new Date("2026-11-14T08:05:00+01:00"), [], [], new Set()).map((n) => n.chiave)).toEqual(["mattino-2026-11-14"]);
  });
});
