import { useState, useRef } from 'react'
import { AuthError, fetchPortfolios, createPortfolio, renamePortfolio, reorderPortfolios, deletePortfolio } from '../api'

export function usePortfolios({ onAuthError }) {
  const [portfolios,  setPortfolios]  = useState([])
  const [portfolioId, setPortfolioId] = useState(null)
  const portfolioIdRef = useRef(null)

  function setCurrentPortfolio(id) {
    portfolioIdRef.current = id
    setPortfolioId(id)
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
  }

  return {
    portfolios, portfolioId, portfolioIdRef,
    setCurrentPortfolio, loadPortfolios, clearPortfolios,
    handleRenamePortfolio, handleReorderPortfolios, handleCreatePortfolio, handleDeletePortfolio,
  }
}
