// Registrazione dal microfono e trascrizione con Whisper nel worker.
// Si ferma da sola dopo 1,2 secondi di silenzio (o dopo 15 secondi, o toccando di nuovo).

const worker = new Worker(new URL("./voce-worker.js", import.meta.url), { type: "module" });
const attese = new Map();
let prossimoId = 1;
const ascoltatori = { progresso: () => {}, pronto: () => {} };
let pronto = false;

// Se il worker si blocca o va in errore, nessuna richiesta resta appesa.
worker.onerror = (e) => {
  for (const [id, p] of attese) { attese.delete(id); p.rifiuta(new Error(e.message || "errore motore vocale")); }
};

worker.onmessage = (e) => {
  const m = e.data;
  if (m.tipo === "progresso") ascoltatori.progresso(m);
  else if (m.tipo === "pronto") { pronto = true; ascoltatori.pronto(); }
  else if (m.tipo === "testo" || m.tipo === "errore") {
    const p = attese.get(m.id);
    if (!p) return;
    attese.delete(m.id);
    m.tipo === "testo" ? p.risolvi(m.testo) : p.rifiuta(new Error(m.messaggio));
  }
};

export function preparaVoce(callbacks) {
  Object.assign(ascoltatori, callbacks);
  worker.postMessage({ tipo: "carica" });
}
export const vocePronta = () => pronto;

function trascrivi(audio16k) {
  const id = prossimoId++;
  return new Promise((risolvi, rifiuta) => {
    const scadenza = setTimeout(() => { if (attese.delete(id)) rifiuta(new Error("tempo scaduto")); }, 60_000);
    attese.set(id, { risolvi: (t) => { clearTimeout(scadenza); risolvi(t); }, rifiuta: (e) => { clearTimeout(scadenza); rifiuta(e); } });
    worker.postMessage({ tipo: "trascrivi", id, audio: audio16k }, [audio16k.buffer]);
  });
}

async function a16k(campioni, frequenza) {
  if (frequenza === 16000) return campioni;
  const durata = Math.max(1, Math.ceil((campioni.length * 16000) / frequenza));
  const off = new OfflineAudioContext(1, durata, 16000);
  const buf = off.createBuffer(1, campioni.length, frequenza);
  buf.copyToChannel(campioni, 0);
  const src = off.createBufferSource();
  src.buffer = buf;
  src.connect(off.destination);
  src.start();
  return (await off.startRendering()).getChannelData(0).slice();
}

let registrazione = null;

/** Avvia l'ascolto. Va chiamata direttamente dal tocco dell'utente. Restituisce il testo trascritto. */
export function registra({ quandoParla, quandoFinisce } = {}) {
  if (registrazione) { registrazione.ferma(); return registrazione.promessa; }
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  let ferma;
  const promessa = (async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } });
    await ctx.resume();
    const sorgente = ctx.createMediaStreamSource(stream);
    const proc = ctx.createScriptProcessor(4096, 1, 1);
    const pezzi = [];
    let parlato = false, ultimoSuono = performance.now();
    const inizio = performance.now();
    await new Promise((fine) => {
      ferma = fine;
      proc.onaudioprocess = (ev) => {
        const d = ev.inputBuffer.getChannelData(0);
        pezzi.push(new Float32Array(d));
        let s = 0;
        for (let i = 0; i < d.length; i++) s += d[i] * d[i];
        const rms = Math.sqrt(s / d.length);
        const ora = performance.now();
        if (rms > 0.02) { if (!parlato) quandoParla?.(); parlato = true; ultimoSuono = ora; }
        if ((parlato && ora - ultimoSuono > 1200) || ora - inizio > 15000 || (!parlato && ora - inizio > 7000)) fine();
      };
      sorgente.connect(proc);
      proc.connect(ctx.destination);
    });
    proc.disconnect();
    sorgente.disconnect();
    stream.getTracks().forEach((t) => t.stop());
    const tot = pezzi.reduce((n, p) => n + p.length, 0);
    const tutto = new Float32Array(tot);
    let o = 0;
    for (const p of pezzi) { tutto.set(p, o); o += p.length; }
    const frequenza = ctx.sampleRate;
    await ctx.close();
    if (!parlato) return "";
    quandoFinisce?.();
    return trascrivi(await a16k(tutto, frequenza));
  })();
  registrazione = { promessa, ferma: () => ferma?.() };
  promessa.finally(() => { registrazione = null; }).catch(() => {});
  return promessa;
}
