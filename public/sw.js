// Service worker: mostra gli avvisi del segretario e conferma al server di averli ricevuti.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (evento) => {
  let dati = { titolo: "Promemoria", testo: "" };
  try { dati = evento.data.json(); } catch { if (evento.data) dati.testo = evento.data.text(); }
  evento.waitUntil((async () => {
    await self.registration.showNotification(dati.titolo || "Promemoria", {
      body: dati.testo || "",
      icon: "/icona-180.png",
      badge: "/icona-180.png",
      lang: "it",
    });
    // Conferma di ricezione: se non arriva, il server rimanda l'avviso.
    if (dati.chiave) {
      try {
        const iscr = await self.registration.pushManager.getSubscription();
        if (iscr) {
          await fetch("/api/ricevuta", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chiave: dati.chiave, endpoint: iscr.endpoint }) });
        }
      } catch { /* senza rete: il server rimanderà l'avviso */ }
    }
  })());
});

self.addEventListener("notificationclick", (evento) => {
  evento.notification.close();
  evento.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((finestre) => {
      for (const f of finestre) if ("focus" in f) return f.focus();
      return self.clients.openWindow("/");
    }),
  );
});
