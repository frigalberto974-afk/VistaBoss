// Agenda: segretario robot, settimana, appuntamenti del giorno, cose da fare.
import { creaRobot } from "./robot.js";

const $ = (id) => document.getElementById(id);
const FUSO = "Europe/Rome";
const stato = { storia: [], inAttesa: null, occupato: false, riconoscimento: null, scelto: null, lunedi: null, impegni: [], cose: [], ultimaRisposta: "" };
let robot = { imposta() {}, parla() {}, parola() {} };
try { robot = creaRobot($("robot")); } catch (err) { console.error("Robot non disponibile", err); }

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
  $("vuoto").textContent = stato.scelto === oggi ? "Nessun appuntamento oggi" : stato.scelto === aggiungiGiorni(oggi, 1) ? "Nessun appuntamento domani" : "Nessun appuntamento";
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
  u.onstart = () => robot.parla(true);
  u.onboundary = () => robot.parola();
  u.onend = u.onerror = () => robot.parla(false);
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
  robot.imposta(classe === "ascolto" ? "ascolto" : classe === "attesa" ? "pensa" : "riposo");
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
  $("detto").textContent = ""; // la trascrizione sparisce quando arriva la risposta
  $("risposta").textContent = testo;
  stato.ultimaRisposta = testo;
  $("ascolta-risposta").hidden = true;
  if (/^(Fatto|Segnat|Aggiunt|Bene)/.test(testo)) robot.imposta("contento");
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
    caricaCose();
  } catch {
    mostraRisposta({ risposta: "Non riesco a collegarmi. Controlla la connessione e riprova." });
  } finally {
    stato.occupato = false;
    impostaStato("Tocca e parla");
  }
}

// ---- Microfono ----
const Riconoscimento = window.SpeechRecognition || window.webkitSpeechRecognition;
const standalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;

function mostraTastiera(attiva) {
  $("form-testo").hidden = !attiva;
  if (attiva) $("testo").focus();
}

// Su iPhone, nelle app aggiunte alla schermata Home, il riconoscimento vocale del browser non funziona:
// si usa la dettatura della tastiera (gratuita), con invio automatico quando il capo smette di parlare.
const iPhone = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const usaDettatura = !Riconoscimento || (iPhone && standalone);
let timerInvio = null;

function avviaDettatura() {
  mostraTastiera(true); // il focus nel tocco apre subito la tastiera
  $("detto").textContent = "";
  $("risposta").textContent = "Tocca il microfono 🎤 della tastiera e parla. Invio da solo quando hai finito.";
  $("conferma").hidden = true;
  robot.imposta("ascolto");
}
$("testo").addEventListener("input", () => {
  clearTimeout(timerInvio);
  const t = $("testo").value.trim();
  $("detto").textContent = t;
  if (!t) return;
  // Invio automatico dopo 2,5 secondi senza nuove parole.
  timerInvio = setTimeout(() => {
    const testo = $("testo").value.trim();
    if (!testo) return;
    $("testo").value = "";
    $("testo").blur();
    mostraTastiera(false);
    invia(testo);
  }, 2500);
});

function ascolta() {
  sbloccaVoce();
  if (stato.occupato) return;
  if (stato.riconoscimento) { stato.riconoscimento.stop(); return; }
  if (usaDettatura) { avviaDettatura(); return; }
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
  impostaStato("Ti ascolto…", "ascolto");
  // Se entro 6 secondi non arriva nessuna parola, si smette di ascoltare (il tasto non resta rosso).
  const controllo = setTimeout(() => { if (stato.riconoscimento === r && !ultimo) { r.abort(); avviaDettatura(); } }, 6000);
  r.addEventListener("end", () => clearTimeout(controllo));
  try { r.start(); } catch { stato.riconoscimento = null; impostaStato("Tocca e parla"); avviaDettatura(); }
}

// ---- Cose da fare ----
async function caricaCose() {
  try {
    const r = await fetch("/api/cose");
    if (!r.ok) throw new Error(String(r.status));
    stato.cose = (await r.json()).cose || [];
  } catch { stato.cose = []; }
  disegnaCose();
}
function disegnaCose() {
  const ul = $("cose");
  ul.innerHTML = "";
  for (const c of stato.cose) {
    const li = document.createElement("li");
    li.className = "cosa";
    const b = document.createElement("button");
    b.className = "spunta";
    b.setAttribute("aria-label", "Segna come fatta: " + c.testo);
    b.addEventListener("click", async () => {
      li.classList.add("fatta");
      try { await fetch("/api/cose", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ azione: "completa", id: c.id }) }); } catch { /* ricaricata sotto */ }
      robot.imposta("contento");
      setTimeout(caricaCose, 400);
    });
    const t = document.createElement("span");
    t.className = "testo";
    t.textContent = c.testo;
    li.append(b, t);
    ul.appendChild(li);
  }
  $("cose-vuoto").hidden = stato.cose.length > 0;
}

