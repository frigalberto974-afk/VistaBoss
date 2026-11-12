# VistaBoss – agenda vocale

Web app per iPhone: il titolare tocca il microfono, parla in italiano e l'assistente
segna, legge, sposta o cancella gli appuntamenti sul calendario Google "Agenda VistaBoss".
Spostamenti e cancellazioni vengono eseguiti solo dopo conferma esplicita.

## Architettura
- `public/`: interfaccia (riconoscimento vocale e sintesi vocale del browser, PIN).
- `netlify/functions/assistente.mts`: endpoint `POST /api/assistente`, protetto da PIN.
- `src/assistente.ts`: Claude (`claude-sonnet-5-5`) con strumenti sull'agenda.
- `src/agenda.ts`: Google Calendar tramite account di servizio `vistaboss-robot`.
- `src/firma.ts`: firma HMAC delle azioni in attesa di conferma.

## Variabili d'ambiente (Netlify)
Vedi `.env.example`. Nessun segreto nel repository.

## Comandi
- `npm test`: test
- `npm run lint`: controllo dei tipi
