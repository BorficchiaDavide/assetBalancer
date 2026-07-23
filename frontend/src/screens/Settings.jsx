import { useState } from 'react'
import { Icon } from '../components/Icon'
import { changePassword } from '../api'

function SettingRow({ label, children, last }) {
  return (
    <div className="setting-row" style={{ borderBottom: last ? 'none' : '1px solid var(--border)' }}>
      <span className="setting-row-label">{label}</span>
      {children}
    </div>
  )
}

function DeletePortfolioModal({ t, portfolio, onConfirm, onClose }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
      display: 'grid', placeItems: 'center', zIndex: 1000,
    }}>
      <div className="card" style={{ width: 400, padding: 28 }}>
        <h3 style={{ margin: '0 0 12px', fontSize: 18, fontWeight: 600, letterSpacing: '-0.02em' }}>
          {t.confirm_delete_portfolio}
        </h3>
        <p style={{ margin: '0 0 24px', fontSize: 14, color: 'var(--text-2)', lineHeight: 1.5 }}>
          {t.confirm_delete_msg(portfolio.name)}
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button className="btn" onClick={onClose}>{t.cancel}</button>
          <button
            className="btn btn-primary"
            style={{ background: 'var(--danger, #e05252)', borderColor: 'var(--danger, #e05252)' }}
            onClick={onConfirm}
          >
            <Icon name="trash" size={14} /> {t.delete}
          </button>
        </div>
      </div>
    </div>
  )
}

