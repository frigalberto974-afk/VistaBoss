import { describe, expect, it } from "vitest";
import type { Agenda, Appuntamento, NuovoAppuntamento } from "../src/agenda.js";
import { conferma, rispondi, storiaInMessaggi, type ChiamaModello } from "../src/assistente.js";

class AgendaMemoria implements Agenda {
  dati = new Map<string, Appuntamento>();
  creati: NuovoAppuntamento[] = [];
  prossimo = 1;
  async elenca(da: string, a: string) {
    return [...this.dati.values()].filter((x) => x.inizio >= da && x.inizio <= a);
  }
  async leggi(id: string) {
    return this.dati.get(id) ?? null;
  }
  async crea(d: NuovoAppuntamento) {
    this.creati.push(d);
    const app = { id: `e${this.prossimo++}`, titolo: d.titolo, inizio: d.inizio, fine: d.fine, tuttoIlGiorno: false, luogo: d.luogo };
    this.dati.set(app.id, app);
    return app;
  }
  async creaGiornata(titolo: string, giorno: string) {
    const app = { id: `g${this.prossimo++}`, titolo, inizio: giorno, fine: giorno, tuttoIlGiorno: true };
    this.dati.set(app.id, app);
    return app;
  }
  async sposta(id: string, inizio: string, fine: string) {
    const app = { ...this.dati.get(id)!, inizio, fine };
    this.dati.set(id, app);
    return app;
  }
  async cancella(id: string) {
    this.dati.delete(id);
  }
}

type Blocco = { type: "text"; text: string } | { type: "tool_use"; id: string; name: string; input: unknown };

/** Modello finto: restituisce in sequenza le risposte previste e registra le richieste. */
function modelloFinto(risposte: Blocco[][]) {
  const richieste: Parameters<ChiamaModello>[0][] = [];
  const modello: ChiamaModello = async (params) => {
    richieste.push(structuredClone(params));
    const content = risposte.shift();
    if (!content) throw new Error("Nessuna risposta prevista");
    const usaStrumenti = content.some((b) => b.type === "tool_use");
    return { content, stop_reason: usaStrumenti ? "tool_use" : "end_turn" } as never;
  };
  return { modello, richieste };
}

const adesso = () => new Date("2026-11-12T09:00:00Z");
const segreto = "segreto-test";

