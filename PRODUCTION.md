# Production Readiness Checklist

Checklist ordinata per priorità di ciò che manca prima di portare AssetBalancer in produzione.

---

## 🔴 Obbligatorio

### 1. HTTPS con certificato SSL
Senza TLS i JWT viaggiano in chiaro sulla rete.

- Aggiungi un reverse proxy (Nginx o Caddy) davanti al container `frontend`
- Usa **Let's Encrypt** per il certificato gratuito (Caddy lo gestisce automaticamente)
- Redireziona tutto il traffico HTTP → HTTPS
- Aggiorna `ALLOWED_ORIGIN` nel BEFF con il dominio HTTPS reale

### 2. Credenziali database forti
Le credenziali attuali sono `assetbalancer`/`assetbalancer`.

- Genera una password sicura: `openssl rand -base64 32`
- Aggiungila al `.env` di produzione:
  ```
  POSTGRES_PASSWORD=<password-generata>
  DATABASE_URL=postgresql://assetbalancer:<password-generata>@db:5432/assetbalancer
  ```
- Non esporre mai la porta 5432 del DB all'esterno (tenerla solo sulla rete `internal`)

### 3. Rate limiting sulle route di autenticazione
Senza limiti un attaccante può tentare milioni di password.

- Installa `express-rate-limit`:
  ```bash
  cd BEFF && npm install express-rate-limit
  ```
- Applica sulle route `/auth/login` e `/auth/register`:
  ```js
  import rateLimit from 'express-rate-limit'
  const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10 })
  app.use('/auth/login', authLimiter)
  app.use('/auth/register', authLimiter)
  ```

### 4. Refresh token in cookie HttpOnly
Il refresh token è attualmente in `localStorage`, accessibile da JavaScript e vulnerabile a XSS.

- Spostarlo in un cookie `HttpOnly; Secure; SameSite=Strict` lato server
- Il frontend non deve più leggere/scrivere il refresh token — lo gestisce il browser automaticamente
- Modificare `/auth/login`, `/auth/register`, `/auth/refresh` e `/auth/logout` nel BEFF di conseguenza

---

## 🟡 Importante

### 5. Pulizia sessioni scadute
La tabella `sessions` cresce senza limite — ogni login aggiunge una riga che non viene mai rimossa automaticamente.

- Aggiungere un job periodico (cron o `pg_cron`) che esegua:
  ```sql
  DELETE FROM sessions WHERE expires_at < NOW();
  ```
- In alternativa, usare un `pg_cron` direttamente nel DB oppure un container separato con un semplice script Node

### 6. Health check applicativo reale
L'attuale `GET /health` risponde `ok` anche se il DB è irraggiungibile.

- Modificarlo per eseguire una query di verifica:
  ```js
  app.get('/health', async (_req, res) => {
    await pool.query('SELECT 1')
    res.json({ status: 'ok', ts: new Date() })
  })
  ```

### 7. Variabili d'ambiente separate per ambiente
Non usare lo stesso `.env` per sviluppo locale e produzione.

- `.env` → sviluppo locale (già nel `.gitignore`)
- `.env.production` → produzione (mai nel repository, gestito dal sistema di deploy)
- Valori da differenziare: `JWT_SECRET`, `DATABASE_URL`, `ALLOWED_ORIGIN`, `POSTGRES_PASSWORD`

### 8. Backup automatico del database
Il volume `pgdata` è persistente ma non è un backup.

- Configurare backup periodici con `pg_dump`
- Esempio con un container dedicato o uno script cron sull'host:
  ```bash
  docker exec assetbalancer-db-1 pg_dump -U assetbalancer assetbalancer > backup_$(date +%Y%m%d).sql
  ```
- Salvare i backup in storage remoto (S3, Backblaze, ecc.)

---

## 🟢 Consigliato

### 9. Header di sicurezza HTTP con Helmet.js
Aggiunge protezioni contro XSS, clickjacking e altri attacchi comuni in una riga.

```bash
cd BEFF && npm install helmet
```
```js
import helmet from 'helmet'
app.use(helmet())
```

### 10. Logging strutturato
Sostituire i `console.log` con un logger strutturato come `pino` per avere log in formato JSON interrogabili in produzione.

```bash
cd BEFF && npm install pino pino-http
```

### 11. Reset password via email
Attualmente non c'è modo di recuperare un account con password dimenticata.

- Aggiungere tabella `password_reset_tokens` nel DB
- Integrare un servizio di invio email (Resend, SendGrid, SMTP)
- Route: `POST /auth/forgot-password` e `POST /auth/reset-password`

### 12. Validazione input con Zod
Le route del BEFF fanno validazioni manuali (`if (!email || !password)`). Centralizzare con uno schema di validazione riduce i bug.

```bash
cd BEFF && npm install zod
```

---

## Ordine di esecuzione suggerito

```
1. HTTPS                          ← blocca tutto il resto
2. Credenziali DB forti
3. Rate limiting
4. Cookie HttpOnly
5. Health check reale
6. Backup DB
7. Pulizia sessioni
8. Helmet + logging
9. Reset password
10. Validazione Zod
```
