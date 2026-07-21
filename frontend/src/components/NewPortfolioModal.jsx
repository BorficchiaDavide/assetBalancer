import { useState } from 'react'

export function NewPortfolioModal({ t, onClose, onCreate }) {
  const [name, setName] = useState('')

  function handleSubmit(e) {
    e.preventDefault()
    if (!name.trim()) return
    onCreate(name.trim())
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
      display: 'grid', placeItems: 'center', zIndex: 1000,
    }}>
      <div className="card" style={{ width: 360, padding: 28 }}>
        <h3 style={{ margin: '0 0 20px', fontSize: 18, fontWeight: 600, letterSpacing: '-0.02em' }}>
          {t.new_portfolio}
        </h3>
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label className="label">{t.portfolio_name}</label>
            <input
              className="input"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={t.portfolio_name_placeholder}
              autoFocus
            />
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
            <button type="button" className="btn" onClick={onClose}>{t.cancel}</button>
            <button type="submit" className="btn btn-primary" disabled={!name.trim()}>{t.create}</button>
          </div>
        </form>
      </div>
    </div>
  )
}
