# Production Readiness Checklist

Checklist ordinata per priorità di ciò che manca prima di portare AssetBalancer in produzione.

Implementato: rate limiting su `/auth/login` e `/auth/register` (`express-rate-limit`), health
check con verifica reale del DB, header di sicurezza con `helmet`, credenziali DB senza default
debole (`POSTGRES_PASSWORD` obbligatoria in `docker-compose.yml`), refresh token in cookie
HttpOnly (`BEFF/server.js`, scope `/auth`, rotazione ad ogni refresh), pulizia periodica delle
sessioni scadute (job in-process ogni ora in `BEFF/server.js`).

Nota sul cookie di refresh: il flag `Secure` è legato a `NODE_ENV=production`, che oggi non è
impostato in `docker-compose.yml` — corretto finché non c'è HTTPS (vedi punto 1), altrimenti il
browser scarterebbe il cookie su connessioni in chiaro. Quando si aggiunge il reverse proxy TLS,
impostare anche `NODE_ENV=production` nel servizio `beff` per attivare `Secure`.

---

## 🔴 Obbligatorio

### 1. HTTPS con certificato SSL
Senza TLS i JWT viaggiano in chiaro sulla rete. Vedi anche "Deferred features" in `CLAUDE.md`
(in attesa di un dominio reale).

- Aggiungi un reverse proxy (Nginx o Caddy) davanti al container `frontend`
- Usa **Let's Encrypt** per il certificato gratuito (Caddy lo gestisce automaticamente)
- Redireziona tutto il traffico HTTP → HTTPS
- Aggiungi `docker-compose.prod.yml` con il servizio Caddy
- Aggiorna `ALLOWED_ORIGIN` nel BEFF con il dominio HTTPS reale
- Imposta `NODE_ENV=production` sul servizio `beff` per attivare il flag `Secure` sul cookie di refresh

---

## 🟡 Importante

### 2. Variabili d'ambiente separate per ambiente
Non usare lo stesso `.env` per sviluppo locale e produzione. Oggi esiste solo `.env.example` e
`.env` locale.

- `.env` → sviluppo locale (già nel `.gitignore`)
- `.env.production` → produzione (mai nel repository, gestito dal sistema di deploy)
- Valori da differenziare: `JWT_SECRET`, `DATABASE_URL`, `ALLOWED_ORIGIN`, `POSTGRES_PASSWORD`

### 3. Backup automatico del database
Il volume `pgdata` è persistente ma non è un backup. Nessuno script o job di backup esiste nel repo.

- Configurare backup periodici con `pg_dump`
- Esempio con un container dedicato o uno script cron sull'host:
  ```bash
  docker exec assetbalancer-db-1 pg_dump -U assetbalancer assetbalancer > backup_$(date +%Y%m%d).sql
  ```
- Salvare i backup in storage remoto (S3, Backblaze, ecc.)

---

## 🟢 Consigliato

### 4. Logging strutturato
Il BEFF usa ancora `console.log`/`console.error` (`BEFF/server.js`). Sostituire con un logger
strutturato come `pino` per avere log in formato JSON interrogabili in produzione.

```bash
cd BEFF && npm install pino pino-http
```

### 5. Reset password via email
Attualmente non c'è modo di recuperare un account con password dimenticata — nessuna route
`/auth/forgot-password` o `/auth/reset-password` nel BEFF.

- Aggiungere tabella `password_reset_tokens` nel DB
- Integrare un servizio di invio email (Resend, SendGrid, SMTP)
- Route: `POST /auth/forgot-password` e `POST /auth/reset-password`

### 6. Validazione input con Zod
Le route del BEFF fanno ancora validazioni manuali (`if (!email || !password)`). Centralizzare
con uno schema di validazione riduce i bug.

```bash
cd BEFF && npm install zod
```

---

## Ordine di esecuzione suggerito

```
1. HTTPS                          ← blocca tutto il resto
2. Variabili d'ambiente per produzione
3. Backup DB
4. Logging strutturato
5. Reset password
6. Validazione Zod
```
