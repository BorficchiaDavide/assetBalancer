import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import pg from 'pg'
import YahooFinance from 'yahoo-finance2'
import { rateLimit } from 'express-rate-limit'
import pino from 'pino'
import pinoHttp from 'pino-http'
import { z } from 'zod'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const PORT           = process.env.PORT        || 3001
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'http://localhost:5173'
const JWT_SECRET     = process.env.JWT_SECRET  || 'change-me-in-production'

const logger = pino({ level: process.env.LOG_LEVEL || 'info' })

if (JWT_SECRET === 'change-me-in-production') {
  logger.warn('JWT_SECRET is not set — do NOT use this in production')
}

const ACCESS_TOKEN_EXPIRY  = '15m'
const REFRESH_TOKEN_DAYS   = 30

// Secure requires HTTPS — flip on once the HTTPS reverse proxy (see PRODUCTION.md) is in place
// by setting NODE_ENV=production, otherwise browsers silently drop the cookie over plain HTTP.
const COOKIE_SECURE     = process.env.NODE_ENV === 'production'
const REFRESH_COOKIE    = 'ab_refresh_token'
const REFRESH_COOKIE_OPTS = {
  httpOnly: true,
  secure:   COOKIE_SECURE,
  sameSite: 'strict',
  path:     '/auth',
}

const SESSION_CLEANUP_INTERVAL_MS = 60 * 60 * 1000 // 1h

// ---------------------------------------------------------------------------
// Infrastructure
// ---------------------------------------------------------------------------

const { Pool } = pg
const pool = new Pool({ connectionString: process.env.DATABASE_URL })

const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] })

const app = express()
// Behind Caddy → nginx: Caddy adds one X-Forwarded-For entry with the real client
// IP, nginx passes it through unchanged. Trusting exactly 1 hop lets express-rate-limit
// key on the real visitor instead of throwing (it refuses to guess otherwise).
app.set('trust proxy', 1)
app.use(helmet())
app.use(cors({ origin: ALLOWED_ORIGIN, credentials: true }))
app.use(pinoHttp({ logger }))
app.use(express.json({ limit: '100kb' }))
app.use(cookieParser())

const asyncRoute = fn => (req, res, next) => fn(req, res, next).catch(next)

// Dummy hash used to make failed-login compare cost constant (timing-safe)
const DUMMY_HASH = bcrypt.hashSync('__dummy__', 10)

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'too many requests, please try again later' },
})

// Lighter than authLimiter — finance routes require a valid session, so this is
// defense-in-depth against a single account fanning out requests to Yahoo Finance.
// Set generously: nginx doesn't forward a header Express trusts for req.ip (only
// X-Real-IP, not X-Forwarded-For), so every request behind the reverse proxy shares
// one bucket — normal interactive use (ISIN search-as-you-type, switching between
// portfolios, price refresh) can otherwise trip this on its own.
const financeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'too many requests, please try again later' },
})

// ---------------------------------------------------------------------------
// Validation (Zod)
// ---------------------------------------------------------------------------

function validateBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body)
    if (!result.success) return res.status(400).json({ error: result.error.issues[0]?.message ?? 'invalid request body' })
    req.body = result.data
    next()
  }
}

function validateQuery(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.query)
    if (!result.success) return res.status(400).json({ error: result.error.issues[0]?.message ?? 'invalid query parameters' })
    req.query = result.data
    next()
  }
}

// Despite the name, this column holds either a real 12-char ISIN (when typed by
// hand) or a Yahoo Finance ticker with an exchange suffix like "SWDA.MI" (when
// picked from search suggestions, which is the common path) — both must validate.
const isinSchema = z.string().trim().min(1, 'identifier is required').max(20, 'identifier too long').regex(/^[A-Za-z0-9.\-]+$/, 'invalid identifier format')

const registerSchema = z.object({
  email:        z.string({ error: 'email is required' }).trim().toLowerCase().email('invalid email'),
  password:     z.string({ error: 'password is required' }).min(8, 'password must be at least 8 characters'),
  display_name: z.string().trim().min(1).optional(),
})

