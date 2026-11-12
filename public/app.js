// Interfaccia dell'agenda vocale. Un pulsante: si parla, l'assistente risponde a voce.
"use strict";

const $ = (id) => document.getElementById(id);
const MEMORIA_PIN = "vistaboss.pin";

const stato = { storia: [], inAttesa: null, occupato: false, riconoscimento: null };

function leggiPin() {
  try { return localStorage.getItem(MEMORIA_PIN) || ""; } catch { return ""; }
}
function salvaPin(pin) {
  try { pin ? localStorage.setItem(MEMORIA_PIN, pin) : localStorage.removeItem(MEMORIA_PIN); } catch { /* memoria non disponibile */ }
}

function mostra(schermata) {
  $("schermata-pin").hidden = schermata !== "pin";
  $("schermata-app").hidden = schermata !== "app";
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
// Su iPhone la sintesi vocale va "sbloccata" con un tocco dell'utente.
let voceSbloccata = false;
function sbloccaVoce() {
  if (voceSbloccata || !window.speechSynthesis) return;
  speechSynthesis.speak(new SpeechSynthesisUtterance(""));
  voceSbloccata = true;
}

// ---- Interfaccia ----
function impostaStato(testo, classe) {
  $("stato").textContent = testo;
  $("microfono").className = "microfono" + (classe ? " " + classe : "");
}
function mostraConferma(attiva) {
  $("conferma").hidden = !attiva;
}
function aggiungiStoria(ruolo, testo) {
  stato.storia.push({ ruolo, testo });
  stato.storia = stato.storia.slice(-8);
}

// ---- Server ----
async function chiama(corpo) {
  const risposta = await fetch("/api/assistente", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Pin": leggiPin() },
    body: JSON.stringify(corpo),
  });
  if (risposta.status === 401) {
    salvaPin("");
    mostra("pin");
    $("errore-pin").textContent = "PIN errato, riprova.";
    throw new Error("pin");
  }
  return risposta.json();
}

function mostraRisposta(dati) {
  const testo = dati.risposta || dati.errore || "Qualcosa non ha funzionato.";
  $("risposta").textContent = testo;
  aggiungiStoria("assistente", testo);
  stato.inAttesa = dati.inAttesa || null;
  mostraConferma(Boolean(stato.inAttesa));
  parla(testo);
}

const SI = /^(s[iì]|confermo|conferma|ok|okay|va bene|certo|esatto|procedi|fallo)(?=$|[\s,.!])/i;
const NO = /^(no|annulla|lascia stare|niente|non farlo|fermo)(?=$|[\s,.!])/i;

async function invia(testo) {
  testo = testo.trim();
  if (!testo || stato.occupato) return;
  stato.occupato = true;
  $("detto").textContent = "«" + testo + "»";
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
  } catch (err) {
    if (err.message !== "pin") mostraRisposta({ risposta: "Non riesco a collegarmi. Controlla la connessione e riprova." });
  } finally {
    stato.occupato = false;
    impostaStato("Tocca e parla");
  }
}

// ---- Microfono ----
const Riconoscimento = window.SpeechRecognition || window.webkitSpeechRecognition;

function ascolta() {
  sbloccaVoce();
  if (stato.occupato) return;
  if (stato.riconoscimento) {
    stato.riconoscimento.stop();
    return;
  }
  if (!Riconoscimento) {
    // Ripiego: la dettatura della tastiera dell'iPhone (tasto microfono sulla tastiera).
    $("testo").focus();
    impostaStato("Tocca il microfono sulla tastiera e parla");
    return;
  }
  if (window.speechSynthesis) speechSynthesis.cancel();
  const r = new Riconoscimento();
  r.lang = "it-IT";
  r.interimResults = true;
  r.continuous = false;
  r.maxAlternatives = 1;
  let finale = "";
  r.onresult = (e) => {
    let parziale = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (e.results[i].isFinal) finale += e.results[i][0].transcript;
      else parziale += e.results[i][0].transcript;
    }
    $("detto").textContent = (finale + " " + parziale).trim();
  };
  r.onerror = (e) => {
    if (e.error === "not-allowed" || e.error === "service-not-allowed") {
      $("risposta").textContent = "Il microfono non è autorizzato. Consenti l'accesso al microfono, oppure scrivi qui sotto.";
    }
  };
  r.onend = () => {
    stato.riconoscimento = null;
    impostaStato("Tocca e parla");
    const testo = (finale || $("detto").textContent.replace(/[«»]/g, "")).trim();
    if (testo) invia(testo);
  };
  stato.riconoscimento = r;
  $("detto").textContent = "";
  impostaStato("Ti ascolto… tocca di nuovo per finire", "ascolto");
  r.start();
}

// ---- Avvio ----
$("microfono").addEventListener("click", ascolta);
$("si").addEventListener("click", () => { sbloccaVoce(); invia("sì"); });
$("no").addEventListener("click", () => { sbloccaVoce(); invia("no"); });
$("form-testo").addEventListener("submit", (e) => {
  e.preventDefault();
  sbloccaVoce();
  const t = $("testo").value;
  $("testo").value = "";
  $("testo").blur();
  invia(t);
});
$("form-pin").addEventListener("submit", (e) => {
  e.preventDefault();
  const pin = $("pin").value.trim();
  if (!pin) return;
  salvaPin(pin);
  $("pin").value = "";
  $("errore-pin").textContent = "";
  mostra("app");
});
if (window.speechSynthesis) speechSynthesis.onvoiceschanged = () => voceItaliana();

// Link personale: https://…/#k=CODICE sblocca l'app senza digitare nulla.
const daLink = new URLSearchParams(location.hash.slice(1)).get("k");
if (daLink) {
  salvaPin(daLink);
  history.replaceState(null, "", location.pathname);
}

mostra("app");
