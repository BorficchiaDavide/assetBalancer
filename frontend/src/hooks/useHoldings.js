import { useState, useRef, useCallback } from 'react'
import { AuthError, fetchPortfolioAssets, addPortfolioAsset, updatePortfolioAsset, removePortfolioAsset } from '../api'

export function assetToHolding(a) {
  return {
    dbId:            a.id,
    isin:            a.isin,
    name:            a.name     || null,
    ticker:          a.ticker   || null,
    exchange:        a.exchange || null,
    quantity:        parseFloat(a.quantity),
    avgPrice:        parseFloat(a.purchase_price_eur) || 0,
    targetPct:       parseFloat(a.target_pct)         || 0,
    excluded:        Boolean(a.excluded),
    macroAssetClass: a.macro_asset_class || null,
  }
}

export function useHoldings({ portfolioIdRef, onAuthError }) {
  const [holdings, setHoldingsState] = useState([])
  const holdingsRef  = useRef([])
  const assetsCache  = useRef(new Map())

  function setHoldingsRaw(h) {
    holdingsRef.current = h
    setHoldingsState(h)
  }

  async function loadHoldingsForPortfolio(id) {
    const cached = assetsCache.current.get(id)
    if (cached) {
      setHoldingsRaw(cached)
      return cached
    }
    setHoldingsRaw([])
    const assets = await fetchPortfolioAssets(id)
    const h = assets.map(assetToHolding)
    assetsCache.current.set(id, h)
    setHoldingsRaw(h)
    return h
  }

  function clearHoldings() {
    holdingsRef.current = []
    setHoldingsState([])
    assetsCache.current.clear()
  }

  function clearCacheForPortfolio(id) {
    assetsCache.current.delete(id)
  }

  const setHoldings = useCallback(async (newHoldings) => {
    const prev = holdingsRef.current
    setHoldingsRaw(newHoldings)
    const pid = portfolioIdRef.current
    if (pid) assetsCache.current.set(pid, newHoldings)
    if (!pid) return

    try {
      const added   = newHoldings.filter(n => !prev.find(o => o.isin === n.isin))
      const removed = prev.filter(o => !newHoldings.find(n => n.isin === o.isin))
      const updated = newHoldings.filter(n => {
        const o = prev.find(x => x.isin === n.isin)
        return o && n.dbId && (
          String(o.quantity)  !== String(n.quantity)  ||
          String(o.avgPrice)  !== String(n.avgPrice)  ||
          String(o.targetPct) !== String(n.targetPct) ||
          Boolean(o.excluded) !== Boolean(n.excluded)
        )
      })

      const [addedResults] = await Promise.all([
        Promise.all(added.map(h => addPortfolioAsset(pid, h))),
        Promise.all(removed.map(h => h.dbId ? removePortfolioAsset(pid, h.dbId) : null)),
        Promise.all(updated.map(h => updatePortfolioAsset(pid, h.dbId, h))),
      ])

      if (addedResults.length > 0) {
        setHoldingsState(prev => prev.map(h => {
          const idx = added.findIndex(a => a.isin === h.isin)
          return idx !== -1 ? { ...h, dbId: addedResults[idx].id } : h
        }))
      }
    } catch (e) {
      if (e instanceof AuthError) onAuthError()
      else console.error('Backend sync failed:', e)
    }
  }, [])

  return { holdings, holdingsRef, setHoldings, setHoldingsRaw, loadHoldingsForPortfolio, clearHoldings, clearCacheForPortfolio, assetsCache }
}