const loginSchema = z.object({
  email:    z.string({ error: 'email is required' }).trim().toLowerCase().email('invalid email'),
  password: z.string({ error: 'password is required' }).min(1, 'password is required'),
})

const passwordChangeSchema = z.object({
  currentPassword: z.string({ error: 'currentPassword is required' }).min(1, 'currentPassword is required'),
  newPassword:     z.string({ error: 'newPassword is required' }).min(8, 'password must be at least 8 characters'),
})

const portfolioNameSchema = z.object({
  name: z.string({ error: 'name is required' }).trim().min(1, 'name is required'),
})

const reorderSchema = z.object({
  ids: z.array(z.coerce.number().int().positive()).min(1, 'ids array is required'),
})

const quotesSchema = z.object({
  isins: z.array(isinSchema).min(1, 'isins array is required').max(50, 'maximum 50 ISINs per request'),
})

const searchQuerySchema = z.object({
  q: z.string().trim().max(100).optional().default(''),
})

const historyQuerySchema = z.object({
  period: z.enum(['1d', '5d', '1mo', '3mo', '6mo', '1y', '2y', '5y']).optional().default('6mo'),
})

const assetCreateSchema = z.object({
  isin:               isinSchema,
  name:               z.string().trim().nullable().optional(),
  ticker:             z.string().trim().nullable().optional(),
  exchange:           z.string().trim().nullable().optional(),
  quote_type:         z.string().trim().nullable().optional(),
  quantity:           z.coerce.number().positive('quantity must be positive'),
  purchase_price_eur: z.coerce.number().nonnegative().nullable().optional(),
  target_pct:         z.coerce.number().min(0).max(100).nullable().optional(),
})

const assetUpdateSchema = z.object({
  quantity:           z.coerce.number().positive().nullable().optional(),
  purchase_price_eur: z.coerce.number().nonnegative().nullable().optional(),
  target_pct:         z.coerce.number().min(0).max(100).nullable().optional(),
  excluded:           z.boolean().nullable().optional(),
})

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------

function signAccessToken(userId) {
  return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY })
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex')
}

async function issueTokens(userId) {
  const accessToken  = signAccessToken(userId)
  const refreshToken = crypto.randomBytes(64).toString('hex')
  const expiresAt    = new Date(Date.now() + REFRESH_TOKEN_DAYS * 86_400_000)
  await pool.query(
    'INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
    [userId, hashToken(refreshToken), expiresAt]
  )
  return { accessToken, refreshToken }
}

function setRefreshCookie(res, refreshToken) {
  res.cookie(REFRESH_COOKIE, refreshToken, {
    ...REFRESH_COOKIE_OPTS,
    maxAge: REFRESH_TOKEN_DAYS * 86_400_000,
  })
}

function clearRefreshCookie(res) {
  res.clearCookie(REFRESH_COOKIE, REFRESH_COOKIE_OPTS)
}

function authenticate(req, res, next) {
  const auth = req.headers.authorization
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'unauthorized' })
  try {
    const payload = jwt.verify(auth.slice(7), JWT_SECRET)
    req.userId = payload.sub
    next()
  } catch {
    res.status(401).json({ error: 'token expired or invalid' })
  }
}

// Verifies that portfolioId belongs to the authenticated user.
// Returns false and sends 403 if the check fails.
async function assertPortfolioOwner(portfolioId, userId, res) {
  const { rows } = await pool.query(
    'SELECT id FROM portfolios WHERE id = $1 AND user_id = $2',
    [portfolioId, userId]
  )
  if (rows.length === 0) {
    res.status(403).json({ error: 'forbidden' })
    return false
  }
  return true
}

// ---------------------------------------------------------------------------
// Auth routes
// ---------------------------------------------------------------------------

