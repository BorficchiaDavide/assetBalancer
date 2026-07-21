-- ---------------------------------------------------------------------------
-- Trigger function: auto-update updated_at on row changes
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- users
-- Stores login credentials. password_hash must be a bcrypt/argon2 digest —
-- never store plaintext passwords.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL      PRIMARY KEY,
  email         TEXT        NOT NULL UNIQUE,
  password_hash TEXT        NOT NULL,
  display_name  TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- sessions
-- One row per issued refresh-token. Allows explicit revocation.
-- Access tokens (JWT, short-lived) are stateless and not stored here.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sessions (
  id          SERIAL      PRIMARY KEY,
  user_id     INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT        NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id    ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

-- ---------------------------------------------------------------------------
-- instruments
-- Normalised cache of ISIN metadata fetched from Yahoo Finance.
-- name/ticker/exchange are attributes of the instrument itself, not of any
-- portfolio → they live here, not in portfolio_assets (3NF).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS instruments (
  isin              TEXT        PRIMARY KEY,
  name              TEXT,
  ticker            TEXT,
  exchange          TEXT,
  quote_type        TEXT,
  macro_asset_class TEXT,
  cached_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- portfolios
-- Each user can own multiple portfolios.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS portfolios (
  id         SERIAL      PRIMARY KEY,
  user_id    INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT        NOT NULL,
  sort_order INTEGER     NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER portfolios_updated_at
  BEFORE UPDATE ON portfolios
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_portfolios_user_id ON portfolios(user_id);

-- ---------------------------------------------------------------------------
-- portfolio_assets
-- The join between a portfolio and an instrument, plus the user's position
-- data (quantity, cost basis, target allocation).
-- UNIQUE(portfolio_id, isin) prevents the same instrument appearing twice
-- in the same portfolio.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS portfolio_assets (
  id                 SERIAL         PRIMARY KEY,
  portfolio_id       INTEGER        NOT NULL REFERENCES portfolios(id)  ON DELETE CASCADE,
  isin               TEXT           NOT NULL REFERENCES instruments(isin),
  quantity           NUMERIC(18, 8) NOT NULL,
  purchase_price_eur NUMERIC(18, 4),
  target_pct         NUMERIC(5, 2)  NOT NULL DEFAULT 0,
  added_at           TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ    NOT NULL DEFAULT NOW(),

  excluded           BOOLEAN        NOT NULL DEFAULT FALSE,

  UNIQUE (portfolio_id, isin)
);

CREATE TRIGGER portfolio_assets_updated_at
  BEFORE UPDATE ON portfolio_assets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_portfolio_assets_portfolio_id ON portfolio_assets(portfolio_id);
CREATE INDEX IF NOT EXISTS idx_portfolio_assets_isin         ON portfolio_assets(isin);
