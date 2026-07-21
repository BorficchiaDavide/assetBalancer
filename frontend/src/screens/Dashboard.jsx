import { useState, useRef, useCallback } from 'react'
import { Icon } from '../components/Icon'
import { computeHoldings, groupByMacroClass } from '../compute'
import { formatMoney, formatPct, formatQty } from '../format'
import { MACRO_CLASS_LABELS } from '../constants'
import { AddEtfModal, EditTargetsModal } from './Onboarding'

function annularArc(cx, cy, r1, r2, a0, a1) {
  if (a1 - a0 < 0.001) return ''
  const large = (a1 - a0) > Math.PI ? 1 : 0
  const cos0 = Math.cos(a0), sin0 = Math.sin(a0)
  const cos1 = Math.cos(a1), sin1 = Math.sin(a1)
  return [
    `M ${cx + r2 * cos0} ${cy + r2 * sin0}`,
    `A ${r2} ${r2} 0 ${large} 1 ${cx + r2 * cos1} ${cy + r2 * sin1}`,
    `L ${cx + r1 * cos1} ${cy + r1 * sin1}`,
    `A ${r1} ${r1} 0 ${large} 0 ${cx + r1 * cos0} ${cy + r1 * sin0}`,
    'Z',
  ].join(' ')
}

export function Donut({ enriched, totalValue, currency, size = 220 }) {
  const [tooltip, setTooltip] = useState(null)
  const svgRef = useRef(null)

  const cx = 100, cy = 100
  const RI_IN = 40, RI_OUT = 65
  const RO_IN = 70, RO_OUT = 88
  const GAP = 0.018

  const active = enriched.filter(e => !e.excluded && e.value > 0)
  const groups = groupByMacroClass(active)
  const total  = active.reduce((s, e) => s + e.value, 0)

  const innerSlices = []
  const outerSlices = []
  let angle = -Math.PI / 2

  for (const g of groups) {
    const gAngle = (g.totalValue / total) * 2 * Math.PI
    innerSlices.push({
      d:     annularArc(cx, cy, RI_IN, RI_OUT, angle + GAP / 2, angle + gAngle - GAP / 2),
      color: g.color,
      name:  MACRO_CLASS_LABELS[g.cls] ?? g.cls,
      pct:   g.weight,
    })
    let assetAngle = angle
    g.assets.forEach((e, i) => {
      const aAngle = (e.value / total) * 2 * Math.PI
      const n = g.assets.length
      outerSlices.push({
        d:       annularArc(cx, cy, RO_IN, RO_OUT, assetAngle + GAP / 2, assetAngle + aAngle - GAP / 2),
        color:   g.color,
        opacity: n === 1 ? 1 : 1 - (i * 0.38) / Math.max(n - 1, 1),
        name:    e.meta?.name || e.meta?.ticker || e.isin,
        ticker:  e.meta?.ticker,
        pct:     (e.value / total) * 100,
      })
      assetAngle += aAngle
    })
    angle += gAngle
  }

  function showTooltip(s, ev) {
    const rect = svgRef.current.getBoundingClientRect()
    setTooltip({ x: ev.clientX - rect.left, y: ev.clientY - rect.top, name: s.name, ticker: s.ticker, pct: s.pct })
  }

  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg ref={svgRef} viewBox="0 0 200 200" width={size} height={size} style={{ display: 'block' }}>
        {active.length === 0 && (
          <circle cx={cx} cy={cy} r={(RO_OUT + RI_IN) / 2} fill="none" stroke="var(--surface-2)" strokeWidth={RO_OUT - RI_IN} />
        )}
        {innerSlices.map((s, i) => (
          <path key={`i${i}`} d={s.d} fill={s.color}
            onMouseEnter={ev => showTooltip(s, ev)}
            onMouseMove={ev  => showTooltip(s, ev)}
            onMouseLeave={() => setTooltip(null)}
            style={{ cursor: 'default' }}
          />
        ))}
        {outerSlices.map((s, i) => (
          <path key={`o${i}`} d={s.d} fill={s.color} fillOpacity={s.opacity}
            onMouseEnter={ev => showTooltip(s, ev)}
            onMouseMove={ev  => showTooltip(s, ev)}
            onMouseLeave={() => setTooltip(null)}
            style={{ cursor: 'default' }}
          />
        ))}
        <circle cx={cx} cy={cy} r={RI_IN} fill="var(--surface)" />
        <text textAnchor="middle" style={{ fontFamily: 'inherit' }}>
          <tspan x={cx} y={cy - 4} style={{ fontSize: 8, fill: 'var(--text-3)' }}>Totale</tspan>
          <tspan x={cx} y={cy + 10} style={{ fontSize: 11, fill: 'var(--text)', fontWeight: 600, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>
            {formatMoney(totalValue, currency, { min: 0, max: 0 })}
          </tspan>
        </text>
      </svg>

      {tooltip && (
        <div style={{
          position: 'absolute',
          left: tooltip.x + 14,
          top:  tooltip.y - 12,
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: '6px 10px',
          pointerEvents: 'none',
          boxShadow: '0 4px 16px rgba(0,0,0,.18)',
          fontSize: 12,
          whiteSpace: 'nowrap',
          zIndex: 20,
        }}>
          <div style={{ fontWeight: 600, color: 'var(--text)' }}>{tooltip.name}</div>
          {tooltip.ticker && <div style={{ color: 'var(--text-3)', fontSize: 11 }}>{tooltip.ticker}</div>}
          <div style={{ color: 'var(--text-2)', marginTop: 3, fontVariantNumeric: 'tabular-nums' }}>{tooltip.pct.toFixed(2)}%</div>
        </div>
      )}
    </div>
  )
}

function HoldingRow({ e, currency, t, onView }) {
  return (
    <tr className="row-click" onClick={() => onView(e.isin)}>
      <td style={{ paddingLeft: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 8, height: 36, borderRadius: 3, background: e.color, flexShrink: 0 }} />
          <div>
            <div style={{ fontWeight: 500 }}>{e.meta.name || e.isin}</div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }} className="mono">{e.isin}</div>
          </div>
        </div>
      </td>
      <td className="num tnum">{formatQty(e.quantity)}</td>
      <td className="num tnum">{formatMoney(e.price, currency)}</td>
      <td className="num tnum" style={{ color: 'var(--text-2)' }}>{formatMoney(e.avgPrice, currency)}</td>
      <td className="num tnum" style={{ fontWeight: 500 }}>{formatMoney(e.value, currency)}</td>
      <td className="num tnum">
        <div className={e.pnlAbs >= 0 ? 'pnl-pos' : 'pnl-neg'} style={{ fontWeight: 500 }}>
          {formatMoney(e.pnlAbs, currency)}
        </div>
      </td>
      <td className="num tnum" style={{ paddingRight: 24 }}>
        <div className={e.pnlAbs >= 0 ? 'pnl-pos' : 'pnl-neg'} style={{ fontWeight: 500 }}>
          {formatPct(e.pnlPct)}
        </div>
      </td>
    </tr>
  )
}

