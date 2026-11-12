// Logica dell'assistente vocale: riceve la frase del titolare, usa Claude con
// strumenti sull'agenda e restituisce una risposta breve da leggere ad alta voce.
// Creazione e lettura sono immediate; spostamento e cancellazione vengono solo
// preparati e richiedono la conferma esplicita del titolare.

import type Anthropic from "@anthropic-ai/sdk";
import type { Agenda, Appuntamento } from "./agenda.js";
import { firma, verificaFirma, VALIDITA_MS, type Azione } from "./firma.js";
import { aggiungiMinuti, descriviOrario, durataMinuti, eOrarioLocale, istanteALocale, prossimiGiorni } from "./tempo.js";

type BetaMessage = Anthropic.Beta.Messages.BetaMessage;
type BetaMessageParam = Anthropic.Beta.Messages.BetaMessageParam;
type BetaTool = Anthropic.Beta.Messages.BetaTool;
type BetaToolResultBlockParam = Anthropic.Beta.Messages.BetaToolResultBlockParam;
type BetaCreateParams = Anthropic.Beta.Messages.MessageCreateParamsNonStreaming;

export const MODELLO = "claude-sonnet-5-5";
const MAX_GIRI = 6;
const PROMEMORIA_PREDEFINITO = 30;

export type ChiamaModello = (params: BetaCreateParams) => Promise<BetaMessage>;

export interface Dipendenze {
  modello: ChiamaModello;
  agenda: Agenda;
  segreto: string;
  adesso?: () => Date;
}

export interface Scambio {
  ruolo: "titolare" | "assistente";
  testo: string;
}

export interface Risposta {
  risposta: string;
  inAttesa?: { azione: Azione; firma: string };
}

export const STRUMENTI: BetaTool[] = [
  {
    name: "elenca_appuntamenti",
    description:
      "Elenca gli appuntamenti tra due orari locali (fuso Europe/Rome). Usalo per rispondere a domande sull'agenda e per trovare l'id di un appuntamento prima di spostarlo o cancellarlo.",
    input_schema: {
      type: "object",
      properties: {
        da: { type: "string", description: "Inizio intervallo, formato AAAA-MM-GGTHH:MM:SS" },
        a: { type: "string", description: "Fine intervallo, formato AAAA-MM-GGTHH:MM:SS" },
      },
      required: ["da", "a"],
      additionalProperties: false,
    },
  },
  {
    name: "crea_appuntamento",
    description: "Crea un appuntamento nell'agenda del titolare. Eseguito subito, senza conferma.",
    input_schema: {
      type: "object",
      properties: {
        titolo: { type: "string", description: "Breve, es. 'Incontro con Rossi'" },
        inizio: { type: "string", description: "AAAA-MM-GGTHH:MM:SS, ora locale" },
        durata_minuti: { type: "integer", description: "Durata; se il titolare non la dice usa 60" },
        luogo: { type: "string", description: "Solo se detto dal titolare" },
        note: { type: "string", description: "Solo se dette dal titolare" },
        promemoria_minuti: {
          type: "integer",
          description: `Minuti di preavviso per l'avviso sul telefono; se non detto usa ${PROMEMORIA_PREDEFINITO}`,
        },
      },
      required: ["titolo", "inizio"],
      additionalProperties: false,
    },
  },
  {
    name: "prepara_spostamento",
    description:
      "Prepara lo spostamento di un appuntamento esistente. NON lo esegue: il titolare dovrà confermare. Dopo averlo chiamato, chiedi conferma con una frase breve.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string", description: "id ottenuto da elenca_appuntamenti" },
        nuovo_inizio: { type: "string", description: "AAAA-MM-GGTHH:MM:SS, ora locale" },
        durata_minuti: { type: "integer", description: "Ometti per mantenere la durata attuale" },
      },
      required: ["id", "nuovo_inizio"],
      additionalProperties: false,
    },
  },
  {
    name: "prepara_cancellazione",
    description:
      "Prepara la cancellazione di un appuntamento esistente. NON la esegue: il titolare dovrà confermare. Dopo averlo chiamato, chiedi conferma con una frase breve.",
    input_schema: {
      type: "object",
      properties: { id: { type: "string", description: "id ottenuto da elenca_appuntamenti" } },
      required: ["id"],
      additionalProperties: false,
    },
  },
];

