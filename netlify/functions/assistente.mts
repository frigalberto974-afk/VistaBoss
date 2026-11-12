// Endpoint unico dell'app: POST /api/assistente
// Corpo: { testo, storia } per una nuova frase, oppure { conferma: { azione, firma } }.
// Accesso senza PIN, per scelta del proprietario: chi conosce l'indirizzo può usare l'agenda.

import Anthropic from "@anthropic-ai/sdk";
import type { Config } from "@netlify/functions";
import { AgendaGoogle } from "../../src/agenda.js";
import { conferma, rispondi, type Dipendenze, type Scambio } from "../../src/assistente.js";
import type { Azione } from "../../src/firma.js";
import { coseDa } from "../../src/servizi.js";

function json(dati: unknown, status = 200): Response {
  return new Response(JSON.stringify(dati), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function variabile(nome: string): string {
  const v = Netlify.env.get(nome)?.trim();
  if (!v) throw new Error(`Variabile d'ambiente mancante: ${nome}`);
  return v;
}

let dipendenze: Dipendenze | undefined;
function prepara(): Dipendenze {
  if (!dipendenze) {
    const client = new Anthropic({ apiKey: variabile("ANTHROPIC_API_KEY"), timeout: 50_000, maxRetries: 1 });
    dipendenze = {
      modello: (params) => client.beta.messages.create(params),
      agenda: new AgendaGoogle(
        variabile("GOOGLE_SA_EMAIL"),
        variabile("GOOGLE_SA_PRIVATE_KEY"),
        variabile("GOOGLE_CALENDAR_ID"),
      ),
      cose: coseDa(),
      segreto: variabile("APP_SECRET"),
    };
  }
  return dipendenze;
}

export default async (req: Request): Promise<Response> => {
  if (req.method !== "POST") return json({ errore: "Metodo non consentito" }, 405);

  let corpo: { testo?: unknown; storia?: unknown; conferma?: { azione?: Azione; firma?: string } };
  try {
    corpo = await req.json();
  } catch {
    return json({ errore: "Richiesta non valida" }, 400);
  }

  try {
    const dip = prepara();
    if (corpo.conferma?.azione && typeof corpo.conferma.firma === "string") {
      return json(await conferma(corpo.conferma.azione, corpo.conferma.firma, dip));
    }
    if (typeof corpo.testo !== "string" || !corpo.testo.trim()) {
      return json({ errore: "Testo mancante" }, 400);
    }
    const storia = Array.isArray(corpo.storia) ? (corpo.storia as Scambio[]) : [];
    return json(await rispondi(corpo.testo, storia, dip));
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      console.error("Errore Anthropic", err.status, err.requestID, (err.error as { error?: { type?: string } })?.error?.type);
    } else {
      console.error(err);
    }
    if (err instanceof Anthropic.AuthenticationError) {
      return json({ risposta: "La chiave dell'intelligenza artificiale non è valida. Avvisa chi gestisce l'app." });
    }
    if (err instanceof Anthropic.RateLimitError) {
      return json({ risposta: "Sono un po' sovraccarico. Riprova tra un minuto." });
    }
    if (err instanceof Anthropic.APIError && err.status === 400 && /credit/i.test(err.message)) {
      return json({ risposta: "Il credito dell'intelligenza artificiale è finito. Avvisa chi gestisce l'app." });
    }
    return json({ risposta: "Qualcosa non ha funzionato. Riprova tra poco." });
  }
};

export const config: Config = { path: "/api/assistente" };
