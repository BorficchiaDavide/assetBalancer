import { useState, useRef } from 'react'
import { AuthError, fetchPortfolios, createPortfolio, renamePortfolio, reorderPortfolios, deletePortfolio } from '../api'

const LAST_PORTFOLIO_KEY = 'assetbalancer_last_portfolio_id'

function loadLastPortfolioId() {
  try {
    const raw = localStorage.getItem(LAST_PORTFOLIO_KEY)
    return raw ? Number(raw) : null
  } catch { return null }
}

function saveLastPortfolioId(id) {
  try { localStorage.setItem(LAST_PORTFOLIO_KEY, String(id)) } catch {}
}

function clearLastPortfolioId() {
  try { localStorage.removeItem(LAST_PORTFOLIO_KEY) } catch {}
}

export function usePortfolios({ onAuthError }) {
  const [portfolios,  setPortfolios]  = useState([])
  const [portfolioId, setPortfolioId] = useState(null)
  const portfolioIdRef = useRef(null)

  function setCurrentPortfolio(id) {
    portfolioIdRef.current = id
    setPortfolioId(id)
    if (id) saveLastPortfolioId(id)
  }

  // Picks which portfolio should be active after (re)loading the list:
  // whichever the user had open last, falling back to the first one.
  function pickInitialPortfolio(all) {
    if (all.length === 0) return null
    const lastId = loadLastPortfolioId()
    return all.find(p => p.id === lastId) || all[0]
  }

  async function loadPortfolios() {
    const all = await fetchPortfolios()
    setPortfolios(all)
    return all
  }

  async function handleRenamePortfolio(id, name) {
    try {
      const updated = await renamePortfolio(id, name)
      setPortfolios(prev => prev.map(p => p.id === id ? { ...p, name: updated.name } : p))
    } catch (e) {
      if (e instanceof AuthError) onAuthError()
    }
  }

  async function handleReorderPortfolios(ids) {
    setPortfolios(prev => ids.map(id => prev.find(p => p.id === id)).filter(Boolean))
    try {
      await reorderPortfolios(ids)
    } catch (e) {
      if (e instanceof AuthError) onAuthError()
    }
  }

  async function handleCreatePortfolio(name) {
    const p = await createPortfolio(name)
    setPortfolios(prev => [...prev, p])
    setCurrentPortfolio(p.id)
    return p
  }

  async function handleDeletePortfolio(id) {
    await deletePortfolio(id)
    const remaining = portfolios.filter(p => p.id !== id)
    setPortfolios(remaining)
    return remaining
  }

  function clearPortfolios() {
    setPortfolios([])
    setPortfolioId(null)
    portfolioIdRef.current = null
    clearLastPortfolioId()
  }

  return {
    portfolios, portfolioId, portfolioIdRef,
    setCurrentPortfolio, pickInitialPortfolio, loadPortfolios, clearPortfolios,
    handleRenamePortfolio, handleReorderPortfolios, handleCreatePortfolio, handleDeletePortfolio,
  }
}