export function promptDiSistema(adesso: Date): string {
  return `Sei l'assistente vocale dell'agenda di un titolare d'azienda. Parli solo italiano.
Le tue risposte vengono lette ad alta voce sul telefono: frasi brevi, naturali, senza elenchi puntati, senza simboli, senza emoji, orari scritti come "alle 10" o "alle 15 e 30".

Adesso sono le ${istanteALocale(adesso).slice(11, 16)} di ${prossimiGiorni(adesso, 1).replace(/^- \S+: /, "").replace(" (oggi)", "")}. Fuso orario: Europe/Rome.
Calendario dei prossimi giorni, usalo per calcolare le date:
${prossimiGiorni(adesso, 14)}

Come lavori:
- Per segnare un appuntamento usa crea_appuntamento. Se manca l'orario o il giorno, chiedilo in una frase. Se il titolare dice "mattina" senza ora, chiedi l'ora.
- Per domande sull'agenda usa elenca_appuntamenti e rispondi in modo riassuntivo.
- Per spostare o cancellare: prima trova l'appuntamento con elenca_appuntamenti, poi usa prepara_spostamento o prepara_cancellazione e chiedi conferma ripetendo cosa farai, ad esempio "Sposto Rossi a venerdì alle 10, confermi?". Non dire mai che è già fatto: viene eseguito solo dopo il sì del titolare.
- Se più appuntamenti corrispondono, chiedi quale.
- Non inventare appuntamenti, nomi o luoghi. Se non hai capito, chiedi di ripetere.
- Dopo aver creato un appuntamento conferma in una frase con giorno e ora.`;
}

function testoDi(msg: BetaMessage): string {
  return msg.content
    .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
    .map((b) => b.text)
    .join(" ")
    .trim();
}

function descriviPerModello(a: Appuntamento): string {
  const quando = a.tuttoIlGiorno ? `${a.inizio} tutto il giorno` : `${a.inizio} -> ${a.fine}`;
  return `id=${a.id} | ${quando} | ${a.titolo}${a.luogo ? ` | luogo: ${a.luogo}` : ""}${a.note ? ` | note: ${a.note}` : ""}`;
}

function intero(v: unknown, predefinito: number, min: number, max: number): number {
  return typeof v === "number" && Number.isInteger(v) && v >= min && v <= max ? v : predefinito;
}

function testoOpzionale(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim().slice(0, 500) : undefined;
}

interface EsitoStrumento {
  contenuto: string;
  errore?: boolean;
  azione?: Azione;
}

async function eseguiStrumento(nome: string, input: Record<string, unknown>, dip: Dipendenze, adesso: Date): Promise<EsitoStrumento> {
  const { agenda } = dip;
  switch (nome) {
    case "elenca_appuntamenti": {
      if (!eOrarioLocale(input.da) || !eOrarioLocale(input.a)) return { contenuto: "Formato orario non valido.", errore: true };
      const elenco = await agenda.elenca(input.da, input.a);
      return { contenuto: elenco.length ? elenco.map(descriviPerModello).join("\n") : "Nessun appuntamento in questo intervallo." };
    }
    case "crea_appuntamento": {
      const titolo = testoOpzionale(input.titolo);
      if (!titolo || !eOrarioLocale(input.inizio)) return { contenuto: "Titolo o orario non validi.", errore: true };
      const inizio = input.inizio.length === 16 ? `${input.inizio}:00` : input.inizio;
      const durata = intero(input.durata_minuti, 60, 5, 24 * 60);
      const creato = await agenda.crea({
        titolo,
        inizio,
        fine: aggiungiMinuti(inizio, durata),
        luogo: testoOpzionale(input.luogo),
        note: testoOpzionale(input.note),
        promemoriaMinuti: intero(input.promemoria_minuti, PROMEMORIA_PREDEFINITO, 0, 7 * 24 * 60),
      });
      return { contenuto: `Creato: ${descriviPerModello(creato)}` };
    }
    case "prepara_spostamento": {
      if (typeof input.id !== "string" || !eOrarioLocale(input.nuovo_inizio)) return { contenuto: "Dati non validi.", errore: true };
      const esistente = await agenda.leggi(input.id);
      if (!esistente) return { contenuto: "Appuntamento non trovato.", errore: true };
      const inizio = input.nuovo_inizio.length === 16 ? `${input.nuovo_inizio}:00` : input.nuovo_inizio;
      const durataAttuale = esistente.tuttoIlGiorno ? 60 : Math.max(durataMinuti(esistente.inizio, esistente.fine), 5);
      const durata = intero(input.durata_minuti, durataAttuale, 5, 24 * 60);
      const azione: Azione = {
        tipo: "sposta",
        id: esistente.id,
        titolo: esistente.titolo,
        inizio,
        fine: aggiungiMinuti(inizio, durata),
        scade: adesso.getTime() + VALIDITA_MS,
      };
      return { contenuto: `Preparato, in attesa di conferma: spostare "${esistente.titolo}" a ${descriviOrario(inizio)}.`, azione };
    }
    case "prepara_cancellazione": {
      if (typeof input.id !== "string") return { contenuto: "Dati non validi.", errore: true };
      const esistente = await agenda.leggi(input.id);
      if (!esistente) return { contenuto: "Appuntamento non trovato.", errore: true };
      const azione: Azione = {
        tipo: "cancella",
        id: esistente.id,
        titolo: esistente.titolo,
        inizio: esistente.inizio,
        scade: adesso.getTime() + VALIDITA_MS,
      };
      return { contenuto: `Preparato, in attesa di conferma: cancellare "${esistente.titolo}".`, azione };
    }
    default:
      return { contenuto: `Strumento sconosciuto: ${nome}`, errore: true };
  }
}