app.post('/auth/register', authLimiter, validateBody(registerSchema), asyncRoute(async (req, res) => {
  const { email, password, display_name } = req.body

  const password_hash = await bcrypt.hash(password, 12)
  try {
    const { rows } = await pool.query(
      `INSERT INTO users (email, password_hash, display_name)
       VALUES ($1, $2, $3) RETURNING id, email, display_name`,
      [email, password_hash, display_name ?? null]
    )
    const tokens = await issueTokens(rows[0].id)
    setRefreshCookie(res, tokens.refreshToken)
    res.status(201).json({ user: rows[0], accessToken: tokens.accessToken })
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'email already registered' })
    throw e
  }
}))

app.post('/auth/login', authLimiter, validateBody(loginSchema), asyncRoute(async (req, res) => {
  const { email, password } = req.body

  const { rows } = await pool.query(
    'SELECT id, email, display_name, password_hash FROM users WHERE email = $1',
    [email]
  )
  const user = rows[0]
  // Always run bcrypt to avoid timing-based user enumeration
  const valid = await bcrypt.compare(password, user?.password_hash ?? DUMMY_HASH)
  if (!user || !valid) return res.status(401).json({ error: 'invalid credentials' })

  const tokens = await issueTokens(user.id)
  setRefreshCookie(res, tokens.refreshToken)
  res.json({ user: { id: user.id, email: user.email, display_name: user.display_name }, accessToken: tokens.accessToken })
}))

app.post('/auth/refresh', asyncRoute(async (req, res) => {
  const refreshToken = req.cookies?.[REFRESH_COOKIE]
  if (!refreshToken) return res.status(401).json({ error: 'no refresh token' })

  const oldHash = hashToken(refreshToken)
  const { rows } = await pool.query(
    'DELETE FROM sessions WHERE token_hash = $1 AND expires_at > NOW() RETURNING user_id',
    [oldHash]
  )
  if (rows.length === 0) {
    clearRefreshCookie(res)
    return res.status(401).json({ error: 'invalid or expired refresh token' })
  }

  const { accessToken, refreshToken: newRefreshToken } = await issueTokens(rows[0].user_id)
  setRefreshCookie(res, newRefreshToken)
  res.json({ accessToken })
}))

app.post('/auth/logout', authenticate, asyncRoute(async (req, res) => {
  const refreshToken = req.cookies?.[REFRESH_COOKIE]
  if (refreshToken) {
    await pool.query('DELETE FROM sessions WHERE token_hash = $1', [hashToken(refreshToken)])
  }
  clearRefreshCookie(res)
  res.status(204).end()
}))

app.get('/auth/me', authenticate, asyncRoute(async (req, res) => {
  const { rows } = await pool.query(
    'SELECT id, email, display_name FROM users WHERE id = $1',
    [req.userId]
  )
  if (rows.length === 0) return res.status(404).json({ error: 'user not found' })
  res.json(rows[0])
}))

app.patch('/auth/password', authenticate, validateBody(passwordChangeSchema), asyncRoute(async (req, res) => {
  const { currentPassword, newPassword } = req.body

  const { rows } = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.userId])
  if (rows.length === 0) return res.status(404).json({ error: 'user not found' })

  const valid = await bcrypt.compare(currentPassword, rows[0].password_hash)
  if (!valid) return res.status(401).json({ error: 'current password is incorrect' })

  const newHash = await bcrypt.hash(newPassword, 12)
  await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, req.userId])
  res.status(204).end()
}))

// ---------------------------------------------------------------------------
// Currency helpers
// ---------------------------------------------------------------------------

const EUR_SUFFIXES = ['.MI', '.AS', '.PA', '.DE', '.F', '.BR', '.CO', '.MC', '.VI', '.LS']
const fxCache  = {}
const FX_TTL_MS = 5 * 60 * 1000

async function eurTo(toCurrency) {
  if (toCurrency === 'EUR') return 1
  const pair   = `EUR${toCurrency}=X`
  const cached = fxCache[pair]
  if (cached && Date.now() - cached.ts < FX_TTL_MS) return cached.rate
  const q    = await yahooFinance.quote(pair)
  const rate = q.regularMarketPrice
  fxCache[pair] = { rate, ts: Date.now() }
  return rate
}

