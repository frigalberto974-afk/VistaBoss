// Agenda: segretario robot, settimana, appuntamenti del giorno, cose da fare.
import { creaRobot } from "./robot.js?v=20261113g";
import { preparaVoce, registra, vocePronta } from "./voce.js?v=20261113g";

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
    const cestino = document.createElement("button");
    cestino.className = "cestino";
    cestino.setAttribute("aria-label", "Cancella " + x.titolo);
    cestino.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6l1 2h4v2H4V5h4l1-2Zm-3 6h12l-1 12H7L6 9Zm4 2v8h2v-8h-2Zm4 0v8h2v-8h-2Z"/></svg>';
    cestino.addEventListener("click", async () => {
      sbloccaVoce();
      if (!confirm(`Cancellare «${x.titolo}»?`)) return;
      li.classList.add("passato");
      try {
        const r = await fetch(`/api/agenda?id=${encodeURIComponent(x.id)}`, { method: "DELETE" });
        if (!r.ok) throw new Error(String(r.status));
        robot.imposta("contento");
      } catch {
        mostraRisposta({ risposta: "Non sono riuscito a cancellarlo. Riprova." });
      }
      caricaSettimana();
    });
    li.append(ore, corpo, cestino);
    ul.appendChild(li);
  }
  $("vuoto").textContent = stato.scelto === oggi ? "Nessun impegno oggi" : stato.scelto === aggiungiGiorni(oggi, 1) ? "Nessun impegno domani" : "Nessun impegno";
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
// Su iPhone la voce in uscita blocca il microfono di Safari per gli ascolti successivi (difetto WebKit):
// lì il robot risponde solo per iscritto.
const iOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
function parla(testo) {
  if (iOS) return;
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
  clearTimeout(stato.timerPulizia);
  if (/^(Fatto|Segnat|Aggiunt|Bene)/.test(testo)) {
    robot.imposta("contento");
    // Annotato in agenda: il fumetto si svuota dopo qualche secondo.
    stato.timerPulizia = setTimeout(() => {
      if (!stato.occupato && !stato.inAttesa) { $("risposta").textContent = ""; $("detto").textContent = ""; $("ascolta-risposta").hidden = true; }
    }, 4000);
  }
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
  } catch {
    mostraRisposta({ risposta: "Non riesco a collegarmi. Controlla la connessione e riprova." });
  } finally {
    stato.occupato = false;
    impostaStato("");
  }
}

// ---- Microfono ----
const Riconoscimento = window.SpeechRecognition || window.webkitSpeechRecognition;
const standalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;

function mostraTastiera(attiva) {
  $("form-testo").hidden = !attiva;
  if (attiva) $("testo").focus();
}

// Prima si prova l'ascolto diretto (un solo tocco). Se su questo telefono non restituisce parole,
// lo si ricorda e dal tocco successivo si usa la dettatura della tastiera (gratuita).
// Nota iPhone: nessun suono deve partire subito prima dell'ascolto, altrimenti iOS lo blocca.
const CHIAVE_DETTATURA = "promemoria.dettatura";
// Non si ricorda più nessun errore: in Safari si prova sempre ad ascoltare. Si cancella quanto salvato prima.
try { localStorage.removeItem(CHIAVE_DETTATURA); } catch { /* memoria non disponibile */ }

const MOTIVI = {
  "not-allowed": "Il microfono non è autorizzato per Safari.",
  "service-not-allowed": "Il riconoscimento vocale non è autorizzato su questo telefono.",
  "audio-capture": "Non riesco a usare il microfono: forse è occupato da un'altra app.",
  network: "Serve la connessione a internet per capirti.",
  "no-speech": "Non ti ho sentito.",
};
function erroreAscolto(codice) {
  robot.imposta("riposo");
  $("risposta").textContent = (MOTIVI[codice] || "Non ti ho sentito.") + " Riprova.";
}
let timerInvio = null;

