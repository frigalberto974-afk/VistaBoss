import { describe, expect, it } from "vitest";
import type { Appuntamento } from "../src/agenda.js";
import { doppioniDaCancellare, titoliSimili } from "../src/doppioni.js";

const a = (id: string, titolo: string, inizio = "2026-11-20T14:30:00", creato?: string): Appuntamento => ({ id, titolo, inizio, fine: "2026-11-20T15:30:00", tuttoIlGiorno: false, creato });

describe("doppioni", () => {
  it("riconosce titoli simili", () => {
    expect(titoliSimili("Incontro con il broker per il leasing", "Broker per il leasing")).toBe(true);
    expect(titoliSimili("Incontro con la banca", "Incontro con Rossi")).toBe(false);
    expect(titoliSimili("Cena con Verdi", "Cena con Verdi")).toBe(true);
  });
  it("tiene il primo creato e cancella gli altri", () => {
    const via = doppioniDaCancellare([
      a("b", "Incontro con il broker per il leasing", undefined, "2026-11-19T10:01:00Z"),
      a("a", "Incontro con il broker per il leasing", undefined, "2026-11-19T10:00:00Z"),
      a("c", "Broker per il leasing", undefined, "2026-11-19T10:02:00Z"),
      a("d", "Incontro con la banca"),
      a("e", "Broker per il leasing", "2026-11-21T14:30:00"),
    ]);
    expect(via.map((x) => x.id).sort()).toEqual(["b", "c"]);
  });
});
