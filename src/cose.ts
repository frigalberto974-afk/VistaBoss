// "Cose da fare": promemoria senza orario ("ricordami di chiamare Bianchi").
// Su Netlify Blobs ogni cosa è una chiave a sé: niente letture-modifiche-scritture su una chiave condivisa.

import { getStore } from "@netlify/blobs";
import { randomUUID } from "node:crypto";

export interface Cosa {
  id: string;
  testo: string;
  creata: string; // ISO
  fatta: boolean;
}

export interface ArchivioCose {
  elenca(): Promise<Cosa[]>;
  aggiungi(testo: string): Promise<Cosa>;
  completa(id: string): Promise<Cosa | null>;
}

export class CoseBlobs implements ArchivioCose {
  private store = getStore({ name: "cose-da-fare", consistency: "strong" });

  async elenca(): Promise<Cosa[]> {
    const { blobs } = await this.store.list();
    const tutte = await Promise.all(blobs.map((b) => this.store.get(b.key, { type: "json" }) as Promise<Cosa | null>));
    return tutte.filter((c): c is Cosa => Boolean(c)).sort((a, b) => a.creata.localeCompare(b.creata));
  }

  async aggiungi(testo: string): Promise<Cosa> {
    const cosa: Cosa = { id: randomUUID(), testo: testo.trim().slice(0, 300), creata: new Date().toISOString(), fatta: false };
    await this.store.setJSON(cosa.id, cosa);
    return cosa;
  }

  async completa(id: string): Promise<Cosa | null> {
    if (!/^[0-9a-f-]{36}$/.test(id)) return null;
    const cosa = (await this.store.get(id, { type: "json" })) as Cosa | null;
    if (!cosa) return null;
    // Le cose fatte vengono rimosse: la lista resta corta e leggibile.
    await this.store.delete(id);
    return { ...cosa, fatta: true };
  }
}
