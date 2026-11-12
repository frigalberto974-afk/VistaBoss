import { describe, expect, it } from "vitest";
import { firma, pinValido, verificaFirma, type Azione } from "../src/firma.js";

const azione: Azione = { tipo: "cancella", id: "abc", titolo: "Rossi", inizio: "2026-11-13T10:00:00", scade: 2_000 };

describe("firma", () => {
  it("accetta un'azione integra e non scaduta", () => {
    expect(verificaFirma(azione, firma(azione, "s"), "s", 1_000)).toBe(true);
  });
  it("rifiuta azione alterata, segreto diverso o scaduta", () => {
    const f = firma(azione, "s");
    expect(verificaFirma({ ...azione, id: "altro" }, f, "s", 1_000)).toBe(false);
    expect(verificaFirma(azione, f, "x", 1_000)).toBe(false);
    expect(verificaFirma(azione, f, "s", 3_000)).toBe(false);
    expect(verificaFirma(azione, "falsa", "s", 1_000)).toBe(false);
  });
  it("controlla il PIN", () => {
    expect(pinValido("1234", "1234")).toBe(true);
    expect(pinValido("1235", "1234")).toBe(false);
    expect(pinValido(null, "1234")).toBe(false);
    expect(pinValido("1234", "")).toBe(false);
  });
});