async function toEUR(price, currency) {
  if (price == null) return { eurPrice: null, fxRate: null }
  const isPence      = currency === 'GBp'
  const normPrice    = isPence ? price / 100 : price
  const normCurrency = isPence ? 'GBP' : currency
  if (normCurrency === 'EUR') return { eurPrice: normPrice, fxRate: 1 }
  const rate = await eurTo(normCurrency)
  return { eurPrice: normPrice / rate, fxRate: rate }
}

function round(n, decimals = 4) {
  if (n == null) return null
  return Math.round(n * 10 ** decimals) / 10 ** decimals
}

// ---------------------------------------------------------------------------
// Macro asset class classification
// ---------------------------------------------------------------------------

const MACRO_CLASS = {
  EQUITY:      'Equity',
  FIXED_INCOME: 'Fixed Income',
  CASH:        'Cash & Cash Equivalents',
  COMMODITIES: 'Commodities',
  REAL_ESTATE: 'Real Estate',
  CRYPTO:      'Crypto & Digital Assets',
  ALTERNATIVE: 'Alternative Investments',
}

function inferMacroAssetClass(quote) {
  const qt       = (quote.quoteType || '').toUpperCase()
  const category = (quote.category  || '').toLowerCase()
  const sector   = (quote.sector    || '').toLowerCase()
  const name     = (quote.longName  || quote.shortName || '').toLowerCase()

  if (qt === 'CRYPTOCURRENCY') return MACRO_CLASS.CRYPTO
  if (qt === 'CURRENCY')       return MACRO_CLASS.CASH

  if (category) {
    if (/bond|fixed.income|treasury|government|sovereign|inflation|gilt|bund|btp|high.yield|credit|corporate debt/i.test(category)) return MACRO_CLASS.FIXED_INCOME
    if (/real estate|reit/i.test(category))                                                                                          return MACRO_CLASS.REAL_ESTATE
    if (/commodit|gold|silver|precious metal|energy|agricult|natural resource/i.test(category))                                      return MACRO_CLASS.COMMODITIES
    if (/money market|cash|ultrashort/i.test(category))                                                                              return MACRO_CLASS.CASH
    if (/alternative|hedge|arbitrage|market neutral|long.short|managed future/i.test(category))                                      return MACRO_CLASS.ALTERNATIVE
  }

  if (sector === 'real estate') return MACRO_CLASS.REAL_ESTATE

  if (/\b(bond|obbligaz|treasury|gilt|bund|btp|sovereign|fixed income)\b/i.test(name)) return MACRO_CLASS.FIXED_INCOME
  if (/\b(reit|real estate)\b/i.test(name))                                             return MACRO_CLASS.REAL_ESTATE
  if (/\b(gold|silver|commodity|commodit|materie prime)\b/i.test(name))                 return MACRO_CLASS.COMMODITIES
  if (/\b(crypto|bitcoin|ethereum|blockchain|digital asset)\b/i.test(name))             return MACRO_CLASS.CRYPTO

  if (['EQUITY', 'ETF', 'MUTUALFUND', 'INDEX'].includes(qt)) return MACRO_CLASS.EQUITY

  return MACRO_CLASS.ALTERNATIVE
}

// ---------------------------------------------------------------------------
// Symbol resolution
// ---------------------------------------------------------------------------

async function resolveSymbol(isin) {
  const results = await yahooFinance.search(isin, { quotesCount: 10, newsCount: 0 })
  const hits    = results.quotes?.filter(q => q.symbol) ?? []
  if (hits.length === 0) throw new Error(`No symbol found for ISIN ${isin}`)
  const eurHit  = hits.find(q => EUR_SUFFIXES.some(sfx => q.symbol.endsWith(sfx)))
  return (eurHit ?? hits[0]).symbol
}

// ---------------------------------------------------------------------------
// Quote builder
// ---------------------------------------------------------------------------

