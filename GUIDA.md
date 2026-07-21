# AssetBalancer — Guida all'installazione

Questa guida ti permette di avviare AssetBalancer sul tuo PC **senza installare Node.js, npm o nulla di tecnico**. L'unica cosa necessaria è **Docker** (tramite Rancher Desktop, gratuito).

---

## Cosa ti serve

| Strumento | Perché | Gratuito? |
|-----------|--------|-----------|
| Rancher Desktop | Fa girare il progetto in modo isolato | Sì, completamente |
| Git *(opzionale)* | Per scaricare il codice | Sì |

---

## Step 1 — Installa Rancher Desktop

### Su Mac

1. Vai su **https://rancherdesktop.io**
2. Clicca **Download** e scegli la versione per Mac:
   - *Apple Silicon* se hai un Mac con chip M1/M2/M3/M4
   - *Intel* se hai un Mac più vecchio
3. Apri il file `.dmg` scaricato e trascina Rancher Desktop nella cartella *Applicazioni*
4. Apri Rancher Desktop dal Launchpad
5. Al primo avvio compare una finestra di configurazione — lascia tutto predefinito e clicca **OK / Accept**
6. Attendi che in basso a sinistra compaia **"Running"** (può richiedere 1–2 minuti)

### Su Windows

1. Vai su **https://rancherdesktop.io**
2. Clicca **Download** e scegli la versione per Windows
3. Avvia il file `.exe` scaricato e segui l'installazione (lascia tutte le opzioni predefinite)
4. Al termine Rancher Desktop si avvia automaticamente
5. Al primo avvio compare una finestra di configurazione — lascia tutto predefinito e clicca **OK / Accept**
6. Attendi che in basso compaia **"Running"**

> **Rancher Desktop è completamente gratuito**, anche in ambito aziendale.

---

## Step 2 — Configura il contesto Docker (solo la prima volta)

Dopo aver installato Rancher Desktop, apri il **Terminale** (Mac) o **PowerShell** (Windows) ed esegui:

```bash
docker context use rancher-desktop
```

Dovresti vedere:

```
Current context is now "rancher-desktop"
```

Da questo momento `docker` e `docker compose` useranno automaticamente Rancher Desktop.

---

## Step 3 — Scarica il progetto

### Opzione A — Con Git (consigliato)

```bash
git clone https://github.com/TUO-UTENTE/assetBalancer.git
cd assetBalancer
```

### Opzione B — Senza Git

1. Vai sulla pagina GitHub del progetto
2. Clicca sul bottone verde **Code → Download ZIP**
3. Estrai lo ZIP in una cartella a tua scelta (es. `Documenti/assetBalancer`)
4. Apri il Terminale e spostati nella cartella:

**Mac:**
```bash
cd ~/Documenti/assetBalancer
```

**Windows (PowerShell):**
```powershell
cd C:\Users\TUO-NOME\Documents\assetBalancer
```

---

## Step 4 — Crea il file `.env`

Il progetto ha bisogno di un file `.env` nella cartella principale con due variabili segrete.

### Crea il file partendo dall'esempio

**Mac / Linux:**
```bash
cp .env.example .env
```

**Windows (PowerShell):**
```powershell
Copy-Item .env.example .env
```

### Modifica il file `.env`

Apri il file `.env` con un editor di testo (Blocco Note su Windows, TextEdit su Mac) e sostituisci i valori segnaposto:

```env
JWT_SECRET=change-me-generate-with-openssl-rand-base64-32
POSTGRES_PASSWORD=change-me-use-a-strong-password
```

Scrivi due valori a tua scelta, ad esempio:

```env
JWT_SECRET=una-frase-lunga-e-difficile-da-indovinare-almeno-32-caratteri
POSTGRES_PASSWORD=passwordSicura123!
```

> **Importante:** non usare spazi attorno al simbolo `=` e non mettere le virgolette.

Se hai `openssl` installato puoi generare una chiave sicura con:
```bash
openssl rand -base64 32
```

---

## Step 5 — Avvia il progetto

Dalla cartella del progetto esegui:

```bash
docker compose up --build
```

La prima volta questo comando:
- scarica le immagini base (Node.js, Nginx, PostgreSQL)
- compila il frontend e il backend
- crea il database

**Può richiedere 3–5 minuti** a seconda della connessione internet. Vedrai scorrere del testo — è normale.

Il progetto è pronto quando compaiono queste righe:

```
assetbalancer-db-1      | database system is ready to accept connections
assetbalancer-beff-1    | BEFF running on http://localhost:3001
assetbalancer-frontend-1| /docker-entrypoint.sh: Configuration complete
```

### Apri l'app nel browser

```
http://localhost:8080
```

Registra un account, aggiungi i tuoi ETF e inizia a monitorare il portafoglio.

---

## Struttura del progetto

```
assetBalancer/
├── frontend/          → Interfaccia utente (React + Vite)
├── BEFF/              → Backend API (Node.js + Express)
├── db/
│   └── init.sql       → Schema del database (creato automaticamente)
├── docker-compose.yml → Orchestrazione dei tre container
└── .env               → Variabili segrete (lo crei tu al Step 4)
```

Il progetto avvia **tre container**:

| Container | Cosa fa | Porta |
|-----------|---------|-------|
| `frontend` | Serve l'app web tramite Nginx | 8080 |
| `beff` | API: autenticazione, prezzi Yahoo Finance | solo interno |
| `db` | Database PostgreSQL | solo interno |

Solo il frontend è raggiungibile dall'esterno (porta 8080). Il backend e il database comunicano in una rete interna isolata.

---

## Comandi utili

| Cosa vuoi fare | Comando |
|----------------|---------|
| Avviare il progetto | `docker compose up` |
| Avviare **in background** | `docker compose up -d` |
| Fermare il progetto | `docker compose down` |
| Vedere i log in tempo reale | `docker compose logs -f` |
| Ricompilare dopo modifiche al codice | `docker compose up --build` |
| Ricompilare solo il frontend | `docker compose up -d --build frontend` |
| Verificare lo stato dei container | `docker compose ps` |
| Eliminare tutto (anche il database) | `docker compose down -v` |

---

## Aggiornare il progetto

```bash
git pull
docker compose up --build
```

---

## Risoluzione problemi

### "Cannot connect to the Docker daemon"
Rancher Desktop non è avviato. Aprilo, attendi **"Running"**, poi esegui:
```bash
docker context use rancher-desktop
```

### "Port 8080 is already in use"
Un'altra applicazione usa la porta 8080. Apri `docker-compose.yml`, sostituisci `"8080:80"` con `"9090:80"` e riavvia:
```bash
docker compose up -d
```
Poi accedi su `http://localhost:9090`.

### "POSTGRES_PASSWORD is required"
Non hai creato il file `.env` oppure manca la variabile `POSTGRES_PASSWORD`. Torna al **Step 4** e verifica che il file `.env` esista nella cartella principale del progetto e contenga entrambe le variabili.

### La pagina non si apre
Verifica che tutti i container siano attivi:
```bash
docker compose ps
```
Tutti e tre devono mostrare **Up**. Se qualcuno è in errore, leggi i log con:
```bash
docker compose logs beff
```

### I prezzi degli ETF non si aggiornano
I prezzi vengono scaricati da Yahoo Finance in tempo reale — serve la connessione internet. Se il mercato è chiuso i prezzi mostrati sono quelli dell'ultima chiusura.