export function Settings({ t, theme, setTheme, lang, setLang, currency, setCurrency, density, setDensity, pnlColor, setPnlColor, onSignOut, user, portfolios = [], onDeletePortfolio }) {
  const [selectedId, setSelectedId] = useState(portfolios[0]?.id ?? null)
  const [confirming, setConfirming] = useState(false)

  const [pwOpen,    setPwOpen]    = useState(false)
  const [currentPw, setCurrentPw] = useState('')
  const [newPw,     setNewPw]     = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [pwError,   setPwError]   = useState(null)
  const [pwSuccess, setPwSuccess] = useState(false)
  const [pwLoading, setPwLoading] = useState(false)

  const selectedPortfolio = portfolios.find(p => p.id === selectedId) ?? null

  async function handleConfirmDelete() {
    setConfirming(false)
    await onDeletePortfolio(selectedId)
  }

  async function handleChangePassword(e) {
    e.preventDefault()
    setPwError(null)
    if (newPw !== confirmPw) { setPwError(t.passwords_do_not_match); return }
    setPwLoading(true)
    try {
      await changePassword(currentPw, newPw)
      setPwSuccess(true)
      setCurrentPw(''); setNewPw(''); setConfirmPw('')
      setTimeout(() => { setPwSuccess(false); setPwOpen(false) }, 2000)
    } catch (err) {
      setPwError(err.message ?? 'Error')
    }
    setPwLoading(false)
  }

  return (
    <div style={{ padding: '28px 32px 80px', maxWidth: 720, margin: '0 auto' }}>
      <h1 style={{ margin: '0 0 28px', fontSize: 30, fontWeight: 600, letterSpacing: '-0.03em' }}>{t.settings}</h1>

      <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-3)', fontWeight: 500, padding: '0 4px 10px' }}>
        {t.appearance}
      </div>
      <div className="card" style={{ padding: 0, marginBottom: 28 }}>
        <SettingRow label={t.appearance}>
          <div className="toggle">
            <button className={theme === 'light' ? 'active' : ''} onClick={() => setTheme('light')}>{t.light}</button>
            <button className={theme === 'dark' ? 'active' : ''} onClick={() => setTheme('dark')}>{t.dark}</button>
          </div>
        </SettingRow>
        <SettingRow label={t.language}>
          <div className="toggle">
            <button className={lang === 'it' ? 'active' : ''} onClick={() => setLang('it')}>Italiano</button>
            <button className={lang === 'en' ? 'active' : ''} onClick={() => setLang('en')}>English</button>
          </div>
        </SettingRow>
        <SettingRow label={t.currency_lbl}>
          <div className="toggle">
            <button className={currency === 'EUR' ? 'active' : ''} onClick={() => setCurrency('EUR')}>EUR €</button>
            <button className={currency === 'USD' ? 'active' : ''} onClick={() => setCurrency('USD')}>USD $</button>
          </div>
        </SettingRow>
        <SettingRow label="Density" last>
          <div className="toggle">
            <button className={density === 'comfortable' ? 'active' : ''} onClick={() => setDensity('comfortable')}>Comfortable</button>
            <button className={density === 'compact' ? 'active' : ''} onClick={() => setDensity('compact')}>Compact</button>
          </div>
        </SettingRow>
      </div>

      <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-3)', fontWeight: 500, padding: '0 4px 10px' }}>
        {t.account}
      </div>
      <div className="card" style={{ padding: 0, marginBottom: 28 }}>
        <SettingRow label="Email">
          <span style={{ color: 'var(--text-2)', fontSize: 14 }}>{user?.email ?? '—'}</span>
        </SettingRow>
        <SettingRow label="Plan">
          <span className="pill green">Pro</span>
        </SettingRow>
        <SettingRow label={t.change_password} last>
          <button className="btn btn-sm" onClick={() => { setPwOpen(o => !o); setPwError(null) }}>
            <Icon name={pwOpen ? 'chevronUp' : 'chevronDown'} size={13} />
          </button>
        </SettingRow>
        {pwOpen && (
          <form onSubmit={handleChangePassword} style={{ padding: '4px 16px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <input className="input" type="password" placeholder={t.current_password} value={currentPw} onChange={e => setCurrentPw(e.target.value)} required autoComplete="current-password" />
            <input className="input" type="password" placeholder={t.new_password} value={newPw} onChange={e => setNewPw(e.target.value)} required autoComplete="new-password" minLength={8} />
            <input className="input" type="password" placeholder={t.confirm_new_password} value={confirmPw} onChange={e => setConfirmPw(e.target.value)} required autoComplete="new-password" />
            {pwError   && <div style={{ fontSize: 13, color: 'var(--danger, #e05252)' }}>{pwError}</div>}
            {pwSuccess && <div style={{ fontSize: 13, color: 'var(--green, #3dba6f)' }}>{t.password_changed}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-primary" type="submit" disabled={pwLoading}>
                {pwLoading ? '…' : t.save}
              </button>
            </div>
          </form>
        )}
      </div>

      <div className="card" style={{ padding: 16, marginBottom: 28 }}>
        <button className="btn btn-block" onClick={onSignOut} style={{ color: 'var(--danger, #e05252)' }}>
          {t.sign_out}
        </button>
      </div>

      <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--red)', fontWeight: 500, padding: '0 4px 10px' }}>
        {t.delete_portfolio}
      </div>
      <div className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {portfolios.length > 0 && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <select
                className="input"
                style={{ width: '100%', appearance: 'none', textAlign: 'center', padding: '10px 44px 10px 44px' }}
                value={selectedId ?? ''}
                onChange={e => setSelectedId(Number(e.target.value))}
              >
                {portfolios.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <div style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--text-2)' }}>
                <Icon name="chevronDown" size={14} />
              </div>
            </div>
            <button
              className="btn"
              style={{ color: 'var(--danger, #e05252)', whiteSpace: 'nowrap' }}
              onClick={() => setConfirming(true)}
              disabled={!selectedPortfolio}
            >
              <Icon name="trash" size={14} /> {t.delete_portfolio}
            </button>
          </div>
        )}
      </div>

      {confirming && selectedPortfolio && (
        <DeletePortfolioModal
          t={t}
          portfolio={selectedPortfolio}
          onConfirm={handleConfirmDelete}
          onClose={() => setConfirming(false)}
        />
      )}
    </div>
  )
}
