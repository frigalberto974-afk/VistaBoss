// Agenda: settimana, appuntamenti del giorno e assistente vocale.
"use strict";

const $ = (id) => document.getElementById(id);
const FUSO = "Europe/Rome";
const stato = { storia: [], inAttesa: null, occupato: false, riconoscimento: null, scelto: null, lunedi: null, impegni: [] };

// ---- Date (sempre nel fuso di Roma) ----
const pad = (n) => String(n).padStart(2, "0");
function oggiLocale() {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: FUSO, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date()).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}
function comeData(g) { const [a, m, d] = g.split("-").map(Number); return new Date(Date.UTC(a, m - 1, d, 12)); }
function giornoIso(d) { return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; }
function aggiungiGiorni(g, n) { const d = comeData(g); d.setUTCDate(d.getUTCDate() + n); return giornoIso(d); }
function lunediDi(g) { const d = comeData(g); const dow = (d.getUTCDay() + 6) % 7; return aggiungiGiorni(g, -dow); }
const fmt = (opz) => new Intl.DateTimeFormat("it-IT", { timeZone: "UTC", ...opz });
const fmtSigla = fmt({ weekday: "short" });
const fmtGiorno = fmt({ weekday: "long", day: "numeric", month: "long" });
const fmtMese = fmt({ month: "long", year: "numeric" });
const ora = (s) => s.slice(11, 16);

// ---- Settimana e appuntamenti ----
async function caricaSettimana() {
  const da = `${stato.lunedi}T00:00:00`;
  const a = `${aggiungiGiorni(stato.lunedi, 7)}T00:00:00`;
  try {
    const r = await fetch(`/api/agenda?da=${encodeURIComponent(da)}&a=${encodeURIComponent(a)}`);
    if (!r.ok) throw new Error(String(r.status));
    stato.impegni = (await r.json()).appuntamenti || [];
    $("errore-elenco").hidden = true;
  } catch {
    stato.impegni = [];
    $("errore-elenco").hidden = false;
  }
  disegna();
}

function disegna() {
  const oggi = oggiLocale();
  $("mese").textContent = fmtMese.format(comeData(stato.scelto));
  const nav = $("settimana");
  nav.innerHTML = "";
  for (let i = 0; i < 7; i++) {
    const g = aggiungiGiorni(stato.lunedi, i);
    const b = document.createElement("button");
    b.className = "giorno";
    if (g === oggi) b.classList.add("oggi");
    if (g === stato.scelto) b.classList.add("scelto");
    if (stato.impegni.some((x) => x.inizio.slice(0, 10) === g)) b.classList.add("con-impegni");
    b.setAttribute("aria-label", fmtGiorno.format(comeData(g)));
    b.innerHTML = `<span class="sigla">${fmtSigla.format(comeData(g)).replace(".", "")}</span><span class="numero">${comeData(g).getUTCDate()}</span><span class="punto"></span>`;
    b.addEventListener("click", () => { stato.scelto = g; disegna(); });
    nav.appendChild(b);
  }

  const etichetta = stato.scelto === oggi ? "Oggi, " : stato.scelto === aggiungiGiorni(oggi, 1) ? "Domani, " : "";
  $("titolo-giorno").textContent = etichetta + fmtGiorno.format(comeData(stato.scelto));

  const delGiorno = stato.impegni
    .filter((x) => x.inizio.slice(0, 10) === stato.scelto)
    .sort((a, b) => (a.tuttoIlGiorno === b.tuttoIlGiorno ? a.inizio.localeCompare(b.inizio) : a.tuttoIlGiorno ? -1 : 1));
  const ul = $("elenco");
  ul.innerHTML = "";
  const adesso = new Date().toLocaleString("sv-SE", { timeZone: FUSO }).replace(" ", "T");
  for (const x of delGiorno) {
    const li = document.createElement("li");
    li.className = "impegno" + (!x.tuttoIlGiorno && x.fine < adesso ? " passato" : "");
    const ore = document.createElement("div");
    ore.className = "ore";
    ore.innerHTML = x.tuttoIlGiorno ? `<div class="inizio">Tutto</div><div class="fine">il giorno</div>` : `<div class="inizio">${ora(x.inizio)}</div><div class="fine">${ora(x.fine)}</div>`;
    const corpo = document.createElement("div");
    const t = document.createElement("p"); t.className = "titolo"; t.textContent = x.titolo; corpo.appendChild(t);
    if (x.luogo) { const l = document.createElement("p"); l.className = "luogo"; l.textContent = "📍 " + x.luogo; corpo.appendChild(l); }
    li.append(ore, corpo);
    ul.appendChild(li);
  }
  $("vuoto").hidden = delGiorno.length > 0 || !$("errore-elenco").hidden;
}

function vaiA(giorno) {
  stato.scelto = giorno;
  const nuovoLunedi = lunediDi(giorno);
  if (nuovoLunedi !== stato.lunedi) { stato.lunedi = nuovoLunedi; caricaSettimana(); } else disegna();
}

// ---- Voce in uscita ----
function voceItaliana() {
  const voci = window.speechSynthesis ? speechSynthesis.getVoices() : [];
  return voci.find((v) => v.lang === "it-IT" && v.localService) || voci.find((v) => v.lang && v.lang.startsWith("it")) || null;
}
function parla(testo) {
  if (!window.speechSynthesis) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(testo);
  u.lang = "it-IT";
  const v = voceItaliana();
  if (v) u.voice = v;
  speechSynthesis.speak(u);
}
let voceSbloccata = false;
function sbloccaVoce() {
  if (voceSbloccata || !window.speechSynthesis) return;
  speechSynthesis.speak(new SpeechSynthesisUtterance(""));
  voceSbloccata = true;
}

