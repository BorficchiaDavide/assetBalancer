import { useState, useEffect } from 'react'
import { Icon } from '../components/Icon'
import { PALETTE } from '../constants'
import { formatMoney } from '../format'
import { donutSlices } from '../compute'
import { searchETF, fetchQuote } from '../api'

function IsinSuggest({ value, open, onPick }) {
  const v = value.toUpperCase().trim()
  const [liveResults, setLiveResults] = useState([])

  useEffect(() => {
    if (!open || v.length < 2) { setLiveResults([]); return }
    let cancelled = false
    searchETF(v).then(r => { if (!cancelled) setLiveResults(r || []) }).catch(() => {})
    return () => { cancelled = true }
  }, [v, open])

  if (!open || v.length < 2) return null

  const all = liveResults
    .slice(0, 6)
    .map(r => ({ isin: r.symbol, name: r.name, sub: `${r.symbol} · ${r.exchange}` }))
  if (all.length === 0) return null

  return (
    <div className="isin-suggest">
      {all.map(item => (
        <div key={item.isin} className="isin-suggest-row" onMouseDown={e => {
          e.preventDefault()
          onPick(item.isin)
        }}>
          <div style={{ fontSize: 13, fontWeight: 500 }}>{item.name}</div>
          <div style={{ fontSize: 11, color: 'var(--text-3)' }} className="mono">{item.sub}</div>
        </div>
      ))}
    </div>
  )
}

export function AddEtfModal({ t, onClose, onAdd, currency }) {
  const [isin, setIsin] = useState('')
  const [suggestOpen, setSuggestOpen] = useState(false)
  const [qty, setQty] = useState('')
  const [avg, setAvg] = useState('')
  const [liveQuote, setLiveQuote] = useState(null)
  const [lookingUp, setLookingUp] = useState(false)

  const key = isin.toUpperCase().trim()
  const meta = liveQuote && !liveQuote.error ? liveQuote : null

  useEffect(() => {
    if (key.length < 2) { setLiveQuote(null); return }
    let cancelled = false
    setLookingUp(true)
    fetchQuote(key)
      .then(r => { if (!cancelled) setLiveQuote(r) })
      .catch(() => { if (!cancelled) setLiveQuote(null) })
      .finally(() => { if (!cancelled) setLookingUp(false) })
    return () => { cancelled = true }
  }, [key])

  const valid = meta && parseFloat(qty) > 0 && parseFloat(avg) > 0

  const submit = () => {
    if (!valid) return
    onAdd({
      isin:     key,
      name:     meta.name     ?? null,
      ticker:   meta.symbol   ?? null,
      exchange: meta.exchange ?? null,
      quantity: parseFloat(qty),
      avgPrice: parseFloat(avg),
      targetPct: 0,
    })
    onClose()
  }

  const displayPrice = meta?.price ?? null

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.32)', display: 'grid', placeItems: 'center', zIndex: 30, backdropFilter: 'blur(4px)' }}
    >
      <div className="card" onClick={e => e.stopPropagation()} style={{ width: 440, padding: 28 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600, letterSpacing: '-0.02em' }}>{t.add_etf}</h2>
        <p style={{ margin: '6px 0 22px', color: 'var(--text-2)', fontSize: 13 }}>{t.setup_sub}</p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="field" style={{ position: 'relative' }}>
            <label className="label">{t.isin}</label>
            <input
              className="input mono"
              value={isin}
              onChange={e => { setSuggestOpen(true); setIsin(e.target.value.toUpperCase()) }}
              placeholder={t.isin_placeholder}
              autoFocus
            />
            <IsinSuggest value={isin} open={suggestOpen} onPick={v => { setSuggestOpen(false); setIsin(v) }} />
          </div>

          {lookingUp && (
            <div style={{ background: 'var(--surface-2)', borderRadius: 10, padding: 12, color: 'var(--text-3)', fontSize: 13 }}>
              Ricerca in corso…
            </div>
          )}

          {!lookingUp && meta && (
            <div style={{ background: 'var(--surface-2)', borderRadius: 10, padding: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{meta.name}</div>
              <div style={{ fontSize: 12, color: 'var(--text-2)' }}>
                {meta.symbol} · {meta.exchange}
                {displayPrice != null && ` · ${formatMoney(displayPrice, 'EUR')} ${t.market_price.toLowerCase()}`}
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="field">
              <label className="label">{t.quantity}</label>
              <input className="input tnum" type="number" min="0" step="any" value={qty} onChange={e => setQty(e.target.value)} placeholder="0" />
            </div>
            <div className="field">
              <label className="label">{t.avg_price}</label>
              <input className="input tnum" type="number" min="0" step="any" value={avg} onChange={e => setAvg(e.target.value)} placeholder="0.00" />
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 24, justifyContent: 'flex-end' }}>
          <button className="btn" onClick={onClose}>{t.cancel}</button>
          <button className="btn btn-primary" onClick={submit} disabled={!valid}>{t.add}</button>
        </div>
      </div>
    </div>
  )
}