async function buildQuotePayload(isin) {
  const symbol = await resolveSymbol(isin)
  const [quote, summary] = await Promise.all([
    yahooFinance.quote(symbol),
    yahooFinance.quoteSummary(symbol, { modules: ['fundProfile'] }).catch(() => null),
  ])
  const { eurPrice, fxRate }          = await toEUR(quote.regularMarketPrice, quote.currency)
  const { eurPrice: eurPrevClose }    = await toEUR(quote.regularMarketPreviousClose, quote.currency)
  const eurChange    = eurPrice != null && eurPrevClose != null ? round(eurPrice - eurPrevClose, 4) : null
  const eurChangePct = eurPrevClose ? round((eurChange / eurPrevClose) * 100, 4) : null
  const expenseRatio = summary?.fundProfile?.feesExpensesInvestment?.annualReportExpenseRatio ?? null

  return {
    isin,
    symbol:          quote.symbol,
    name:            quote.longName || quote.shortName || symbol,
    price:           round(eurPrice, 4),
    previousClose:   round(eurPrevClose, 4),
    change:          eurChange,
    changePct:       eurChangePct,
    currency:        'EUR',
    rawPrice:        quote.regularMarketPrice,
    rawCurrency:     quote.currency,
    fxRate:          fxRate !== 1 ? round(fxRate, 6) : undefined,
    exchange:        quote.fullExchangeName,
    marketState:     quote.marketState,
    priceTimestamp:  quote.regularMarketTime ?? null,
    macroAssetClass: inferMacroAssetClass(quote),
    expenseRatio,
  }
}

// ---------------------------------------------------------------------------
// Finance routes (require auth — every call site lives behind login; keeping
// these open would let anyone use this server as an anonymous Yahoo Finance
// proxy, or fan out unbounded requests against it)
// ---------------------------------------------------------------------------

app.get('/api/quote/:isin', authenticate, financeLimiter, asyncRoute(async (req, res) => {
  const parsed = isinSchema.safeParse(req.params.isin)
  if (!parsed.success) return res.status(400).json({ error: 'invalid identifier format' })
  try {
    res.json(await buildQuotePayload(parsed.data))
  } catch (err) {
    req.log.warn({ err, isin: parsed.data }, 'quote lookup failed')
    res.status(404).json({ error: 'quote not found' })
  }
}))

app.post('/api/quotes', authenticate, financeLimiter, validateBody(quotesSchema), asyncRoute(async (req, res) => {
  const { isins } = req.body
  const results = await Promise.allSettled(isins.map(buildQuotePayload))
  res.json(results.map((r, i) => {
    if (r.status === 'fulfilled') return r.value
    req.log.warn({ err: r.reason, isin: isins[i] }, 'quote lookup failed')
    return { isin: isins[i], error: 'quote not found' }
  }))
}))

app.get('/api/search', authenticate, financeLimiter, validateQuery(searchQuerySchema), asyncRoute(async (req, res) => {
  const { q } = req.query
  if (q.length < 2) return res.json([])
  const data = await yahooFinance.search(q, { quotesCount: 10, newsCount: 0 })
  res.json((data.quotes || [])
    .filter(h => ['ETF', 'MUTUALFUND', 'EQUITY'].includes(h.quoteType))
    .map(h => ({
      symbol:    h.symbol,
      name:      h.longname || h.shortname || h.symbol,
      exchange:  h.exchDisp || h.exchange,
      quoteType: h.quoteType,
    })))
}))

app.get('/api/history/:isin', authenticate, financeLimiter, validateQuery(historyQuerySchema), asyncRoute(async (req, res) => {
  const parsedIsin = isinSchema.safeParse(req.params.isin)
  if (!parsedIsin.success) return res.status(400).json({ error: 'invalid identifier format' })
  const { period } = req.query
  try {
    const symbol = await resolveSymbol(parsedIsin.data)
    const result = await yahooFinance.chart(symbol, {
      period1:  periodToDate(period),
      interval: period.endsWith('d') ? '1d' : period === '1mo' ? '1d' : '1wk',
    })
    const rawCurrency = result.meta.currency
    const fxRate      = rawCurrency !== 'EUR' ? await eurTo(rawCurrency) : 1
    const convert     = v => v != null ? round(v / fxRate, 4) : null
    res.json({
      isin: parsedIsin.data, symbol, currency: 'EUR', rawCurrency,
      quotes: result.quotes.map(q => ({
        date:   q.date,
        open:   convert(q.open),
        high:   convert(q.high),
        low:    convert(q.low),
        close:  convert(q.close),
        volume: q.volume,
      })),
    })
  } catch (err) {
    req.log.warn({ err, isin: parsedIsin.data }, 'history lookup failed')
    res.status(404).json({ error: 'history not found' })
  }
}))