// ---- Assistente ----
function impostaStato(testo, classe) {
  $("stato").textContent = testo;
  $("microfono").className = "microfono" + (classe ? " " + classe : "");
}
function aggiungiStoria(ruolo, testo) {
  stato.storia.push({ ruolo, testo });
  stato.storia = stato.storia.slice(-8);
}
async function chiama(corpo) {
  const r = await fetch("/api/assistente", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
  return r.json();
}
function mostraRisposta(dati) {
  const testo = dati.risposta || dati.errore || "Qualcosa non ha funzionato.";
  $("fumetto").hidden = false;
  $("risposta").textContent = testo;
  aggiungiStoria("assistente", testo);
  stato.inAttesa = dati.inAttesa || null;
  $("conferma").hidden = !stato.inAttesa;
  parla(testo);
}

const SI = /^(s[iì]|confermo|conferma|ok|okay|va bene|certo|esatto|procedi|fallo)(?=$|[\s,.!])/i;
const NO = /^(no|annulla|lascia stare|niente|non farlo|fermo)(?=$|[\s,.!])/i;

async function invia(testo) {
  testo = testo.trim();
  if (!testo || stato.occupato) return;
  stato.occupato = true;
  $("fumetto").hidden = false;
  $("detto").textContent = "«" + testo + "»";
  $("risposta").textContent = "…";
  $("conferma").hidden = true;
  impostaStato("Sto pensando…", "attesa");
  try {
    if (stato.inAttesa && SI.test(testo)) {
      const azione = stato.inAttesa;
      stato.inAttesa = null;
      aggiungiStoria("titolare", testo);
      mostraRisposta(await chiama({ conferma: azione }));
    } else if (stato.inAttesa && NO.test(testo)) {
      stato.inAttesa = null;
      aggiungiStoria("titolare", testo);
      mostraRisposta({ risposta: "Va bene, non faccio niente." });
    } else {
      stato.inAttesa = null;
      const storia = stato.storia.slice();
      aggiungiStoria("titolare", testo);
      mostraRisposta(await chiama({ testo, storia }));
    }
    caricaSettimana();
  } catch {
    mostraRisposta({ risposta: "Non riesco a collegarmi. Controlla la connessione e riprova." });
  } finally {
    stato.occupato = false;
    impostaStato("Tocca e parla");
  }
}

// ---- Microfono ----
const Riconoscimento = window.SpeechRecognition || window.webkitSpeechRecognition;

function mostraTastiera(attiva) {
  $("form-testo").hidden = !attiva;
  if (attiva) $("testo").focus();
}

function ascolta() {
  sbloccaVoce();
  if (stato.occupato) return;
  if (stato.riconoscimento) { stato.riconoscimento.stop(); return; }
  if (!Riconoscimento) {
    mostraTastiera(true);
    impostaStato("Usa il microfono della tastiera per dettare");
    return;
  }
  if (window.speechSynthesis) speechSynthesis.cancel();
  const r = new Riconoscimento();
  r.lang = "it-IT";
  r.interimResults = true;
  r.continuous = false;
  let finale = "", ultimo = "";
  r.onresult = (e) => {
    let parziale = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (e.results[i].isFinal) finale += e.results[i][0].transcript;
      else parziale += e.results[i][0].transcript;
    }
    ultimo = (finale + " " + parziale).trim();
    $("fumetto").hidden = false;
    $("detto").textContent = ultimo;
    $("risposta").textContent = "";
    $("conferma").hidden = true;
  };
  r.onerror = (e) => {
    if (e.error === "not-allowed" || e.error === "service-not-allowed") {
      mostraRisposta({ risposta: "Il microfono non è autorizzato. Consenti l'accesso al microfono nelle impostazioni di Safari, oppure scrivi." });
      mostraTastiera(true);
    }
  };
  r.onend = () => {
    stato.riconoscimento = null;
    impostaStato("Tocca e parla");
    const testo = (finale || ultimo).trim();
    if (testo) invia(testo);
  };
  stato.riconoscimento = r;
  impostaStato("Ti ascolto… tocca di nuovo per finire", "ascolto");
  r.start();
}

// ---- Avvio ----
$("microfono").addEventListener("click", ascolta);
$("tastiera").addEventListener("click", () => mostraTastiera($("form-testo").hidden));
$("si").addEventListener("click", () => { sbloccaVoce(); invia("sì"); });
$("no").addEventListener("click", () => { sbloccaVoce(); invia("no"); });
$("chiudi-fumetto").addEventListener("click", () => { $("fumetto").hidden = true; stato.inAttesa = null; if (window.speechSynthesis) speechSynthesis.cancel(); });
$("form-testo").addEventListener("submit", (e) => {
  e.preventDefault();
  sbloccaVoce();
  const t = $("testo").value;
  $("testo").value = "";
  $("testo").blur();
  mostraTastiera(false);
  invia(t);
});
$("oggi").addEventListener("click", () => vaiA(oggiLocale()));
$("settimana-prec").addEventListener("click", () => vaiA(aggiungiGiorni(stato.scelto, -7)));
$("settimana-succ").addEventListener("click", () => vaiA(aggiungiGiorni(stato.scelto, 7)));
document.addEventListener("visibilitychange", () => { if (!document.hidden) caricaSettimana(); });
if (window.speechSynthesis) speechSynthesis.onvoiceschanged = () => voceItaliana();

stato.scelto = oggiLocale();
stato.lunedi = lunediDi(stato.scelto);
caricaSettimana();
