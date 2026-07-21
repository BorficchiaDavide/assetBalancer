const BASE = import.meta.env.VITE_API_BASE ?? ''

// ---------------------------------------------------------------------------
// Token management
// ---------------------------------------------------------------------------

// Access token lives only in memory — lost on page reload (intentional)
let _accessToken = null

function getRefreshToken() {
  try { return localStorage.getItem('ab_rt') || null } catch { return null }
}
function saveRefreshToken(t) {
  try { localStorage.setItem('ab_rt', t) } catch {}
}
function saveUser(u) {
  try { localStorage.setItem('ab_user', JSON.stringify(u)) } catch {}
}
function loadUser() {
  try { return JSON.parse(localStorage.getItem('ab_user')) } catch { return null }
}
function clearSession() {
  _accessToken = null
  try { localStorage.removeItem('ab_rt'); localStorage.removeItem('ab_user') } catch {}
}

export class AuthError extends Error {}

// ---------------------------------------------------------------------------
// Core fetch wrapper — auto-refreshes on 401
// ---------------------------------------------------------------------------

async function request(method, path, body) {
  const makeHeaders = () => {
    const h = {}
    if (body != null) h['Content-Type'] = 'application/json'
    if (_accessToken)  h['Authorization'] = `Bearer ${_accessToken}`
    return h
  }

  const doFetch = () => fetch(`${BASE}${path}`, {
    method,
    headers: makeHeaders(),
    body: body != null ? JSON.stringify(body) : undefined,
  })

  let res = await doFetch()

  // On 401: attempt a single silent token refresh, then retry
  if (res.status === 401) {
    const rt = getRefreshToken()
    if (rt) {
      const r2 = await fetch(`${BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: rt }),
      })
      if (r2.ok) {
        const refreshData = await r2.json()
        _accessToken = refreshData.accessToken
        if (refreshData.refreshToken) saveRefreshToken(refreshData.refreshToken)
        res = await doFetch()
      } else {
        clearSession()
        throw new AuthError('Sessione scaduta — effettua di nuovo il login')
      }
    } else {
      throw new AuthError('Non autenticato')
    }
  }

  if (res.status === 204) return null
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || `${res.status} ${res.statusText}`)
  }
  return res.json()
}

const get   = path        => request('GET',    path, null)
const post  = (path, b)  => request('POST',   path, b)
const patch = (path, b)  => request('PATCH',  path, b)
const del   = path        => request('DELETE', path, null)

// ---------------------------------------------------------------------------
// Auth API
// ---------------------------------------------------------------------------

export async function register(email, password, display_name) {
  const data = await post('/auth/register', { email, password, display_name })
  _accessToken = data.accessToken
  saveRefreshToken(data.refreshToken)
  saveUser(data.user)
  return data.user
}

export async function login(email, password) {
  const data = await post('/auth/login', { email, password })
  _accessToken = data.accessToken
  saveRefreshToken(data.refreshToken)
  saveUser(data.user)
  return data.user
}

export async function logout() {
  const rt = getRefreshToken()
  try { await post('/auth/logout', { refreshToken: rt }) } catch {}
  clearSession()
}

export async function changePassword(currentPassword, newPassword) {
  await patch('/auth/password', { currentPassword, newPassword })
}

// Restores a previous session from the stored refresh token.
// Returns the user object on success, null if no valid session exists.
export async function restoreSession() {
  const rt = getRefreshToken()
  if (!rt) return null
  try {
    const r = await fetch(`${BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: rt }),
    })
    if (!r.ok) { clearSession(); return null }
    const refreshData = await r.json()
    _accessToken = refreshData.accessToken
    if (refreshData.refreshToken) saveRefreshToken(refreshData.refreshToken)
    const user = await get('/auth/me')
    saveUser(user)
    return user
  } catch {
    clearSession()
    return null
  }
}

// ---------------------------------------------------------------------------
// Finance API (public — no auth required)
// ---------------------------------------------------------------------------

export async function fetchQuote(isin) {
  return get(`/api/quote/${encodeURIComponent(isin)}`)
}

export async function fetchQuotes(isins) {
  return post('/api/quotes', { isins })
}

export async function searchETF(query) {
  if (!query || query.length < 2) return []
  return get(`/api/search?q=${encodeURIComponent(query)}`)
}

export async function fetchHistory(isin, period = '6mo') {
  return get(`/api/history/${encodeURIComponent(isin)}?period=${period}`)
}

export async function fetchRates() {
  return get('/api/rates')
}

export async function ping() {
  try { await get('/health'); return true } catch { return false }
}

// ---------------------------------------------------------------------------
// Portfolio API (requires auth)
// ---------------------------------------------------------------------------

export async function fetchPortfolios() {
  return get('/api/portfolios')
}

export async function createPortfolio(name) {
  return post('/api/portfolios', { name })
}

export async function renamePortfolio(id, name) {
  return patch(`/api/portfolios/${id}`, { name })
}

export async function reorderPortfolios(ids) {
  return request('PUT', '/api/portfolios/reorder', { ids })
}

export async function deletePortfolio(id) {
  return del(`/api/portfolios/${id}`)
}

export async function fetchPortfolioAssets(portfolioId) {
  return get(`/api/portfolios/${portfolioId}/assets`)
}

export async function addPortfolioAsset(portfolioId, holding) {
  return post(`/api/portfolios/${portfolioId}/assets`, {
    isin:               holding.isin,
    name:               holding.name       ?? null,
    ticker:             holding.ticker     ?? null,
    exchange:           holding.exchange   ?? null,
    quote_type:         holding.quote_type ?? null,
    quantity:           holding.quantity,
    purchase_price_eur: holding.avgPrice   ?? null,
    target_pct:         holding.targetPct  ?? 0,
  })
}

export async function updatePortfolioAsset(portfolioId, assetId, holding) {
  return patch(`/api/portfolios/${portfolioId}/assets/${assetId}`, {
    quantity:           holding.quantity,
    purchase_price_eur: holding.avgPrice  ?? null,
    target_pct:         holding.targetPct ?? 0,
    excluded:           holding.excluded  ?? false,
  })
}

export async function removePortfolioAsset(portfolioId, assetId) {
  return del(`/api/portfolios/${portfolioId}/assets/${assetId}`)
}