function avviaDettatura() {
  mostraTastiera(true); // il focus nel tocco apre subito la tastiera
  $("detto").textContent = "";
  $("risposta").textContent = "";
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

// Indirizzo di prova: si mostra solo cosa è stato capito, senza segnare niente in agenda.
const modoProva = location.hostname.includes("--");
let inAscoltoTelefono = false;

// iPhone: il riconoscimento vocale di Safari non restituisce parole, quindi la voce viene
// registrata e trascritta sul telefono (Whisper). Un solo tocco, gratis.
async function ascoltaSulTelefono() {
  if (inAscoltoTelefono) { registra(); return; } // secondo tocco: smette di ascoltare
  if (stato.occupato) return;
  if (!vocePronta()) { $("risposta").textContent = "Un momento, sto preparando il microfono."; return; }
  inAscoltoTelefono = true;
  $("detto").textContent = "";
  $("conferma").hidden = true;
  impostaStato("Ti ascolto…", "ascolto");
  let testo = "";
  try {
    testo = await registra({ quandoFinisce: () => impostaStato("Sto capendo…", "attesa") });
  } catch (err) {
    inAscoltoTelefono = false;
    impostaStato("");
    const negato = err && (err.name === "NotAllowedError" || err.name === "SecurityError");
    erroreAscolto(negato ? "not-allowed" : "sconosciuto");
    return;
  }
  inAscoltoTelefono = false;
  impostaStato("");
  if (!testo) { erroreAscolto("no-speech"); return; }
  if (modoProva) { $("detto").textContent = ""; $("risposta").textContent = `Ho capito: «${testo}»`; robot.imposta("contento"); return; }
  invia(testo);
}

function ascolta() {
  if (iOS) { ascoltaSulTelefono(); return; }
  if (stato.occupato) return;
  if (stato.riconoscimento) { stato.riconoscimento.stop(); return; }
  // App installata sulla Home (iPhone): l'ascolto diretto non funziona, si usa subito la dettatura.
  if (!Riconoscimento || standalone) { sbloccaVoce(); avviaDettatura(); return; }
  const r = new Riconoscimento();
  r.lang = "it-IT";
  r.interimResults = true;
  r.continuous = true; // resta aperto mentre il capo parla; si chiude dopo una pausa
  let timerPausa = null;
  const chiudiDopoPausa = () => { clearTimeout(timerPausa); timerPausa = setTimeout(() => { try { r.stop(); } catch { /* già fermo */ } }, 1500); };
  let finale = "", ultimo = "";
  r.onresult = (e) => {
    let parziale = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (e.results[i].isFinal) finale += e.results[i][0].transcript;
      else parziale += e.results[i][0].transcript;
    }
    ultimo = (finale + " " + parziale).trim();
    chiudiDopoPausa();
    $("detto").textContent = ultimo;
    $("risposta").textContent = "";
    $("conferma").hidden = true;
  };
  let codiceErrore = "";
  r.onerror = (e) => { if (e.error !== "aborted") codiceErrore = e.error || "sconosciuto"; };
  r.onend = () => {
    stato.riconoscimento = null;
    impostaStato("");
    const testo = (finale || ultimo).trim();
    if (testo) { invia(testo); return; }
    erroreAscolto(codiceErrore || "no-speech");
  };
  stato.riconoscimento = r;
  impostaStato("Ti ascolto…", "ascolto");
  // Se entro 8 secondi non arriva nessuna parola, si smette di ascoltare: il tasto non resta rosso.
  const controllo = setTimeout(() => {
    if (stato.riconoscimento === r && !ultimo) { try { r.stop(); } catch { /* già fermo */ } }
  }, 8000);
  const limite = setTimeout(() => { try { r.stop(); } catch { /* già fermo */ } }, 20000);
  r.addEventListener("end", () => { clearTimeout(controllo); clearTimeout(limite); clearTimeout(timerPausa); });
  try { r.start(); } catch (err) { clearTimeout(controllo); stato.riconoscimento = null; impostaStato(""); erroreAscolto(err && err.name === "NotAllowedError" ? "not-allowed" : "sconosciuto"); }
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
    $("ascolta-risposta").hidden = iOS;
  } catch { $("risposta").textContent = ""; }
  robot.imposta("riposo");
}

// ---- Notifiche push ----
const pushSupportato = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

function base64InUint8(b64) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}
function aggiornaCampanella() {
  const attive = pushSupportato && Notification.permission === "granted";
  $("campanella").classList.toggle("attiva", attive);
}
async function preparaNotifiche() {
  aggiornaCampanella();
  if (!("serviceWorker" in navigator)) return;
  try { await navigator.serviceWorker.register("/sw.js"); } catch { return; }
  if (pushSupportato && Notification.permission === "granted") { try { await iscrivi(); } catch { /* si riprova dalla campanella */ } }
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
// Campanella: attiva le notifiche (o conferma che sono attive).
async function attivaNotifiche() {
  if (!pushSupportato) {
    mostraRisposta({ risposta: "Le notifiche funzionano solo aprendo Promemoria dall'icona sulla schermata Home." });
    return;
  }
  if (Notification.permission === "denied") {
    mostraRisposta({ risposta: "Le notifiche sono bloccate: Impostazioni, Notifiche, Promemoria, Consenti notifiche." });
    return;
  }
  const esito = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  aggiornaCampanella();
  if (esito !== "granted") { mostraRisposta({ risposta: "Notifiche non attivate." }); return; }
  try {
    await iscrivi();
    mostraRisposta({ risposta: "Notifiche attive: ti avviso alle 8 e mezz'ora prima di ogni impegno." });
  } catch {
    mostraRisposta({ risposta: "Non sono riuscito ad attivare le notifiche. Riprova." });
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
$("campanella").addEventListener("click", attivaNotifiche);
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
// Solo microfono: la casella invisibile serve alla dettatura quando il telefono non ascolta direttamente.
document.addEventListener("visibilitychange", () => { if (!document.hidden) caricaSettimana(); });
if (window.speechSynthesis) speechSynthesis.onvoiceschanged = () => voceItaliana();

stato.scelto = oggiLocale();
stato.lunedi = lunediDi(stato.scelto);
caricaSettimana();
riepilogoIniziale();
preparaNotifiche();
if (iOS) {
  // Il motore vocale si prepara all'apertura: la prima volta si scarica, poi resta nel telefono.
  const scaricato = {};
  impostaStato("Preparo il microfono…", "attesa");
  preparaVoce({
    progresso: (m) => {
      scaricato[m.file] = m;
      const tot = Object.values(scaricato).reduce((n, x) => n + x.totale, 0);
      const car = Object.values(scaricato).reduce((n, x) => n + x.caricato, 0);
      if (tot > 0 && !vocePronta()) $("stato").textContent = `Preparo il microfono… ${Math.min(99, Math.round((car / tot) * 100))}%`;
    },
    pronto: () => { if (!inAscoltoTelefono && !stato.occupato) impostaStato(""); },
  });
}
