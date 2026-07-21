import { useState, useCallback } from 'react'
import { fetchQuotes, fetchRates } from '../api'

export function usePrices({ holdingsRef }) {
  const [livePrices,      setLivePrices]      = useState({})
  const [fxRates,         setFxRates]         = useState({})
  const [refreshing,      setRefreshing]      = useState(false)
  const [pricesAttempted, setPricesAttempted] = useState(false)

  const refreshPrices = useCallback(async (h) => {
    const list = h ?? holdingsRef.current
    if (list.length === 0) return
    setRefreshing(true)
    try {
      const [results, ratesData] = await Promise.all([
        fetchQuotes(list.map(x => x.isin)),
        fetchRates().catch(() => null),
      ])
      const map = {}
      results.forEach(r => { if (!r.error) map[r.isin] = r })
      setLivePrices(prev => ({ ...prev, ...map }))
      if (ratesData?.rates) setFxRates(ratesData.rates)
    } catch {}
    setRefreshing(false)
    setPricesAttempted(true)
  }, [])

  function clearPrices() {
    setLivePrices({})
    setFxRates({})
    setPricesAttempted(false)
  }

  return { livePrices, fxRates, refreshing, pricesAttempted, refreshPrices, clearPrices }
}