app.get('/api/rates', authenticate, financeLimiter, asyncRoute(async (_req, res) => {
  const pairs   = ['EURUSD=X', 'EURGBP=X', 'EURCHF=X', 'EURJPY=X']
  const results = await Promise.allSettled(pairs.map(p => yahooFinance.quote(p)))
  const rates   = {}
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      rates[pairs[i].replace('EUR', '').replace('=X', '')] = round(r.value.regularMarketPrice, 6)
    }
  })
  res.json({ base: 'EUR', rates, ts: new Date() })
}))

// ---------------------------------------------------------------------------
// Portfolio routes (protected — require valid JWT)
// ---------------------------------------------------------------------------

app.get('/api/portfolios', authenticate, asyncRoute(async (req, res) => {
  const { rows } = await pool.query(
    'SELECT * FROM portfolios WHERE user_id = $1 ORDER BY sort_order ASC, created_at ASC',
    [req.userId]
  )
  res.json(rows)
}))

app.patch('/api/portfolios/:id', authenticate, validateBody(portfolioNameSchema), asyncRoute(async (req, res) => {
  const { name } = req.body
  const { rows } = await pool.query(
    'UPDATE portfolios SET name = $1 WHERE id = $2 AND user_id = $3 RETURNING *',
    [name, req.params.id, req.userId]
  )
  if (rows.length === 0) return res.status(404).json({ error: 'portfolio not found' })
  res.json(rows[0])
}))

app.put('/api/portfolios/reorder', authenticate, validateBody(reorderSchema), asyncRoute(async (req, res) => {
  const { ids } = req.body
  await Promise.all(
    ids.map((id, index) =>
      pool.query(
        'UPDATE portfolios SET sort_order = $1 WHERE id = $2 AND user_id = $3',
        [index, id, req.userId]
      )
    )
  )
  res.status(204).end()
}))

app.post('/api/portfolios', authenticate, validateBody(portfolioNameSchema), asyncRoute(async (req, res) => {
  const { name } = req.body
  const { rows } = await pool.query(
    'INSERT INTO portfolios (user_id, name) VALUES ($1, $2) RETURNING *',
    [req.userId, name]
  )
  res.status(201).json(rows[0])
}))

app.delete('/api/portfolios/:id', authenticate, asyncRoute(async (req, res) => {
  await pool.query(
    'DELETE FROM portfolios WHERE id = $1 AND user_id = $2',
    [req.params.id, req.userId]
  )
  res.status(204).end()
}))

app.get('/api/portfolios/:id/assets', authenticate, asyncRoute(async (req, res) => {
  if (!await assertPortfolioOwner(req.params.id, req.userId, res)) return
  const { rows } = await pool.query(
    `SELECT pa.id, pa.portfolio_id, pa.isin, pa.quantity, pa.purchase_price_eur,
            pa.target_pct, pa.excluded, pa.added_at, pa.updated_at,
            i.name, i.ticker, i.exchange, i.quote_type, i.macro_asset_class
     FROM portfolio_assets pa
     JOIN instruments i ON i.isin = pa.isin
     WHERE pa.portfolio_id = $1
     ORDER BY pa.added_at`,
    [req.params.id]
  )
  res.json(rows)
}))

