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
| caddy    | —           | 80, 443 (prod profile only) | TLS termination, see below |

## Local dev

### Full stack (Docker)
```bash
cp .env.example .env      # fill POSTGRES_PASSWORD and JWT_SECRET
docker compose up --build
# → http://localhost:8080
```

### Full stack with HTTPS (Caddy)
Adds a Caddy reverse proxy in front of `frontend` and terminates TLS. With `DOMAIN`
unset (or `localhost`), Caddy issues a locally-trusted certificate from its internal
CA — no real domain needed. Also flips `NODE_ENV=production` on `beff`, which makes
the refresh-token cookie `Secure` (see Auth model below).
```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up --build
# → https://localhost (cert from Caddy's internal CA — your browser will warn
#   since that CA isn't in the OS trust store; safe to bypass for local testing,
#   or extract data/caddy/pki/authorities/local/root.crt from the caddy_data
#   volume and trust it manually to make the warning go away)
```
For a real deployment, set `DOMAIN=yourdomain.com` and `ACME_EMAIL=you@yourdomain.com`
in `.env` — Caddy then requests a real Let's Encrypt certificate automatically.

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
- `docker-compose.yml` — base compose file (dev + prod services)
- `docker-compose.prod.yml` — overlay adding the Caddy TLS reverse proxy; see "Full stack with HTTPS" above
- `Caddyfile` — Caddy site config, shared by local (internal CA) and real-domain (Let's Encrypt) use

## Auth model

- Access token: JWT, 15 min expiry, returned in the response body and kept in memory by the frontend
- Refresh token: random 64-byte hex, stored as SHA-256 hash in `sessions` table, 30-day expiry.
  Set as an `HttpOnly; SameSite=Strict` cookie scoped to `/auth`, rotated on every `/auth/refresh`.
  `Secure` is on when `beff` runs with `NODE_ENV=production` (set by `docker-compose.prod.yml`)
- Expired rows in `sessions` are purged by an in-process job in `beff` (on startup, then hourly)
- All `/api/portfolios/*` routes require `Authorization: Bearer <accessToken>`
- Finance routes (`/api/quote`, `/api/quotes`, `/api/search`, `/api/history`, `/api/rates`) are public

## Prices & currency

All prices exposed by the API are normalized to **EUR**.
FX rates are fetched from Yahoo Finance and cached in-process for 5 minutes.
GBp (pence) is converted to GBP before EUR conversion.
ISIN lookup prefers EUR-listed exchanges (`.MI`, `.PA`, `.DE`, etc.) over USD listings.