describe("assistente", () => {
  it("crea un appuntamento con durata e promemoria predefiniti", async () => {
    const agenda = new AgendaMemoria();
    const { modello, richieste } = modelloFinto([
      [{ type: "tool_use", id: "t1", name: "crea_appuntamento", input: { titolo: "Incontro con Rossi", inizio: "2026-11-13T10:00:00" } }],
      [{ type: "text", text: "Segnato: venerdì 13 novembre alle 10, incontro con Rossi." }],
    ]);
    const r = await rispondi("domani alle 10 vedo Rossi", [], { modello, agenda, segreto, adesso });

    expect(r.risposta).toContain("Rossi");
    expect(r.inAttesa).toBeUndefined();
    expect(agenda.creati).toEqual([
      { titolo: "Incontro con Rossi", inizio: "2026-11-13T10:00:00", fine: "2026-11-13T11:00:00", luogo: undefined, note: undefined, promemoriaMinuti: 30 },
    ]);
    expect(richieste[0].model).toBe("claude-sonnet-5-5");
    expect(richieste[0].system).toContain("2026-11-13: venerdì 13 novembre 2026 (domani)");
    // Il secondo giro contiene il risultato dello strumento.
    const ultimo = richieste[1].messages.at(-1)!;
    expect(JSON.stringify(ultimo.content)).toContain("Creato: id=e1");
  });

  it("non sposta finché il titolare non conferma, poi esegue l'azione firmata", async () => {
    const agenda = new AgendaMemoria();
    agenda.dati.set("x1", { id: "x1", titolo: "Rossi", inizio: "2026-11-13T10:00:00", fine: "2026-11-13T11:30:00", tuttoIlGiorno: false });
    const { modello } = modelloFinto([
      [{ type: "tool_use", id: "t1", name: "elenca_appuntamenti", input: { da: "2026-11-13T00:00:00", a: "2026-11-13T23:59:59" } }],
      [{ type: "tool_use", id: "t2", name: "prepara_spostamento", input: { id: "x1", nuovo_inizio: "2026-11-14T09:00:00" } }],
      [{ type: "text", text: "Sposto Rossi a sabato alle 9, confermi?" }],
    ]);
    const r = await rispondi("sposta Rossi a sabato alle 9", [], { modello, agenda, segreto, adesso });

    expect(agenda.dati.get("x1")!.inizio).toBe("2026-11-13T10:00:00");
    expect(r.inAttesa?.azione).toMatchObject({ tipo: "sposta", id: "x1", inizio: "2026-11-14T09:00:00", fine: "2026-11-14T10:30:00" });

    const fatto = await conferma(r.inAttesa!.azione, r.inAttesa!.firma, { modello, agenda, segreto, adesso });
    expect(fatto.risposta).toBe("Fatto. Ho spostato Rossi a sabato 14 novembre alle 09:00.");
    expect(agenda.dati.get("x1")!.inizio).toBe("2026-11-14T09:00:00");
  });

  it("rifiuta una conferma con azione alterata", async () => {
    const agenda = new AgendaMemoria();
    agenda.dati.set("x1", { id: "x1", titolo: "Rossi", inizio: "2026-11-13T10:00:00", fine: "2026-11-13T11:00:00", tuttoIlGiorno: false });
    agenda.dati.set("x2", { id: "x2", titolo: "Bianchi", inizio: "2026-11-13T12:00:00", fine: "2026-11-13T13:00:00", tuttoIlGiorno: false });
    const { modello } = modelloFinto([
      [{ type: "tool_use", id: "t1", name: "prepara_cancellazione", input: { id: "x1" } }],
      [{ type: "text", text: "Cancello Rossi, confermi?" }],
    ]);
    const r = await rispondi("cancella Rossi", [], { modello, agenda, segreto, adesso });
    const alterata = { ...r.inAttesa!.azione, id: "x2" };
    const esito = await conferma(alterata, r.inAttesa!.firma, { modello, agenda, segreto, adesso });

    expect(esito.risposta).toContain("scaduta");
    expect(agenda.dati.has("x1")).toBe(true);
    expect(agenda.dati.has("x2")).toBe(true);
  });

  it("segnala al modello input non validi senza toccare l'agenda", async () => {
    const agenda = new AgendaMemoria();
    const { modello, richieste } = modelloFinto([
      [{ type: "tool_use", id: "t1", name: "crea_appuntamento", input: { titolo: "Rossi", inizio: "domani" } }],
      [{ type: "text", text: "A che ora?" }],
    ]);
    await rispondi("vedo Rossi", [], { modello, agenda, segreto, adesso });
    expect(agenda.creati).toHaveLength(0);
    expect(JSON.stringify(richieste[1].messages.at(-1)!.content)).toContain('"is_error":true');
  });

  it("gestisce il rifiuto del modello", async () => {
    const modello: ChiamaModello = async () => ({ content: [], stop_reason: "refusal" }) as never;
    const r = await rispondi("ciao", [], { modello, agenda: new AgendaMemoria(), segreto, adesso });
    expect(r.risposta).toBe("Non posso aiutarti con questa richiesta.");
  });

  it("ripulisce la storia: inizia dal titolare e unisce ruoli consecutivi", () => {
    expect(
      storiaInMessaggi([
        { ruolo: "assistente", testo: "ciao" },
        { ruolo: "titolare", testo: "uno" },
        { ruolo: "titolare", testo: "due" },
        { ruolo: "assistente", testo: "ok" },
        { ruolo: "intruso" as never, testo: "x" },
      ]),
    ).toEqual([
      { role: "user", content: "uno\ndue" },
      { role: "assistant", content: "ok" },
    ]);
  });
});

describe("cose da ricordare senza orario", () => {
  it("finiscono in agenda per tutta la giornata", async () => {
    const agenda = new AgendaMemoria();
    const { modello } = modelloFinto([
      [{ type: "tool_use", id: "t1", name: "crea_impegno_giornata", input: { titolo: "Chiamare Bianchi", giorno: "2026-11-12" } }],
      [{ type: "text", text: "Segnato per oggi: chiamare Bianchi." }],
    ]);
    const r = await rispondi("ricordami di chiamare Bianchi", [], { modello, agenda, segreto, adesso });
    expect(r.risposta).toContain("Bianchi");
    expect([...agenda.dati.values()]).toEqual([{ id: "g1", titolo: "Chiamare Bianchi", inizio: "2026-11-12", fine: "2026-11-12", tuttoIlGiorno: true }]);
  });
  it("usa oggi se il giorno non è valido", async () => {
    const agenda = new AgendaMemoria();
    const { modello } = modelloFinto([
      [{ type: "tool_use", id: "t1", name: "crea_impegno_giornata", input: { titolo: "Pagare fattura", giorno: "domani" } }],
      [{ type: "text", text: "Segnato." }],
    ]);
    await rispondi("ricordami di pagare la fattura", [], { modello, agenda, segreto, adesso });
    expect([...agenda.dati.values()][0].inizio).toBe("2026-11-12");
  });
});