/** Converte gli ultimi scambi (solo testo) in messaggi per il modello. */
export function storiaInMessaggi(storia: Scambio[]): BetaMessageParam[] {
  const pulita = storia
    .filter((s) => (s.ruolo === "titolare" || s.ruolo === "assistente") && typeof s.testo === "string" && s.testo.trim())
    .slice(-8)
    .map((s) => ({ role: s.ruolo === "titolare" ? ("user" as const) : ("assistant" as const), content: s.testo.slice(0, 1000) }));
  // La conversazione deve iniziare con il titolare.
  while (pulita.length && pulita[0].role !== "user") pulita.shift();
  // Unisce eventuali messaggi consecutivi dello stesso ruolo.
  const unita: BetaMessageParam[] = [];
  for (const m of pulita) {
    const ultimo = unita[unita.length - 1];
    if (ultimo && ultimo.role === m.role) ultimo.content = `${ultimo.content}\n${m.content}`;
    else unita.push({ ...m });
  }
  return unita;
}

export async function rispondi(testo: string, storia: Scambio[], dip: Dipendenze): Promise<Risposta> {
  const adesso = dip.adesso?.() ?? new Date();
  const messaggi: BetaMessageParam[] = storiaInMessaggi(storia);
  if (messaggi.length && messaggi[messaggi.length - 1].role === "user") messaggi.pop();
  messaggi.push({ role: "user", content: testo.slice(0, 2000) });

  let inAttesa: Azione | undefined;

  for (let giro = 0; giro < MAX_GIRI; giro++) {
    const msg = await dip.modello({
      model: MODELLO,
      max_tokens: 4000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low" },
      system: promptDiSistema(adesso),
      tools: STRUMENTI,
      messages: messaggi,
    });

    if (msg.stop_reason === "refusal") {
      return { risposta: "Non posso aiutarti con questa richiesta." };
    }
    if (msg.stop_reason === "pause_turn") {
      messaggi.push({ role: "assistant", content: msg.content });
      continue;
    }

    const usi = msg.content.filter((b): b is Anthropic.Beta.Messages.BetaToolUseBlock => b.type === "tool_use");
    if (msg.stop_reason !== "tool_use" || usi.length === 0) {
      const risposta = testoDi(msg) || "Scusa, non ho capito. Puoi ripetere?";
      return inAttesa ? { risposta, inAttesa: { azione: inAttesa, firma: firma(inAttesa, dip.segreto) } } : { risposta };
    }

    messaggi.push({ role: "assistant", content: msg.content });
    const risultati: BetaToolResultBlockParam[] = [];
    for (const uso of usi) {
      let esito: EsitoStrumento;
      try {
        esito = await eseguiStrumento(uso.name, (uso.input ?? {}) as Record<string, unknown>, dip, adesso);
      } catch (err) {
        console.error("Errore strumento", uso.name, err);
        esito = { contenuto: "Errore del calendario, riprova più tardi.", errore: true };
      }
      if (esito.azione) inAttesa = esito.azione;
      risultati.push({ type: "tool_result", tool_use_id: uso.id, content: esito.contenuto, is_error: esito.errore });
    }
    messaggi.push({ role: "user", content: risultati });
  }

  return { risposta: "Scusa, la richiesta è troppo complessa. Prova a dirla in modo più semplice." };
}

/** Esegue un'azione confermata dal titolare, dopo averne verificato la firma. */
export async function conferma(azione: Azione, firmaRicevuta: string, dip: Dipendenze): Promise<Risposta> {
  const adesso = dip.adesso?.() ?? new Date();
  if (!verificaFirma(azione, firmaRicevuta, dip.segreto, adesso.getTime())) {
    return { risposta: "La richiesta è scaduta. Ripetila, per favore." };
  }
  if (azione.tipo === "sposta") {
    await dip.agenda.sposta(azione.id, azione.inizio, azione.fine);
    return { risposta: `Fatto. Ho spostato ${azione.titolo} a ${descriviOrario(azione.inizio)}.` };
  }
  await dip.agenda.cancella(azione.id);
  return { risposta: `Fatto. Ho cancellato ${azione.titolo}.` };
}
