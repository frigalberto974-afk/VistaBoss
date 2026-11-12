import { describe, expect, it } from "vitest";
import { aggiungiMinuti, descriviOrario, durataMinuti, eOrarioLocale, istanteALocale, localeARfc3339, prossimiGiorni } from "../src/tempo.js";

describe("tempo", () => {
  it("converte in RFC 3339 con l'offset corretto d'inverno e d'estate", () => {
    expect(localeARfc3339("2026-11-13T10:00:00")).toBe("2026-11-13T10:00:00+01:00");
    expect(localeARfc3339("2026-07-01T10:00:00")).toBe("2026-07-01T10:00:00+02:00");
  });

  it("riconosce gli orari validi e scarta quelli errati", () => {
    expect(eOrarioLocale("2026-11-13T10:00:00")).toBe(true);
    expect(eOrarioLocale("2026-11-13T10:00")).toBe(true);
    expect(eOrarioLocale("2026-02-30T10:00:00")).toBe(false);
    expect(eOrarioLocale("2026-11-13T10:00:00+01:00")).toBe(false);
    expect(eOrarioLocale("domani")).toBe(false);
  });

  it("aggiunge minuti attraversando il cambio dell'ora legale", () => {
    // 25 ottobre 2026: alle 03:00 si torna alle 02:00.
    expect(aggiungiMinuti("2026-10-25T01:30:00", 120)).toBe("2026-10-25T02:30:00");
    expect(aggiungiMinuti("2026-11-13T23:30:00", 60)).toBe("2026-11-14T00:30:00");
    expect(durataMinuti("2026-11-13T10:00:00", "2026-11-13T11:30:00")).toBe(90);
  });

  it("descrive l'orario in italiano", () => {
    expect(descriviOrario("2026-11-13T10:00:00")).toBe("venerdì 13 novembre alle 10:00");
  });

  it("elenca i prossimi giorni a partire da oggi nel fuso di Roma", () => {
    // 23:30 UTC del 12 novembre = 00:30 del 13 novembre a Roma.
    const adesso = new Date("2026-11-12T23:30:00Z");
    expect(istanteALocale(adesso)).toBe("2026-11-13T00:30:00");
    const righe = prossimiGiorni(adesso, 2).split("\n");
    expect(righe[0]).toBe("- 2026-11-13: venerdì 13 novembre 2026 (oggi)");
    expect(righe[1]).toBe("- 2026-11-14: sabato 14 novembre 2026 (domani)");
  });
});
