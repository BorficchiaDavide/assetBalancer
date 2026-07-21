import { useMemo, useState, useEffect } from 'react'
import { Icon } from '../components/Icon'
import { computeHoldings } from '../compute'
import { formatMoney, formatPct, formatQty } from '../format'
import { fetchHistory } from '../api'

const PERIODS = [
  { label: '1M', value: '1mo' },
  { label: '3M', value: '3mo' },
  { label: '6M', value: '6mo' },
  { label: '1Y', value: '1y' },
  { label: '2Y', value: '2y' },
]

export function DetailScreen({ t, isin, holdings, setHoldings, currency, livePrices = {}, fxRates = {}, pricesAttempted = false, onBack }) {
  const { enriched } = computeHoldings(holdings, currency, livePrices, fxRates, pricesAttempted)
  const e = enriched.find(x => x.isin === isin)
  if (!e) return null

  const [period, setPeriod] = useState('6mo')
  const [history, setHistory] = useState(null)
  const [loadingChart, setLoadingChart] = useState(false)
  const [chartError, setChartError] = useState(null)

  useEffect(() => {
    let cancelled = false
    setLoadingChart(true)
    setChartError(null)
    fetchHistory(isin, period)
      .then(data => { if (!cancelled) setHistory(data) })
      .catch(err => { if (!cancelled) setChartError(err.message) })
      .finally(() => { if (!cancelled) setLoadingChart(false) })
    return () => { cancelled = true }
  }, [isin, period])

  const points = useMemo(() => {
    if (!history?.quotes?.length) return []
    return history.quotes
      .filter(q => q.close != null)
      .map(q => q.close)
  }, [history])

  const chartContent = useMemo(() => {
    if (points.length < 2) return null
    const min = Math.min(...points)
    const max = Math.max(...points)
    const range = max - min || 1
    const path = points.map((p, i) => {
      const x = (i / (points.length - 1)) * 100
      const y = 100 - ((p - min) / range) * 100
      return `${i === 0 ? 'M' : 'L'} ${x} ${y}`
    }).join(' ')
    const isUp = points[points.length - 1] >= points[0]
    const color = isUp ? 'var(--green, #22c55e)' : 'var(--red, #ef4444)'
    return { path, color, min, max }
  }, [points])

  const periodChange = useMemo(() => {
    if (points.length < 2) return null
    const first = points[0], last = points[points.length - 1]
    return { abs: last - first, pct: ((last - first) / first) * 100 }
  }, [points])

  return (
    <div style={{ padding: '28px 32px 80px', maxWidth: 1000, margin: '0 auto' }}>
      <button className="btn btn-ghost btn-sm" onClick={onBack} style={{ marginBottom: 16 }}>
        <Icon name="chevronLeft" size={14} /> {t.dashboard}
      </button>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28 }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <div style={{ width: 14, height: 56, borderRadius: 4, background: e.color }} />
          <div>
            <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 4 }} className="mono">{e.isin}</div>
            <h1 style={{ margin: 0, fontSize: 28, fontWeight: 600, letterSpacing: '-0.03em' }}>{e.meta.name}</h1>
            <div style={{ marginTop: 6 }}>
              <span className="pill">{e.meta.category}</span>
            </div>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 32, fontWeight: 600, letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums' }}>
            {formatMoney(e.value, currency)}
          </div>
          <div className={e.pnlAbs >= 0 ? 'pnl-pos' : 'pnl-neg'} style={{ fontSize: 14, fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>
            {formatMoney(e.pnlAbs, currency)} · {formatPct(e.pnlPct)}
          </div>
        </div>
      </div>

      <div className="detail-grid">
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-2)' }}>
              {t.performance}
              {periodChange && (
                <span
                  className={periodChange.pct >= 0 ? 'pnl-pos' : 'pnl-neg'}
                  style={{ marginLeft: 10, fontVariantNumeric: 'tabular-nums' }}
                >
                  {periodChange.pct >= 0 ? '+' : ''}{periodChange.pct.toFixed(2)}%
                </span>
              )}
            </div>
            <div className="toggle">
              {PERIODS.map(p => (
                <button
                  key={p.value}
                  className={period === p.value ? 'active' : ''}
                  onClick={() => setPeriod(p.value)}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ width: '100%', height: 220, display: 'block' }}>
            {loadingChart && (
              <text x="50" y="50" textAnchor="middle" fill="var(--text-3)" fontSize="5">...</text>
            )}
            {!loadingChart && chartError && (
              <text x="50" y="50" textAnchor="middle" fill="var(--text-3)" fontSize="4">{chartError}</text>
            )}
            {!loadingChart && chartContent && (
              <>
                <defs>
                  <linearGradient id={`g-${e.isin}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={chartContent.color} stopOpacity="0.18" />
                    <stop offset="100%" stopColor={chartContent.color} stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path d={`${chartContent.path} L 100 100 L 0 100 Z`} fill={`url(#g-${e.isin})`} />
                <path d={chartContent.path} fill="none" stroke={chartContent.color} strokeWidth="0.6" vectorEffect="non-scaling-stroke" />
              </>
            )}
          </svg>

          {e.excluded ? (
            <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)', fontSize: 13, color: 'var(--text-3)' }}>
              {t.excluded_badge} — {t.exclude_from_alloc}
            </div>
          ) : (
            <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-2)', marginBottom: 8 }}>{t.composition}</div>
              <div className="bar-track" style={{ marginTop: 12 }}>
                <div className="bar-actual" style={{ width: `${Math.min(100, e.allocWeight)}%`, background: e.color }} />
                <div className="bar-target" style={{ left: `${Math.min(100, e.targetPct)}%` }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 12, color: 'var(--text-2)', fontVariantNumeric: 'tabular-nums' }}>
                <span>{t.current}: <strong style={{ color: 'var(--text)' }}>{e.allocWeight.toFixed(2)}%</strong></span>
                <span>{t.target}: <strong style={{ color: 'var(--text)' }}>{e.targetPct}%</strong></span>
                <span>{t.delta}: <strong style={{ color: Math.abs(e.drift) > 1 ? 'var(--text)' : 'var(--text-3)' }}>{e.drift > 0 ? '+' : ''}{e.drift.toFixed(2)}%</strong></span>
              </div>
            </div>
          )}
        </div>

        <div>
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-2)', marginBottom: 12 }}>{t.overview}</div>
            <div className="stat-row"><span className="k">{t.qty}</span><span className="v">{formatQty(e.quantity)}</span></div>
            <div className="stat-row"><span className="k">{t.market_price}</span><span className="v">{formatMoney(e.price, currency)}</span></div>
            <div className="stat-row"><span className="k">{t.avg_load}</span><span className="v">{formatMoney(e.avgPrice, currency)}</span></div>
            <div className="stat-row"><span className="k">{t.market_value}</span><span className="v">{formatMoney(e.value, currency)}</span></div>
            <div className="stat-row"><span className="k">{t.total_cost}</span><span className="v">{formatMoney(e.cost, currency)}</span></div>
            <div className="stat-row">
              <span className="k">{e.pnlAbs >= 0 ? t.profit : t.loss}</span>
              <span className={`v ${e.pnlAbs >= 0 ? 'pnl-pos' : 'pnl-neg'}`}>
                {formatMoney(e.pnlAbs, currency)} · {formatPct(e.pnlPct)}
              </span>
            </div>
            <div className="stat-row"><span className="k">{t.weight}</span><span className="v">{e.weight.toFixed(2)}% {t.of_portfolio}</span></div>
          </div>
          <button
            className="btn btn-block"
            style={{ marginBottom: 10 }}
            onClick={() => setHoldings(holdings.map(h => h.isin === isin ? { ...h, excluded: !h.excluded } : h))}
          >
            <Icon name={e.excluded ? 'check' : 'minus'} size={14} />
            {e.excluded ? t.include_in_alloc : t.exclude_from_alloc}
          </button>
          <button
            className="btn btn-block"
            style={{ color: 'var(--red)' }}
            onClick={() => { setHoldings(holdings.filter(h => h.isin !== isin)); onBack() }}
          >
            <Icon name="trash" size={14} /> {t.remove}
          </button>
        </div>
      </div>
    </div>
  )
}
