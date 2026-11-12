// Accesso al calendario. L'interfaccia Agenda separa la logica dell'assistente
// dal fornitore (oggi Google Calendar), così i test usano un'agenda in memoria.

import { calendar, auth, type calendar_v3 } from "@googleapis/calendar";
import { FUSO, istanteALocale, localeARfc3339 } from "./tempo.js";

export interface Appuntamento {
  id: string;
  titolo: string;
  /** Orario locale AAAA-MM-GGTHH:MM:SS, oppure AAAA-MM-GG per gli eventi di tutto il giorno. */
  inizio: string;
  fine: string;
  tuttoIlGiorno: boolean;
  luogo?: string;
  note?: string;
}

export interface NuovoAppuntamento {
  titolo: string;
  inizio: string;
  fine: string;
  luogo?: string;
  note?: string;
  promemoriaMinuti: number;
}

export interface Agenda {
  elenca(da: string, a: string): Promise<Appuntamento[]>;
  leggi(id: string): Promise<Appuntamento | null>;
  crea(dati: NuovoAppuntamento): Promise<Appuntamento>;
  sposta(id: string, inizio: string, fine: string): Promise<Appuntamento>;
  cancella(id: string): Promise<void>;
}

function daEventoGoogle(e: calendar_v3.Schema$Event): Appuntamento {
  const tuttoIlGiorno = Boolean(e.start?.date);
  const conv = (t?: calendar_v3.Schema$EventDateTime) =>
    t?.date ?? (t?.dateTime ? istanteALocale(new Date(t.dateTime)) : "");
  return {
    id: e.id ?? "",
    titolo: e.summary ?? "(senza titolo)",
    inizio: conv(e.start),
    fine: conv(e.end),
    tuttoIlGiorno,
    luogo: e.location ?? undefined,
    note: e.description ?? undefined,
  };
}

/**
 * Agenda su Google Calendar tramite account di servizio.
 * Il calendario del titolare va condiviso con l'email dell'account di servizio
 * con il permesso "Apportare modifiche agli eventi".
 */
export class AgendaGoogle implements Agenda {
  private api: calendar_v3.Calendar;

  constructor(credenzialiJson: string, private calendarId: string) {
    const credenziali = JSON.parse(credenzialiJson) as { client_email: string; private_key: string };
    const client = new auth.JWT({
      email: credenziali.client_email,
      key: credenziali.private_key,
      scopes: ["https://www.googleapis.com/auth/calendar.events"],
    });
    this.api = calendar({ version: "v3", auth: client });
  }

  async elenca(da: string, a: string): Promise<Appuntamento[]> {
    const res = await this.api.events.list({
      calendarId: this.calendarId,
      timeMin: localeARfc3339(da),
      timeMax: localeARfc3339(a),
      singleEvents: true,
      orderBy: "startTime",
      timeZone: FUSO,
      maxResults: 100,
    });
    return (res.data.items ?? []).filter((e) => e.status !== "cancelled").map(daEventoGoogle);
  }

  async leggi(id: string): Promise<Appuntamento | null> {
    try {
      const res = await this.api.events.get({ calendarId: this.calendarId, eventId: id, timeZone: FUSO });
      if (res.data.status === "cancelled") return null;
      return daEventoGoogle(res.data);
    } catch (err) {
      const codice = (err as { code?: number }).code;
      if (codice === 404 || codice === 410) return null;
      throw err;
    }
  }

  async crea(d: NuovoAppuntamento): Promise<Appuntamento> {
    const res = await this.api.events.insert({
      calendarId: this.calendarId,
      requestBody: {
        summary: d.titolo,
        location: d.luogo,
        description: d.note,
        start: { dateTime: d.inizio, timeZone: FUSO },
        end: { dateTime: d.fine, timeZone: FUSO },
        reminders: { useDefault: false, overrides: [{ method: "popup", minutes: d.promemoriaMinuti }] },
      },
    });
    return daEventoGoogle(res.data);
  }

  async sposta(id: string, inizio: string, fine: string): Promise<Appuntamento> {
    const res = await this.api.events.patch({
      calendarId: this.calendarId,
      eventId: id,
      requestBody: {
        start: { dateTime: inizio, timeZone: FUSO },
        end: { dateTime: fine, timeZone: FUSO },
      },
    });
    return daEventoGoogle(res.data);
  }

  async cancella(id: string): Promise<void> {
    await this.api.events.delete({ calendarId: this.calendarId, eventId: id });
  }
}
