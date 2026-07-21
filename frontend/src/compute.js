import { PALETTE, MACRO_CLASS_COLORS } from './constants'
import { fxRate } from './format'

export function groupByMacroClass(active) {
  const groups = {}
  for (const e of active) {
    const cls = e.macroAssetClass || 'Equity'
    if (!groups[cls]) groups[cls] = { cls, color: MACRO_CLASS_COLORS[cls] || '#888', assets: [], totalValue: 0 }
    groups[cls].assets.push(e)
    groups[cls].totalValue += e.value
  }
  const total = active.reduce((s, e) => s + e.value, 0)
  return Object.values(groups)
    .map(g => ({ ...g, weight: total > 0 ? (g.totalValue / total) * 100 : 0 }))
    .sort((a, b) => b.totalValue - a.totalValue)
}

export function computeHoldings(holdings, displayCurrency = "EUR", livePrices = {}, fxRates = {}, pricesAttempted = true) {
  let totalValue = 0
  let totalCost = 0
  let allocationBase = 0
  const enriched = holdings.map((h, i) => {
    const live = livePrices[h.isin]
    const rawPrice    = pricesAttempted ? (live?.price ?? h.avgPrice) : 0
    const rawCurrency = live?.currency ?? "EUR"
    const resolvedName   = live?.name   ?? h.name   ?? h.isin
    const resolvedTicker = live?.symbol ?? h.ticker ?? "—"
    const liveMeta = { name: resolvedName, ticker: resolvedTicker, exchange: h.exchange ?? live?.exchange }
    const fx = fxRate(rawCurrency, displayCurrency, fxRates)
    const price    = rawPrice    * fx
    const avgPrice = h.avgPrice  * fx
    const value    = price    * h.quantity
    const cost     = pricesAttempted ? avgPrice * h.quantity : 0
    totalValue += value
    totalCost  += cost
    if (!h.excluded) allocationBase += value
    const macroAssetClass = live?.macroAssetClass ?? h.macroAssetClass ?? null
    return {
      ...h,
      meta: liveMeta,
      macroAssetClass,
      color: MACRO_CLASS_COLORS[macroAssetClass] ?? PALETTE[i % PALETTE.length],
      price,
      avgPrice,
      value,
      cost,
      pnlAbs: value - cost,
      pnlPct: cost > 0 ? ((value - cost) / cost) * 100 : 0,
    }
  })
  enriched.forEach(e => {
    e.weight    = totalValue > 0 ? (e.value / totalValue) * 100 : 0
    e.targetPct = e.targetPct || 0
    if (e.excluded) {
      e.allocWeight = 0
      e.drift       = 0
    } else {
      e.allocWeight = allocationBase > 0 ? (e.value / allocationBase) * 100 : 0
      e.drift       = pricesAttempted ? e.allocWeight - e.targetPct : 0
    }
  })
  const totalPnL    = totalValue - totalCost
  const totalPnLPct = totalCost > 0 ? (totalPnL / totalCost) * 100 : 0
  const totalDrift  = enriched.filter(e => !e.excluded).reduce((s, e) => s + Math.abs(e.drift), 0) / 2
  return { enriched, totalValue, totalCost, totalPnL, totalPnLPct, totalDrift, allocationBase }
}

export function computeRebalance(enriched, _totalValue, newCapital = 0) {
  const active          = enriched.filter(e => !e.excluded)
  const allocationBase  = active.reduce((s, e) => s + e.value, 0)
  const newTotal        = allocationBase + newCapital
  return active.map(e => {
    const targetValue  = (e.targetPct / 100) * newTotal
    const deltaValue   = targetValue - e.value
    const deltaShares  = e.price > 0 ? deltaValue / e.price : 0
    let action = "hold"
    if (Math.abs(deltaValue) > Math.max(5, allocationBase * 0.001)) {
      action = deltaValue > 0 ? "buy" : "sell"
    }
    return { ...e, targetValue, deltaValue, deltaShares, action }
  })
}

export function donutSlices(enriched) {
  const r = 56
  const cx = 80, cy = 80
  let acc = 0
  return enriched.filter(e => e.weight > 0).map(e => {
    const start = acc
    const end   = acc + e.weight / 100
    acc = end
    const a0    = start * Math.PI * 2 - Math.PI / 2
    const a1    = end   * Math.PI * 2 - Math.PI / 2
    const large = end - start > 0.5 ? 1 : 0
    const x0 = cx + r * Math.cos(a0)
    const y0 = cy + r * Math.sin(a0)
    const x1 = cx + r * Math.cos(a1)
    const y1 = cy + r * Math.sin(a1)
    return {
      d: `M ${cx} ${cy} L ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} Z`,
      color: e.color,
      isin:  e.isin,
    }
  })
}