const SORT_COLS = {
  name:     e => (e.meta.name || e.isin).toLowerCase(),
  qty:      e => e.quantity,
  price:    e => e.price,
  avgPrice: e => e.avgPrice,
  value:    e => e.value,
  pnl:      e => e.pnlAbs,
  pnlPct:   e => e.pnlPct,
}

function sortList(list, key, dir) {
  if (!key) return list
  const fn = SORT_COLS[key]
  return [...list].sort((a, b) => {
    const av = fn(a), bv = fn(b)
    if (typeof av === 'string') return dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
    return dir === 'asc' ? av - bv : bv - av
  })
}

function SortTh({ label, col, sortKey, sortDir, onSort, className, style }) {
  const active = sortKey === col
  return (
    <th
      className={className}
      style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap', ...style }}
      onClick={() => onSort(col)}
    >
      {label}
      {active
        ? <span style={{ marginLeft: 4, opacity: 0.7 }}>{sortDir === 'asc' ? '↑' : '↓'}</span>
        : <span style={{ marginLeft: 4, opacity: 0.2 }}>↕</span>
      }
    </th>
  )
}

function SectionRow({ label, count, open, onToggle }) {
  return (
    <tr style={{ cursor: 'pointer' }} onClick={onToggle}>
      <td colSpan={7} style={{ padding: '10px 24px', borderTop: '1px solid var(--border)', background: 'var(--surface-2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {label} ({count})
          </span>
          <Icon name={open ? 'chevronUp' : 'chevronDown'} size={12} />
        </div>
      </td>
    </tr>
  )
}

export function Dashboard({ t, holdings, setHoldings, currency, lang, livePrices = {}, fxRates = {}, pricesAttempted = false, refreshing = false, onRefresh, onView, onGoRebalance, portfolios = [], portfolioId, onSwitchPortfolio, onRenamePortfolio, onReorderPortfolios, onNewPortfolio }) {
  const { enriched, totalValue, totalCost, totalPnL, totalPnLPct, totalDrift } = computeHoldings(holdings, currency, livePrices, fxRates, pricesAttempted)
  const macroGroups = groupByMacroClass(enriched.filter(e => !e.excluded && e.value > 0))
  const [showAdd, setShowAdd] = useState(false)
  const [showEditTargets, setShowEditTargets] = useState(false)
  const [openAlloc, setOpenAlloc]     = useState(true)
  const [openTarget, setOpenTarget]   = useState(true)
  const [openTable, setOpenTable]     = useState(true)
  const [openActive, setOpenActive]   = useState(true)
  const [openExcluded, setOpenExcluded] = useState(true)
  const [sortKey, setSortKey]   = useState(null)
  const [sortDir, setSortDir]   = useState('asc')
  const isEmpty = holdings.length === 0

  const [editingTabId, setEditingTabId] = useState(null)
  const [editingTabName, setEditingTabName] = useState('')
  const dragSrcId = useRef(null)

  const startRename = useCallback((p, e) => {
    e.stopPropagation()
    setEditingTabId(p.id)
    setEditingTabName(p.name)
  }, [])

  const commitRename = useCallback((id) => {
    const name = editingTabName.trim()
    if (name) onRenamePortfolio(id, name)
    setEditingTabId(null)
  }, [editingTabName, onRenamePortfolio])

  const handleDragStart = useCallback((e, id) => {
    dragSrcId.current = id
    e.dataTransfer.effectAllowed = 'move'
  }, [])

  const handleDrop = useCallback((e, targetId) => {
    e.preventDefault()
    const srcId = dragSrcId.current
    if (!srcId || srcId === targetId) return
    const ids = portfolios.map(p => p.id)
    const from = ids.indexOf(srcId)
    const to   = ids.indexOf(targetId)
    const reordered = [...ids]
    reordered.splice(from, 1)
    reordered.splice(to, 0, srcId)
    onReorderPortfolios(reordered)
  }, [portfolios, onReorderPortfolios])

  const activeAssets   = sortList(enriched.filter(e => !e.excluded), sortKey, sortDir)
  const excludedAssets = sortList(enriched.filter(e => e.excluded),  sortKey, sortDir)

  const [openPortfolioInfo, setOpenPortfolioInfo] = useState(true)

  const activeWithExpense = enriched.filter(e => !e.excluded && e.value > 0 && livePrices[e.isin]?.expenseRatio != null)
  const totalAnnualCost   = activeWithExpense.reduce((s, e) => s + livePrices[e.isin].expenseRatio * e.value, 0)
  const avgTerPct         = totalValue > 0 ? (totalAnnualCost / totalValue) * 100 : 0
  const hasExpenseData    = activeWithExpense.length > 0

  function handleSort(col) {
    if (sortKey === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(col); setSortDir('asc') }
  }

  return (
    <div style={{ padding: '28px 32px 80px', maxWidth: 1200, margin: '0 auto' }}>
      {portfolios.length > 0 && (
        <div className="portfolio-tabs-row">
          {portfolios.map(p => (
            <div
              key={p.id}
              draggable
              onDragStart={e => handleDragStart(e, p.id)}
              onDragOver={e => e.preventDefault()}
              onDrop={e => handleDrop(e, p.id)}
              style={{ display: 'flex' }}
            >
              {editingTabId === p.id ? (
                <input
                  autoFocus
                  value={editingTabName}
                  onChange={e => setEditingTabName(e.target.value)}
                  onBlur={() => commitRename(p.id)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') commitRename(p.id)
                    if (e.key === 'Escape') setEditingTabId(null)
                  }}
                  onClick={e => e.stopPropagation()}
                  style={{
                    font: 'inherit', fontSize: 13, fontWeight: 600,
                    background: 'var(--surface-2)', border: '1px solid var(--border)',
                    borderRadius: 7, padding: '4px 12px', color: 'var(--text)',
                    outline: 'none', width: `${Math.max(editingTabName.length, 4)}ch`,
                    minWidth: 60,
                  }}
                />
              ) : (
                <button
                  className={`portfolio-tab${portfolioId === p.id ? ' active' : ''}`}
                  onClick={() => onSwitchPortfolio(p.id)}
                  onDoubleClick={e => startRename(p, e)}
                  title="Doppio click per rinominare · Trascina per riordinare"
                  style={{ cursor: 'grab' }}
                >
                  {p.name}
                </button>
              )}
            </div>
          ))}
          <button
            className="portfolio-tab-add"
            onClick={onNewPortfolio}
            title={t.new_portfolio}
          >
            <Icon name="plus" size={12} />
          </button>
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 30, fontWeight: 600, letterSpacing: '-0.03em' }}>
            {portfolios.find(p => p.id === portfolioId)?.name ?? t.dashboard}
          </h1>
          <p style={{ margin: '4px 0 0', color: 'var(--text-2)', fontSize: 14 }}>
            {new Date().toLocaleDateString(lang === 'it' ? 'it-IT' : 'en-US', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {onRefresh && (
            <button className="btn" onClick={onRefresh} disabled={refreshing} title="Aggiorna prezzi">
              <Icon name="refresh" size={14} style={refreshing ? { animation: 'spin 1s linear infinite' } : {}} />
              {refreshing ? '…' : 'Refresh'}
            </button>
          )}
          <button className="btn" onClick={() => setShowAdd(true)}>
            <Icon name="plus" size={14} stroke={2.4} /> {t.add_new}
          </button>
          <button className="btn btn-primary" onClick={onGoRebalance} disabled={isEmpty}>
            <Icon name="scale" size={14} /> {t.rebalance}
          </button>
        </div>
      </div>

      <div className="kpi-grid" style={{ marginBottom: 24 }}>
        <div className="kpi">
          <div className="kpi-label">{t.total_value}</div>
          <div className="kpi-value">{formatMoney(totalValue, currency)}</div>
          <div className="kpi-sub">{holdings.length} asset</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">{t.total_cost}</div>
          <div className="kpi-value">{formatMoney(totalCost, currency)}</div>
          <div className="kpi-sub">&nbsp;</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">{t.total_pnl}</div>
          <div className={`kpi-value ${totalPnL >= 0 ? 'pnl-pos' : 'pnl-neg'}`}>{formatMoney(totalPnL, currency)}</div>
          <div className={`kpi-sub ${totalPnL >= 0 ? 'pnl-pos' : 'pnl-neg'}`}>{formatPct(totalPnLPct)}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">{t.drift}</div>
          <div className="kpi-value">{totalDrift.toFixed(1)}%</div>
          <div className="kpi-sub">{totalDrift < 2 ? '✓ on target' : 'needs rebalance'}</div>
        </div>
      </div>

      {isEmpty ? (
        <div className="card">
          <div className="empty">
            <div className="empty-icon"><Icon name="pie" size={24} /></div>
            <h3>{t.no_etfs}</h3>
            <p>{t.no_etfs_sub}</p>
            <button className="btn btn-primary" onClick={() => setShowAdd(true)} style={{ marginTop: 8 }}>
              <Icon name="plus" size={14} stroke={2.4} /> {t.add_etf}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24, alignItems: 'start' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }} onClick={() => setOpenAlloc(o => !o)}>
                  <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: '-0.01em' }}>{t.allocation}</div>
                  <Icon name={openAlloc ? 'chevronUp' : 'chevronDown'} size={14} />
                </div>
                {openAlloc && (
                  <div style={{ padding: '0 20px 20px', display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 28, alignItems: 'center' }}>
                    <Donut enriched={enriched} totalValue={totalValue} currency={currency} />
                    <div className="legend">
                      {macroGroups.map(g => (
                        <div key={g.cls} className="legend-row">
                          <span className="legend-dot" style={{ background: g.color }} />
                          <span className="legend-name">{MACRO_CLASS_LABELS[g.cls] ?? g.cls}</span>
                          <span className="legend-pct">{g.weight.toFixed(1)}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }} onClick={() => setOpenPortfolioInfo(o => !o)}>
                  <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: '-0.01em' }}>{t.portfolio_info}</div>
                  <Icon name={openPortfolioInfo ? 'chevronUp' : 'chevronDown'} size={14} />
                </div>
                {openPortfolioInfo && (
                  <div style={{ padding: '0 20px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {!hasExpenseData ? (
                      <div style={{ fontSize: 13, color: 'var(--text-3)', padding: '4px 0' }}>
                        {lang === 'it' ? 'Dati TER non disponibili' : 'TER data not available'}
                      </div>
                    ) : (
                      <>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                          <div style={{ fontSize: 13, color: 'var(--text-2)' }}>{t.annual_mgmt_cost}</div>
                          <div style={{ fontSize: 15, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: 'var(--text)' }}>
                            {formatMoney(totalAnnualCost, currency)}
                          </div>
                        </div>
                        <div style={{ height: 1, background: 'var(--border)' }} />
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                          <div style={{ fontSize: 13, color: 'var(--text-2)' }}>{t.avg_ter}</div>
                          <div style={{ fontSize: 15, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: 'var(--text)' }}>
                            {avgTerPct.toFixed(3)}%
                          </div>
                        </div>
                        {activeWithExpense.length < enriched.filter(e => !e.excluded && e.value > 0).length && (
                          <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: -4 }}>
                            {lang === 'it'
                              ? `Calcolato su ${activeWithExpense.length} di ${enriched.filter(e => !e.excluded && e.value > 0).length} asset`
                              : `Calculated on ${activeWithExpense.length} of ${enriched.filter(e => !e.excluded && e.value > 0).length} assets`}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }} onClick={() => setOpenTarget(o => !o)}>
                <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: '-0.01em' }}>{t.target_vs_actual}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {openTarget && (
                    <button className="btn btn-ghost btn-sm" onClick={e => { e.stopPropagation(); setShowEditTargets(true) }} title={t.edit_target_pct}>
                      <Icon name="edit" size={13} />
                    </button>
                  )}
                  <Icon name={openTarget ? 'chevronUp' : 'chevronDown'} size={14} />
                </div>
              </div>
              {openTarget && (
                <div style={{ padding: '0 20px 20px' }}>
                  {activeAssets.map(e => (
                    <div className="bar-row" key={e.isin}>
                      <div>
                        <div className="bar-name">{e.meta.name || e.meta.ticker || e.isin}</div>
                        <div className="bar-isin mono">{e.isin}</div>
                        <div className="bar-track">
                          <div className="bar-actual" style={{ width: `${Math.min(100, e.allocWeight)}%`, background: e.color }} />
                          <div className="bar-target" style={{ left: `${Math.min(100, e.targetPct)}%` }} />
                        </div>
                      </div>
                      <div className="bar-pcts">
                        <div style={{ fontWeight: 500, color: 'var(--text)' }}>{e.allocWeight.toFixed(1)}%</div>
                        <div style={{ color: 'var(--text-3)', fontSize: 11 }}>→ {e.targetPct}%</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 24 }}>
            <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }} onClick={() => setOpenTable(o => !o)}>
              <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: '-0.01em' }}>{t.holdings}</div>
              <Icon name={openTable ? 'chevronUp' : 'chevronDown'} size={14} />
            </div>
            {openTable && (
              <table className="table">
                <thead>
                  <tr>
                    <SortTh label={t.asset}        col="name"     sortKey={sortKey} sortDir={sortDir} onSort={handleSort} style={{ paddingLeft: 24 }} />
                    <SortTh label={t.qty}          col="qty"      sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="num" />
                    <SortTh label={t.market_price} col="price"    sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="num" />
                    <SortTh label={t.avg_load}     col="avgPrice" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="num" />
                    <SortTh label={t.market_value} col="value"    sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="num" />
                    <SortTh label={t.pnl}          col="pnl"      sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="num" />
                    <SortTh label={t.pnl_pct} col="pnlPct" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="num" style={{ paddingRight: 24 }} />
                  </tr>
                </thead>
                <tbody>
                  <SectionRow
                    label={t.asset}
                    count={activeAssets.length}
                    open={openActive}
                    onToggle={() => setOpenActive(o => !o)}
                  />
                  {openActive && activeAssets.map(e => (
                    <HoldingRow key={e.isin} e={e} currency={currency} t={t} onView={onView} />
                  ))}
                  {excludedAssets.length > 0 && (
                    <>
                      <SectionRow
                        label={t.excluded_badge}
                        count={excludedAssets.length}
                        open={openExcluded}
                        onToggle={() => setOpenExcluded(o => !o)}
                      />
                      {openExcluded && excludedAssets.map(e => (
                        <HoldingRow key={e.isin} e={e} currency={currency} t={t} onView={onView} />
                      ))}
                    </>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {showEditTargets && (
        <EditTargetsModal
          t={t}
          holdings={holdings}
          onClose={() => setShowEditTargets(false)}
          onSave={updated => setHoldings(holdings.map(h => {
            const u = updated.find(x => x.isin === h.isin)
            return u ? { ...h, targetPct: u.targetPct } : h
          }))}
        />
      )}

      {showAdd && (
        <AddEtfModal
          t={t} currency={currency}
          onClose={() => setShowAdd(false)}
          onAdd={h => {
            const existing = holdings.find(x => x.isin === h.isin)
            if (existing) {
              const newQty = existing.quantity + h.quantity
              setHoldings(holdings.map(x => x.isin === h.isin ? { ...x, quantity: newQty, avgPrice: h.avgPrice } : x))
            } else {
              setHoldings([...holdings, { ...h, targetPct: Math.max(0, 100 - holdings.reduce((s, x) => s + (x.targetPct || 0), 0)) }])
            }
          }}
        />
      )}
    </div>
  )
}