app.post('/api/portfolios/:id/assets', authenticate, validateBody(assetCreateSchema), asyncRoute(async (req, res) => {
  if (!await assertPortfolioOwner(req.params.id, req.userId, res)) return
  const { isin, name, ticker, exchange, quote_type, quantity, purchase_price_eur, target_pct } = req.body

  // Fetch full quote to classify macro asset class (best-effort, non-blocking)
  let macroAssetClass = null
  try {
    const symbol = ticker || await resolveSymbol(isin)
    const q = await yahooFinance.quote(symbol)
    macroAssetClass = inferMacroAssetClass(q)
  } catch { /* classification is best-effort */ }

  // Upsert instrument metadata (name/ticker live here, not in portfolio_assets)
  await pool.query(
    `INSERT INTO instruments (isin, name, ticker, exchange, quote_type, macro_asset_class, cached_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())
     ON CONFLICT (isin) DO UPDATE
       SET name              = EXCLUDED.name,
           ticker            = EXCLUDED.ticker,
           exchange          = EXCLUDED.exchange,
           quote_type        = EXCLUDED.quote_type,
           macro_asset_class = EXCLUDED.macro_asset_class,
           cached_at         = NOW()`,
    [isin, name ?? null, ticker ?? null, exchange ?? null, quote_type ?? null, macroAssetClass]
  )

  const { rows } = await pool.query(
    `INSERT INTO portfolio_assets (portfolio_id, isin, quantity, purchase_price_eur, target_pct)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [req.params.id, isin, quantity, purchase_price_eur ?? null, target_pct ?? 0]
  )
  res.status(201).json(rows[0])
}))

app.patch('/api/portfolios/:id/assets/:assetId', authenticate, validateBody(assetUpdateSchema), asyncRoute(async (req, res) => {
  if (!await assertPortfolioOwner(req.params.id, req.userId, res)) return
  const { quantity, purchase_price_eur, target_pct, excluded } = req.body
  const { rows } = await pool.query(
    `UPDATE portfolio_assets
     SET quantity           = COALESCE($1, quantity),
         purchase_price_eur = COALESCE($2, purchase_price_eur),
         target_pct         = COALESCE($3, target_pct),
         excluded           = COALESCE($4, excluded)
     WHERE id = $5 AND portfolio_id = $6
     RETURNING *`,
    [quantity ?? null, purchase_price_eur ?? null, target_pct ?? null, excluded ?? null, req.params.assetId, req.params.id]
  )
  if (rows.length === 0) return res.status(404).json({ error: 'asset not found' })
  res.json(rows[0])
}))

app.delete('/api/portfolios/:id/assets/:assetId', authenticate, asyncRoute(async (req, res) => {
  if (!await assertPortfolioOwner(req.params.id, req.userId, res)) return
  await pool.query(
    'DELETE FROM portfolio_assets WHERE id = $1 AND portfolio_id = $2',
    [req.params.assetId, req.params.id]
  )
  res.status(204).end()
}))

// ---------------------------------------------------------------------------
// Health & error handler
// ---------------------------------------------------------------------------

app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1')
    res.json({ status: 'ok', ts: new Date() })
  } catch (err) {
    res.status(503).json({ status: 'error', error: err.message, ts: new Date() })
  }
})

app.use((err, req, res, _next) => {
  (req.log ?? logger).error({ err }, 'unhandled error')
  res.status(500).json({ error: 'internal server error' })
})

// Run idempotent schema migrations before accepting connections
async function migrate() {
  await pool.query(`
    ALTER TABLE portfolios
      ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0
  `)
}

async function cleanupExpiredSessions() {
  try {
    const { rowCount } = await pool.query('DELETE FROM sessions WHERE expires_at < NOW()')
    if (rowCount > 0) logger.info({ rowCount }, 'removed expired sessions')
  } catch (err) {
    logger.error({ err }, 'failed to purge expired sessions')
  }
}

app.listen(PORT, async () => {
  await migrate()
  await cleanupExpiredSessions()
  setInterval(cleanupExpiredSessions, SESSION_CLEANUP_INTERVAL_MS)
  logger.info({ port: PORT }, 'BEFF listening')
})

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function periodToDate(period) {
  const now = new Date()
  const map = { '1d': 1, '5d': 5, '1mo': 30, '3mo': 90, '6mo': 180, '1y': 365, '2y': 730, '5y': 1825 }
  return new Date(now.setDate(now.getDate() - (map[period] ?? 180)))
}
