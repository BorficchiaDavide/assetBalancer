import { useState } from 'react'
import { Icon } from '../components/Icon'
import { computeHoldings, computeRebalance } from '../compute'
import { formatMoney, getCurrencySymbol } from '../format'

function ConfirmModal({ t, suggestions, currency, onConfirm, onCancel }) {
  const buys = suggestions.filter(s => s.action === 'buy')
  const sells = suggestions.filter(s => s.action === 'sell')
  return (
    <div
      onClick={onCancel}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.32)', display: 'grid', placeItems: 'center', zIndex: 30, backdropFilter: 'blur(4px)' }}
    >
      <div className="card" onClick={e => e.stopPropagation()} style={{ width: 420, padding: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--surface-2)', display: 'grid', placeItems: 'center', color: 'var(--text-2)' }}>
            <Icon name="refresh" size={18} />
          </div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, letterSpacing: '-0.02em' }}>{t.apply_rebalance}</h2>
        </div>
        <p style={{ margin: '8px 0 20px', color: 'var(--text-2)', fontSize: 14 }}>
          {t.lang === 'it'
            ? 'Queste operazioni verranno applicate al portafoglio. Le quantità saranno aggiornate.'
            : 'These trades will be applied to your portfolio. Quantities will be updated.'}
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
          {[...buys, ...sells].map(s => (
            <div key={s.isin} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--surface-2)', borderRadius: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 4, height: 28, borderRadius: 2, background: s.color }} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{s.meta.ticker || s.isin}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{Math.abs(s.deltaShares).toFixed(2)} {t.shares}</div>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className={`sugg-action sugg-${s.action}`} style={{ fontSize: 11 }}>
                  {s.action === 'buy' && <Icon name="arrowUp" size={10} stroke={2.4} />}
                  {s.action === 'sell' && <Icon name="arrowDown" size={10} stroke={2.4} />}
                  {t[s.action]}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
                  {formatMoney(Math.abs(s.deltaValue), currency)}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button className="btn" onClick={onCancel}>{t.cancel}</button>
          <button className="btn btn-primary" onClick={onConfirm}>
            <Icon name="check" size={14} stroke={2.4} /> {t.apply_rebalance}
          </button>
        </div>
      </div>
    </div>
  )
}

export function RebalanceScreen({ t, holdings, setHoldings, currency, livePrices = {}, fxRates = {}, pricesAttempted = false, onBack }) {
  const [newCapital, setNewCapital] = useState(0)
  const [showConfirm, setShowConfirm] = useState(false)
  const { enriched, totalValue } = computeHoldings(holdings, currency, livePrices, fxRates, pricesAttempted)
  const suggestions = computeRebalance(enriched, totalValue, newCapital)
  const totalBuy = suggestions.filter(s => s.action === 'buy').reduce((sum, s) => sum + s.deltaValue, 0)
  const totalSell = suggestions.filter(s => s.action === 'sell').reduce((sum, s) => sum + Math.abs(s.deltaValue), 0)

  const applyRebalance = () => {
    const updated = holdings.map(h => {
      const s = suggestions.find(x => x.isin === h.isin)
      if (!s || s.action === 'hold') return h
      // Convert deltaShares back to EUR-denominated quantity
      const newQty = Math.max(0, h.quantity + s.deltaShares)
      return { ...h, quantity: parseFloat(newQty.toFixed(4)) }
    })
    setHoldings(updated)
    setShowConfirm(false)
    onBack()
  }

  return (
    <div style={{ padding: '28px 32px 80px', maxWidth: 1000, margin: '0 auto' }}>
      <button className="btn btn-ghost btn-sm" onClick={onBack} style={{ marginBottom: 16 }}>
        <Icon name="chevronLeft" size={14} /> {t.dashboard}
      </button>
      <h1 style={{ margin: 0, fontSize: 30, fontWeight: 600, letterSpacing: '-0.03em' }}>{t.rebalance_title}</h1>
      <p style={{ margin: '6px 0 28px', color: 'var(--text-2)', fontSize: 15, maxWidth: 560 }}>{t.rebalance_sub}</p>

      <div className="card" style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 24, padding: 20 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>{t.new_capital}</div>
          <div style={{ fontSize: 12, color: 'var(--text-2)' }}>{t.new_capital_sub}</div>
        </div>
        <div style={{ position: 'relative' }}>
          <input
            className="input tnum"
            type="number" min="0" step="100"
            value={newCapital}
            onChange={e => setNewCapital(parseFloat(e.target.value) || 0)}
            style={{ width: 160, paddingRight: 32, textAlign: 'right' }}
          />
          <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-2)', fontSize: 14 }}>
            {getCurrencySymbol(currency)}
          </span>
        </div>
      </div>

      <div className="card">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, paddingBottom: 16, borderBottom: '1px solid var(--border)', marginBottom: 8 }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 500 }}>{t.buy}</div>
            <div className="pnl-pos" style={{ fontSize: 22, fontWeight: 600, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em', marginTop: 4 }}>
              {formatMoney(totalBuy, currency)}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 500 }}>{t.sell}</div>
            <div className="pnl-neg" style={{ fontSize: 22, fontWeight: 600, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em', marginTop: 4 }}>
              {formatMoney(totalSell, currency)}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 500 }}>{t.total_value}</div>
            <div style={{ fontSize: 22, fontWeight: 600, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em', marginTop: 4 }}>
              {formatMoney(totalValue + newCapital, currency)}
            </div>
          </div>
        </div>

        <div>
          {suggestions.map(s => (
            <div className="sugg-row" key={s.isin}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 6, height: 32, borderRadius: 3, background: s.color }} />
                  <div>
                    <div style={{ fontWeight: 500, fontSize: 14 }}>{s.meta.name || s.isin}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }} className="mono">{s.isin}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 16, marginTop: 10, paddingLeft: 18, fontSize: 12, color: 'var(--text-2)', fontVariantNumeric: 'tabular-nums' }}>
                  <span>{t.current}: {s.weight.toFixed(1)}%</span>
                  <span>→</span>
                  <span style={{ color: 'var(--text)' }}>{t.target}: {s.targetPct}%</span>
                  <span style={{ color: 'var(--text-3)' }}>·</span>
                  <span>{formatMoney(s.value, currency)} → {formatMoney(s.targetValue, currency)}</span>
                </div>
              </div>
              <div style={{ textAlign: 'right', fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
                <div style={{ fontWeight: 600, fontSize: 15 }}>
                  {s.action === 'hold' ? '—' : formatMoney(Math.abs(s.deltaValue), currency)}
                </div>
                <div style={{ color: 'var(--text-2)', fontSize: 12, marginTop: 2 }}>
                  {s.action === 'hold' ? '—' : `${Math.abs(s.deltaShares).toFixed(2)} ${t.shares}`}
                </div>
              </div>
              <div className={`sugg-action sugg-${s.action}`}>
                {s.action === 'buy' && <Icon name="arrowUp" size={11} stroke={2.4} />}
                {s.action === 'sell' && <Icon name="arrowDown" size={11} stroke={2.4} />}
                {t[s.action]}
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 20, borderTop: '1px solid var(--border)', marginTop: 8 }}>
          <button className="btn btn-primary" onClick={() => setShowConfirm(true)}>
            {t.apply_rebalance}
          </button>
        </div>
      </div>

      {showConfirm && (
        <ConfirmModal
          t={t}
          suggestions={suggestions}
          currency={currency}
          onConfirm={applyRebalance}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </div>
  )
}
