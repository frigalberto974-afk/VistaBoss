// Il segretario: robottino 3D con viso su schermo (occhi e bocca animati).
// Stati: "riposo", "ascolto", "pensa", "parla", "contento".
import * as THREE from "three";
import { RoundedBoxGeometry } from "./vendor/RoundedBoxGeometry.js";

const COLORE = { riposo: "#5ec8ff", ascolto: "#ff5d6c", pensa: "#ffd166", parla: "#5ec8ff", contento: "#5effa8" };

export function creaRobot(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scena = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  camera.position.set(0, 0.35, 6.2);
  camera.lookAt(0, 0.1, 0);

  scena.add(new THREE.HemisphereLight(0xdfe9ff, 0x20242c, 1.4));
  const sole = new THREE.DirectionalLight(0xffffff, 2.2);
  sole.position.set(2.5, 3, 4);
  scena.add(sole);
  const controluce = new THREE.DirectionalLight(0x6aa8ff, 1.2);
  controluce.position.set(-3, 1, -2);
  scena.add(controluce);

  const bianco = new THREE.MeshStandardMaterial({ color: 0xf1f4f8, roughness: 0.35, metalness: 0.1 });
  const blu = new THREE.MeshStandardMaterial({ color: 0x2f7cf6, roughness: 0.4, metalness: 0.2 });
  const scuro = new THREE.MeshStandardMaterial({ color: 0x0b0e14, roughness: 0.15, metalness: 0.3 });

  const robot = new THREE.Group();
  scena.add(robot);

  // Corpo
  const corpo = new THREE.Mesh(new RoundedBoxGeometry(1.25, 0.95, 0.85, 6, 0.32), bianco);
  corpo.position.y = -1.05;
  robot.add(corpo);
  const luceTorace = new THREE.Mesh(
    new THREE.CircleGeometry(0.12, 32),
    new THREE.MeshStandardMaterial({ color: 0x000000, emissive: new THREE.Color(COLORE.riposo), emissiveIntensity: 1.6 }),
  );
  luceTorace.position.set(0, -0.98, 0.431);
  robot.add(luceTorace);
  for (const lato of [-1, 1]) {
    const braccio = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.45, 6, 16), blu);
    braccio.position.set(lato * 0.78, -1.05, 0);
    braccio.rotation.z = lato * 0.25;
    robot.add(braccio);
  }

  // Testa
  const testa = new THREE.Group();
  testa.position.y = 0.25;
  robot.add(testa);
  testa.add(new THREE.Mesh(new RoundedBoxGeometry(1.7, 1.3, 1.15, 8, 0.42), bianco));
  const schermo = new THREE.Mesh(new RoundedBoxGeometry(1.36, 0.92, 0.1, 6, 0.2), scuro);
  schermo.position.z = 0.55;
  testa.add(schermo);
  for (const lato of [-1, 1]) {
    const orecchio = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.18, 32), blu);
    orecchio.rotation.z = Math.PI / 2;
    orecchio.position.x = lato * 0.92;
    testa.add(orecchio);
  }
  const stelo = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.35, 12), blu);
  stelo.position.y = 0.8;
  testa.add(stelo);
  const pallina = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 24, 16),
    new THREE.MeshStandardMaterial({ color: 0x000000, emissive: new THREE.Color(COLORE.riposo), emissiveIntensity: 2 }),
  );
  pallina.position.y = 1.02;
  testa.add(pallina);

  // Viso disegnato su una texture
  const viso = document.createElement("canvas");
  viso.width = 512;
  viso.height = 340;
  const ctx = viso.getContext("2d");
  const textureViso = new THREE.CanvasTexture(viso);
  textureViso.colorSpace = THREE.SRGBColorSpace;
  const pianoViso = new THREE.Mesh(new THREE.PlaneGeometry(1.24, 0.82), new THREE.MeshBasicMaterial({ map: textureViso, transparent: true }));
  pianoViso.position.z = 0.611;
  testa.add(pianoViso);

  let stato = "riposo";
  let apertura = 0; // bocca, 0..1
  let impulso = 0;
  let parlando = false;
  let prossimoBattito = 2 + Math.random() * 3;
  let battito = 0;
  let sguardo = { x: 0, y: 0 }, sguardoMeta = { x: 0, y: 0 }, prossimoSguardo = 1;

  function rettangolo(x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect(x - w / 2, y - h / 2, w, h, Math.min(r, w / 2, h / 2));
    ctx.fill();
  }

  function disegnaViso(t) {
    const c = COLORE[stato];
    ctx.clearRect(0, 0, viso.width, viso.height);
    ctx.fillStyle = c;
    ctx.strokeStyle = c;
    ctx.shadowColor = c;
    ctx.shadowBlur = 28;
    ctx.lineCap = "round";

    const cx = 256 + sguardo.x * 26, cy = 140 + sguardo.y * 16;
    const chiusura = battito > 0 ? Math.sin((battito / 0.16) * Math.PI) : 0;
    for (const lato of [-1, 1]) {
      const x = cx + lato * 92;
      if (stato === "contento") {
        ctx.lineWidth = 18;
        ctx.beginPath();
        ctx.arc(x, cy + 18, 34, Math.PI * 1.15, Math.PI * 1.85);
        ctx.stroke();
      } else {
        const grande = stato === "ascolto" ? 1.18 : 1;
        const h = Math.max(8, 92 * grande * (1 - chiusura));
        rettangolo(x, cy, 58 * grande, h, 26);
      }
    }

    // Bocca
    const by = 262;
    if (stato === "pensa") {
      for (let i = 0; i < 3; i++) {
        const a = 0.35 + 0.65 * Math.max(0, Math.sin(t * 5 - i * 0.7));
        ctx.globalAlpha = a;
        ctx.beginPath();
        ctx.arc(216 + i * 40, by, 11, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    } else if (apertura > 0.04) {
      rettangolo(256, by, 96 + apertura * 30, 10 + apertura * 52, 24);
    } else {
      ctx.lineWidth = 14;
      ctx.beginPath();
      ctx.arc(256, by - 40, 52, Math.PI * 0.25, Math.PI * 0.75);
      ctx.stroke();
    }
    textureViso.needsUpdate = true;
  }

  function dimensiona() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(dimensiona).observe(canvas);
  dimensiona();

  const orologio = new THREE.Clock();
  function ciclo() {
    const dt = Math.min(orologio.getDelta(), 0.05);
    const t = orologio.elapsedTime;

    // Battito di ciglia e sguardo
    prossimoBattito -= dt;
    if (prossimoBattito <= 0 && battito <= 0) { battito = 0.16; prossimoBattito = 2.5 + Math.random() * 3.5; }
    if (battito > 0) battito = Math.max(0, battito - dt);
    prossimoSguardo -= dt;
    if (prossimoSguardo <= 0) {
      sguardoMeta = stato === "pensa" ? { x: 0.6, y: -0.8 } : { x: (Math.random() - 0.5) * 1.2, y: (Math.random() - 0.5) * 0.6 };
      prossimoSguardo = 1.5 + Math.random() * 2.5;
    }
    if (stato === "ascolto" || stato === "parla") sguardoMeta = { x: 0, y: 0 };
    sguardo.x += (sguardoMeta.x - sguardo.x) * Math.min(1, dt * 6);
    sguardo.y += (sguardoMeta.y - sguardo.y) * Math.min(1, dt * 6);

    // Bocca: impulsi sulle parole + oscillazione mentre parla
    impulso = Math.max(0, impulso - dt * 4);
    const meta = parlando ? 0.35 + 0.35 * Math.abs(Math.sin(t * 13)) + impulso * 0.5 : 0;
    apertura += (Math.min(1, meta) - apertura) * Math.min(1, dt * 18);

    // Movimento del corpo
    robot.position.y = Math.sin(t * 1.6) * 0.05;
    testa.rotation.z = Math.sin(t * 0.9) * 0.04 + (stato === "pensa" ? 0.12 : 0);
    testa.rotation.y = sguardo.x * 0.18;
    testa.rotation.x = sguardo.y * 0.1 + (stato === "ascolto" ? -0.06 : 0);
    if (stato === "contento") robot.position.y += Math.abs(Math.sin(t * 8)) * 0.06;

    const colore = new THREE.Color(COLORE[stato]);
    const pulsazione = stato === "ascolto" ? 1.4 + Math.sin(t * 8) * 0.9 : stato === "pensa" ? 1.4 + Math.sin(t * 12) * 0.8 : 1.8;
    pallina.material.emissive.copy(colore);
    pallina.material.emissiveIntensity = pulsazione;
    luceTorace.material.emissive.copy(colore);

    disegnaViso(t);
    renderer.render(scena, camera);
    requestAnimationFrame(ciclo);
  }
  ciclo();

  let timerContento;
  return {
    imposta(nuovo) {
      clearTimeout(timerContento);
      stato = COLORE[nuovo] ? nuovo : "riposo";
      if (stato === "contento") timerContento = setTimeout(() => { if (stato === "contento") stato = parlando ? "parla" : "riposo"; }, 1600);
    },
    parla(attivo) {
      parlando = attivo;
      if (attivo && stato !== "contento") stato = "parla";
      if (!attivo && stato === "parla") stato = "riposo";
    },
    parola() { impulso = 1; },
  };
}
