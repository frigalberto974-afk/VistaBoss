// Service worker: riceve le notifiche push del segretario e apre l'app al tocco.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (evento) => {
  let dati = { titolo: "Agenda", testo: "" };
  try { dati = evento.data.json(); } catch { if (evento.data) dati.testo = evento.data.text(); }
  evento.waitUntil(
    self.registration.showNotification(dati.titolo || "Agenda", {
      body: dati.testo || "",
      icon: "/icona-180.png",
      badge: "/icona-180.png",
      lang: "it",
    }),
  );
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