export function EditTargetsModal({ t, holdings, onClose, onSave }) {
  const [local, setLocal] = useState(holdings.map(h => ({ ...h })))
  const total = local.reduce((s, h) => s + (h.targetPct || 0), 0)

  const update = (i, val) => {
    const next = [...local]
    next[i] = { ...next[i], targetPct: parseInt(val) }
    setLocal(next)
  }

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.32)', display: 'grid', placeItems: 'center', zIndex: 30, backdropFilter: 'blur(4px)' }}
    >
      <div className="card" onClick={e => e.stopPropagation()} style={{ width: 480, padding: 28, maxHeight: '80vh', overflowY: 'auto' }}>
        <h2 style={{ margin: '0 0 6px', fontSize: 20, fontWeight: 600, letterSpacing: '-0.02em' }}>{t.step_target}</h2>
        <p style={{ margin: '0 0 22px', color: 'var(--text-2)', fontSize: 13 }}>{t.target_total}: <strong>{total}%</strong>{total !== 100 && <span style={{ color: 'var(--text-3)', fontWeight: 400 }}> · {t.must_be_100}</span>}</p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {local.map((h, i) => {
            const v = h.targetPct || 0
            return (
              <div key={h.isin}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div>
                    <div style={{ fontWeight: 500, fontSize: 14 }}>{h.name || h.isin}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)' }} className="mono">{h.isin}</div>
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 600, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em', minWidth: 48, textAlign: 'right' }}>{v}%</div>
                </div>
                <input
                  className="target-slider"
                  type="range" min="0" max="100" step="1"
                  value={v}
                  onChange={e => update(i, e.target.value)}
                />
              </div>
            )
          })}
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 24, justifyContent: 'flex-end' }}>
          <button className="btn" onClick={onClose}>{t.cancel}</button>
          <button
            className="btn btn-primary"
            onClick={() => { onSave(local); onClose() }}
            disabled={total !== 100}
          >{t.save}</button>
        </div>
      </div>
    </div>
  )
}

