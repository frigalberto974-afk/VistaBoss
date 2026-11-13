// Riconoscimento vocale sul telefono (Whisper, gratuito, nessun servizio esterno).
// Il modello si scarica una volta da Hugging Face e resta nella cache del telefono.
import { pipeline, env } from "./vendor/transformers/transformers.min.js";

env.allowLocalModels = false;
env.backends.onnx.wasm.wasmPaths = new URL("./vendor/transformers/", self.location.href).href;
env.backends.onnx.wasm.numThreads = 1;

const MODELLO = "onnx-community/whisper-base";
let asr = null;

async function carica() {
  if (asr) return asr;
  asr = pipeline("automatic-speech-recognition", MODELLO, {
    device: "wasm",
    dtype: { encoder_model: "q8", decoder_model_merged: "q8" },
    progress_callback: (p) => {
      if (p.status === "progress" && p.total) self.postMessage({ tipo: "progresso", file: p.file, caricato: p.loaded, totale: p.total });
    },
  });
  try {
    asr = await asr;
    self.postMessage({ tipo: "pronto" });
    return asr;
  } catch (err) {
    asr = null;
    throw err;
  }
}

self.onmessage = async (e) => {
  const { tipo, audio, id } = e.data;
  try {
    if (tipo === "carica") { await carica(); return; }
    if (tipo === "trascrivi") {
      const m = await carica();
      const r = await m(audio, { language: "italian", task: "transcribe" });
      self.postMessage({ tipo: "testo", id, testo: (r.text || "").trim() });
    }
  } catch (err) {
    self.postMessage({ tipo: "errore", id, messaggio: String(err && err.message || err) });
  }
};
