# assetBalancer

Portfolio tracker that lets users manage multi-asset portfolios with live prices
from Yahoo Finance, normalized to EUR.

## Architecture

```
Browser → frontend:80 (Nginx) → beff:3001 (Express) → PostgreSQL 16
                                       ↓
                                Yahoo Finance API
```

All three services run in Docker. Nginx inside the frontend container handles
SPA routing and proxies `/api/*`, `/auth/*`, `/health` to beff — no direct
browser-to-beff traffic.

## Services

| Service  | Path        | Port (local)         | Notes                         |
|----------|-------------|----------------------|-------------------------------|
| frontend | `frontend/` | 8080                 | React + Vite, served by Nginx |
| beff     | `BEFF/`     | 3001 (internal only) | Express BFF                   |
| db       | —           | internal only        | Postgres 16, init via `db/init.sql` |

## Local dev

### Full stack (Docker)
```bash
cp .env.example .env      # fill POSTGRES_PASSWORD and JWT_SECRET
docker compose up --build
# → http://localhost:8080
```

### Frontend only (hot reload)
```bash
cd frontend && npm install && npm run dev
# → http://localhost:5173 (Vite proxies /api/* and /auth/* to localhost:3001)
```

### BEFF only
```bash
cd BEFF && npm install && npm run dev
```

## Environment variables

Root `.env` (used by docker-compose):
- `POSTGRES_PASSWORD` — required, no default
- `JWT_SECRET` — required in prod; defaults to `change-me-in-production` (warns at startup)

BEFF `.env` (for local non-Docker runs):
- `ALLOWED_ORIGIN` — CORS origin, default `http://localhost:5173`

**Never commit or push `.env` files or any other file containing secrets/credentials, under any circumstances** — even if explicitly asked. `.env` is already covered by `.gitignore`; do not force-add it.

## Key files

- `BEFF/server.js` — entire backend in one file (auth + portfolio + finance routes)
- `frontend/nginx.conf` — Nginx config inside the frontend container
- `frontend/src/api.js` — all frontend API calls
- `db/init.sql` — schema (tables: `users`, `sessions`, `portfolios`, `portfolio_assets`, `instruments`)
- `docker-compose.yml` — single compose file for all environments

## Auth model

- Access token: JWT, 15 min expiry
- Refresh token: random 64-byte hex, stored as SHA-256 hash in `sessions` table, 30-day expiry
- All `/api/portfolios/*` routes require `Authorization: Bearer <accessToken>`
- Finance routes (`/api/quote`, `/api/quotes`, `/api/search`, `/api/history`, `/api/rates`) are public

## Prices & currency

All prices exposed by the API are normalized to **EUR**.
FX rates are fetched from Yahoo Finance and cached in-process for 5 minutes.
GBp (pence) is converted to GBP before EUR conversion.
ISIN lookup prefers EUR-listed exchanges (`.MI`, `.PA`, `.DE`, etc.) over USD listings.

## Deferred features

- **HTTPS / reverse proxy (Caddy):** waiting for a real domain before implementing.
  When ready: add `docker-compose.prod.yml` with a Caddy service and update `ALLOWED_ORIGIN` in beff to the real HTTPS domain.