function ReviewStep({ t, holdings }) {
  const enriched = holdings.map((h, i) => ({ ...h, color: PALETTE[i % PALETTE.length], meta: { name: h.name ?? h.isin, ticker: h.ticker ?? '—' }, weight: h.targetPct }))
  const slices = donutSlices(enriched)
  return (
    <div className="card" style={{ padding: 28 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 32, alignItems: 'center' }}>
        <svg viewBox="0 0 160 160" width="160" height="160">
          {slices.map((s, i) => <path key={i} d={s.d} fill={s.color} />)}
          <circle cx="80" cy="80" r="34" fill="var(--surface)" />
        </svg>
        <div className="legend">
          {enriched.map(e => (
            <div key={e.isin} className="legend-row">
              <span className="legend-dot" style={{ background: e.color }} />
              <span className="legend-name">{e.meta.name || e.isin}</span>
              <span className="legend-pct">{e.targetPct}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function Onboarding({ t, currency, onFinish }) {
  const [step, setStep] = useState(0)
  const [holdings, setHoldings] = useState([])
  const [showAdd, setShowAdd] = useState(false)
  const targetTotal = holdings.reduce((s, h) => s + (h.targetPct || 0), 0)

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '48px 32px' }}>
      {/* Step indicator */}
      <div className="steps" style={{ marginBottom: 8 }}>
        {[t.step_isin, t.step_target, t.step_review].map((label, i) => (
          <>
            <div key={`dot-${i}`} className={`step-dot ${step === i ? 'active' : step > i ? 'done' : ''}`}>
              {step > i ? <Icon name="check" size={12} stroke={2.4} /> : i + 1}
            </div>
            <span key={`lbl-${i}`} style={{ fontSize: 13, color: step === i ? 'var(--text)' : 'var(--text-2)', fontWeight: step === i ? 500 : 400 }}>{label}</span>
            {i < 2 && <div key={`line-${i}`} className="step-line" />}
          </>
        ))}
      </div>

      <h1 style={{ fontSize: 32, fontWeight: 600, letterSpacing: '-0.03em', margin: '16px 0 8px' }}>{t.setup_portfolio}</h1>
      <p style={{ margin: '0 0 28px', color: 'var(--text-2)', fontSize: 15 }}>{t.setup_sub}</p>

      {/* Step 0: Add ETFs */}
      {step === 0 && (
        <div className="card" style={{ padding: 0 }}>
          {holdings.length === 0 ? (
            <div className="empty">
              <div className="empty-icon"><Icon name="inbox" size={24} /></div>
              <h3>{t.no_etfs}</h3>
              <p>{t.add_first_etf}</p>
              <button className="btn btn-primary" onClick={() => setShowAdd(true)} style={{ marginTop: 8 }}>
                <Icon name="plus" size={14} stroke={2.4} /> {t.add_etf}
              </button>
            </div>
          ) : (
            <>
              <table className="table">
                <thead>
                  <tr>
                    <th>{t.asset}</th>
                    <th className="num">{t.qty}</th>
                    <th className="num">{t.avg_load}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {holdings.map((h, i) => {
                    return (
                      <tr key={h.isin}>
                        <td>
                          <div style={{ fontWeight: 500 }}>{h.name || h.isin}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-3)' }} className="mono">{h.isin} · {h.ticker ?? '—'}</div>
                        </td>
                        <td className="num">{h.quantity}</td>
                        <td className="num">{formatMoney(h.avgPrice, currency)}</td>
                        <td className="num">
                          <button className="btn btn-ghost btn-sm" onClick={() => setHoldings(holdings.filter((_, j) => j !== i))}>
                            <Icon name="trash" size={14} />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <div style={{ padding: 16, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'center' }}>
                <button className="btn" onClick={() => setShowAdd(true)}>
                  <Icon name="plus" size={14} stroke={2.4} /> {t.add_etf}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Step 1: Set target weights */}
      {step === 1 && (
        <div className="card" style={{ padding: 28 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {holdings.map((h, i) => {
              const v = h.targetPct || 0
              return (
                <div key={h.isin}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <div>
                      <div style={{ fontWeight: 500, fontSize: 14 }}>{h.name || h.isin}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-3)' }} className="mono">{h.isin}</div>
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 600, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>{v.toFixed(0)}%</div>
                  </div>
                  <input
                    className="target-slider"
                    type="range" min="0" max="100" step="1"
                    value={v}
                    onChange={e => {
                      const next = [...holdings]
                      next[i] = { ...next[i], targetPct: parseInt(e.target.value) }
                      setHoldings(next)
                    }}
                  />
                </div>
              )
            })}
          </div>
          <div style={{ marginTop: 24, paddingTop: 18, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{t.target_total}</span>
            <span style={{ fontSize: 16, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: targetTotal === 100 ? 'var(--green)' : 'var(--text)' }}>
              {targetTotal}%{' '}
              {targetTotal !== 100 && <span style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 400 }}>· {t.must_be_100}</span>}
            </span>
          </div>
        </div>
      )}

      {/* Step 2: Review */}
      {step === 2 && <ReviewStep t={t} holdings={holdings} />}

      {/* Navigation */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 28 }}>
        <button className="btn" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0}>
          <Icon name="chevronLeft" size={14} /> {t.back}
        </button>
        {step < 2 ? (
          <button
            className="btn btn-primary"
            onClick={() => setStep(step + 1)}
            disabled={(step === 0 && holdings.length === 0) || (step === 1 && targetTotal !== 100)}
          >
            {t.next} <Icon name="chevronRight" size={14} />
          </button>
        ) : (
          <button className="btn btn-primary" onClick={() => onFinish(holdings)}>
            <Icon name="check" size={14} stroke={2.4} /> {t.finish}
          </button>
        )}
      </div>

      {showAdd && (
        <AddEtfModal
          t={t} currency={currency}
          onClose={() => setShowAdd(false)}
          onAdd={h => setHoldings([...holdings, h])}
        />
      )}
    </div>
  )
}