// ---- Riepilogo all'apertura ----
async function riepilogoIniziale() {
  robot.imposta("pensa");
  try {
    const r = await fetch("/api/riepilogo");
    const { testo } = await r.json();
    $("risposta").textContent = testo;
    stato.ultimaRisposta = testo;
    aggiungiStoria("assistente", testo);
    // Safari permette la voce solo dopo un tocco: offriamo il tasto "Ascolta".
    $("ascolta-risposta").hidden = false;
  } catch { $("risposta").textContent = "Ciao! Tocca me o il microfono e dimmi cosa ti serve."; }
  robot.imposta("riposo");
}

// ---- Notifiche push ----
const pushSupportato = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

function base64InUint8(b64) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}
async function preparaNotifiche() {
  if (!("serviceWorker" in navigator)) return;
  try { await navigator.serviceWorker.register("/sw.js"); } catch { return; }
  if (!pushSupportato) { $("aiuto-notifiche").hidden = standalone; return; }
  if (Notification.permission === "granted") { await iscrivi(); return; }
  if (Notification.permission === "default") $("attiva-notifiche").hidden = false;
}
async function iscrivi() {
  const reg = await navigator.serviceWorker.ready;
  let iscr = await reg.pushManager.getSubscription();
  if (!iscr) {
    const { chiavePubblica } = await (await fetch("/api/iscrizione")).json();
    iscr = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64InUint8(chiavePubblica) });
  }
  await fetch("/api/iscrizione", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(iscr) });
}
async function attivaNotifiche() {
  sbloccaVoce();
  const esito = await Notification.requestPermission();
  $("attiva-notifiche").hidden = true;
  if (esito === "granted") {
    try { await iscrivi(); mostraRisposta({ risposta: "Perfetto. Ti avviserò alle 8 con il riepilogo, mezz'ora prima di ogni appuntamento e alle 17 per le cose da fare." }); }
    catch { mostraRisposta({ risposta: "Non sono riuscito ad attivare i promemoria. Riprova più tardi." }); }
  } else {
    mostraRisposta({ risposta: "Va bene, niente promemoria. Puoi attivarli dalle impostazioni del telefono." });
  }
}

// ---- Data e ora di oggi sotto il titolo ----
const fmtData = new Intl.DateTimeFormat("it-IT", { timeZone: FUSO, weekday: "long", day: "numeric", month: "long", year: "numeric" });
const fmtOra = new Intl.DateTimeFormat("it-IT", { timeZone: FUSO, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
function aggiornaOrologio() {
  const d = new Date();
  $("adesso").textContent = `${fmtData.format(d)} · ${fmtOra.format(d)}`;
}
aggiornaOrologio();
setInterval(aggiornaOrologio, 15_000);

// ---- Avvio ----
$("microfono").addEventListener("click", ascolta);
$("si").addEventListener("click", () => { sbloccaVoce(); invia("sì"); });
$("no").addEventListener("click", () => { sbloccaVoce(); invia("no"); });
$("robot").addEventListener("click", ascolta);
$("robot").addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); ascolta(); } });
$("ascolta-risposta").addEventListener("click", () => { sbloccaVoce(); $("ascolta-risposta").hidden = true; parla(stato.ultimaRisposta); });
$("attiva-notifiche").addEventListener("click", attivaNotifiche);
$("form-testo").addEventListener("submit", (e) => {
  e.preventDefault();
  clearTimeout(timerInvio);
  sbloccaVoce();
  const t = $("testo").value;
  $("testo").value = "";
  $("testo").blur();
  mostraTastiera(false);
  invia(t);
});
// Scorrendo la settimana a destra o a sinistra si cambia settimana.
let inizioTocco = null;
$("settimana").addEventListener("touchstart", (e) => { inizioTocco = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }, { passive: true });
$("settimana").addEventListener("touchend", (e) => {
  if (!inizioTocco) return;
  const dx = e.changedTouches[0].clientX - inizioTocco.x, dy = e.changedTouches[0].clientY - inizioTocco.y;
  inizioTocco = null;
  if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) vaiA(aggiungiGiorni(stato.scelto, dx < 0 ? 7 : -7));
});
// Solo microfono: la casella compare quando si tocca "Tocca e parla" e serve alla dettatura.
document.addEventListener("visibilitychange", () => { if (!document.hidden) { caricaSettimana(); caricaCose(); } });
if (window.speechSynthesis) speechSynthesis.onvoiceschanged = () => voceItaliana();

stato.scelto = oggiLocale();
stato.lunedi = lunediDi(stato.scelto);
caricaSettimana();
caricaCose();
riepilogoIniziale();
preparaNotifiche();
