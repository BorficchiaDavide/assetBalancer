import { useState, useEffect } from 'react'
import { STRINGS } from './i18n'
import { AuthError } from './api'
import { Icon } from './components/Icon'
import { Topbar } from './components/Topbar'
import { NewPortfolioModal } from './components/NewPortfolioModal'
import { Login } from './screens/Login'
import { Onboarding } from './screens/Onboarding'
import { Dashboard } from './screens/Dashboard'
import { RebalanceScreen } from './screens/Rebalance'
import { DetailScreen } from './screens/Detail'
import { Settings } from './screens/Settings'
import { usePrefs } from './hooks/usePrefs'
import { useAuth } from './hooks/useAuth'
import { usePortfolios } from './hooks/usePortfolios'
import { useHoldings } from './hooks/useHoldings'
import { usePrices } from './hooks/usePrices'

export default function App() {
  const { lang, setLang, theme, setTheme, currency, setCurrency, density, setDensity, pnlColor, setPnlColor } = usePrefs()

  const [route, setRoute] = useState('loading')
  const [tab,   setTab]   = useState('portfolio')
  const [detail, setDetail] = useState(null)
  const [creatingPortfolio, setCreatingPortfolio] = useState(false)

  const { user, clearUser, handleLogin, handleLogout, handleRestoreSession } = useAuth()

  const { portfolios, portfolioId, portfolioIdRef, setCurrentPortfolio, loadPortfolios, clearPortfolios, handleRenamePortfolio, handleReorderPortfolios, handleCreatePortfolio, handleDeletePortfolio } = usePortfolios({ onAuthError: goToLogin })

  const { holdings, holdingsRef, setHoldings, setHoldingsRaw, loadHoldingsForPortfolio, clearHoldings, clearCacheForPortfolio } = useHoldings({ portfolioIdRef, onAuthError: goToLogin })

  const { livePrices, fxRates, refreshing, pricesAttempted, refreshPrices, clearPrices } = usePrices({ holdingsRef })

  const t = STRINGS[lang]

  // -------------------------------------------------------------------------
  // Init — restore session on page load
  // -------------------------------------------------------------------------

  useEffect(() => {
    async function init() {
      const restoredUser = await handleRestoreSession()
      if (!restoredUser) { setRoute('login'); return }
      await loadPortfolioFlow()
    }
    init()
  }, [])

  useEffect(() => {
    if (holdings.length > 0) refreshPrices(holdings)
  }, [holdings.length])

  // -------------------------------------------------------------------------
  // Portfolio loading flow
  // -------------------------------------------------------------------------

  async function loadPortfolioFlow() {
    try {
      const all = await loadPortfolios()
      const portfolio = all[0]
      if (!portfolio) { setRoute('onboard'); return }

      setCurrentPortfolio(portfolio.id)
      const h = await loadHoldingsForPortfolio(portfolio.id)
      if (h.length === 0) { setRoute('onboard'); return }

      setRoute('app')
    } catch (e) {
      if (e instanceof AuthError) { goToLogin(); return }
      setRoute('onboard')
    }
  }

  async function switchPortfolio(id) {
    if (id === portfolioIdRef.current) return
    setCurrentPortfolio(id)
    setDetail(null)
    setTab('portfolio')
    clearPrices()

    try {
      const h = await loadHoldingsForPortfolio(id)
      if (h.length > 0) refreshPrices(h)
    } catch (e) {
      if (e instanceof AuthError) goToLogin()
    }
  }

  // -------------------------------------------------------------------------
  // Auth handlers
  // -------------------------------------------------------------------------

  function goToLogin() {
    clearUser()
    clearHoldings()
    clearPortfolios()
    clearPrices()
    setRoute('login')
  }

  const onLogin = async (mode, email, password, displayName) => {
    await handleLogin(mode, email, password, displayName)
    await loadPortfolioFlow()
  }

  const onSignOut = async () => {
    await handleLogout()
    goToLogin()
  }

  // -------------------------------------------------------------------------
  // Onboarding handlers
  // -------------------------------------------------------------------------

  const handleFinishOnboard = async (h) => {
    let pid = portfolioIdRef.current
    if (!pid) {
      try {
        const portfolio = await handleCreatePortfolio('Il mio portafoglio')
        pid = portfolio.id
      } catch (e) {
        if (e instanceof AuthError) { goToLogin(); return }
        throw e
      }
    }
    await setHoldings(h)
    setRoute('app')
    setTab('portfolio')
  }

  const onDeletePortfolio = async (id) => {
    try {
      const remaining = await handleDeletePortfolio(id)
      clearHoldings()
      clearPrices()
      if (remaining.length === 0) {
        setRoute('onboard')
      } else {
        const next = remaining[0]
        setCurrentPortfolio(next.id)
        setDetail(null)
        setTab('portfolio')
        const h = await loadHoldingsForPortfolio(next.id)
        if (h.length > 0) refreshPrices(h)
        setRoute('app')
      }
    } catch (e) {
      if (e instanceof AuthError) goToLogin()
    }
  }

  // -------------------------------------------------------------------------
  // New portfolio handler
  // -------------------------------------------------------------------------

  async function onNewPortfolio(name) {
    try {
      await handleCreatePortfolio(name)
      setDetail(null)
      setTab('portfolio')
      clearPrices()
      setHoldingsRaw([])
      setCreatingPortfolio(false)
    } catch (e) {
      if (e instanceof AuthError) goToLogin()
    }
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  if (route === 'loading') {
    return (
      <div className="app" data-theme={theme} style={{ minHeight: '100%', display: 'grid', placeItems: 'center' }}>
        <Icon name="refresh" size={28} style={{ opacity: 0.4 }} />
      </div>
    )
  }

  if (route === 'login') {
    return (
      <div className="app" data-theme={theme} data-density={density} data-pnl-color={pnlColor} style={{ minHeight: '100%' }}>
        <Login t={t} onLogin={onLogin} lang={lang} setLang={setLang} />
      </div>
    )
  }

  if (route === 'onboard') {
    return (
      <div className="app" data-theme={theme} data-density={density} data-pnl-color={pnlColor} style={{ minHeight: '100%' }}>
        <Onboarding t={t} currency={currency} onFinish={handleFinishOnboard} />
      </div>
    )
  }

  return (
    <div className="app" data-theme={theme} data-density={density} data-pnl-color={pnlColor} style={{ minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
      <Topbar
        t={t} user={user}
        lang={lang} setLang={setLang}
        theme={theme} setTheme={setTheme}
        tab={detail ? '' : tab}
        setTab={v => { setTab(v); setDetail(null) }}
        onSignOut={onSignOut}
        onSettings={() => { setTab('settings'); setDetail(null) }}
      />

      <div style={{ flex: 1 }}>
        {detail ? (
          <DetailScreen
            t={t} isin={detail}
            holdings={holdings} setHoldings={setHoldings}
            currency={currency}
            livePrices={livePrices} fxRates={fxRates}
            pricesAttempted={pricesAttempted}
            onBack={() => setDetail(null)}
          />
        ) : tab === 'portfolio' ? (
          <Dashboard
            t={t} lang={lang}
            holdings={holdings} setHoldings={setHoldings}
            currency={currency}
            livePrices={livePrices} fxRates={fxRates}
            pricesAttempted={pricesAttempted}
            refreshing={refreshing}
            onRefresh={() => refreshPrices()}
            onView={isin => setDetail(isin)}
            onGoRebalance={() => setTab('rebalance')}
            portfolios={portfolios}
            portfolioId={portfolioId}
            onSwitchPortfolio={switchPortfolio}
            onRenamePortfolio={handleRenamePortfolio}
            onReorderPortfolios={handleReorderPortfolios}
            onNewPortfolio={() => setCreatingPortfolio(true)}
          />
        ) : tab === 'rebalance' ? (
          <RebalanceScreen
            t={t}
            holdings={holdings}
            setHoldings={setHoldings}
            currency={currency}
            livePrices={livePrices} fxRates={fxRates}
            pricesAttempted={pricesAttempted}
            onBack={() => setTab('portfolio')}
          />
        ) : (
          <Settings
            t={t}
            user={user}
            theme={theme}    setTheme={setTheme}
            lang={lang}      setLang={setLang}
            currency={currency} setCurrency={setCurrency}
            density={density}   setDensity={setDensity}
            pnlColor={pnlColor} setPnlColor={setPnlColor}
            portfolios={portfolios}
            onDeletePortfolio={onDeletePortfolio}
          />
        )}
      </div>

      {creatingPortfolio && (
        <NewPortfolioModal
          t={t}
          onClose={() => setCreatingPortfolio(false)}
          onCreate={onNewPortfolio}
        />
      )}
    </div>
  )
}
