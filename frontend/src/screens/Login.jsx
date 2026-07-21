import { useState } from 'react'
import { Icon } from '../components/Icon'

export function Login({ t, onLogin, lang, setLang }) {
  const [mode, setMode]       = useState('signin')
  const [email, setEmail]     = useState('')
  const [pw, setPw]           = useState('')
  const [name, setName]       = useState('')
  const [error, setError]     = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    if (!email || !pw) return
    setError('')
    setLoading(true)
    try {
      await onLogin(mode, email, pw, name)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-bg">
      <div style={{ width: 380, display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 4px' }}>
          <div className="brand">
            <div className="brand-mark" />
            AssetBalancer
          </div>
          <div className="toggle">
            <button className={lang === 'it' ? 'active' : ''} onClick={() => setLang('it')}>IT</button>
            <button className={lang === 'en' ? 'active' : ''} onClick={() => setLang('en')}>EN</button>
          </div>
        </div>

        <div className="card" style={{ padding: 32 }}>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 600, letterSpacing: '-0.025em' }}>
            {mode === 'signin' ? t.welcome : t.create_account}
          </h1>
          <p style={{ margin: '8px 0 24px', color: 'var(--text-2)', fontSize: 14 }}>
            {mode === 'signin' ? t.welcome_sub : t.create_sub}
          </p>

          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {mode === 'signup' && (
              <div className="field">
                <label className="label">{t.full_name}</label>
                <input
                  className="input"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Mario Rossi"
                  disabled={loading}
                />
              </div>
            )}
            <div className="field">
              <label className="label">{t.email}</label>
              <input
                className="input"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                disabled={loading}
              />
            </div>
            <div className="field">
              <label className="label">{t.password}</label>
              <input
                className="input"
                type="password"
                value={pw}
                onChange={e => setPw(e.target.value)}
                placeholder="••••••••"
                disabled={loading}
              />
            </div>
            {mode === 'signin' && (
              <a style={{ fontSize: 13, color: 'var(--accent)', alignSelf: 'flex-end', cursor: 'pointer', textDecoration: 'none' }}>
                {t.forgot}
              </a>
            )}

            {error && (
              <div style={{ fontSize: 13, color: 'var(--red)', background: 'color-mix(in srgb, var(--red) 10%, transparent)', borderRadius: 8, padding: '8px 12px' }}>
                {error}
              </div>
            )}

            <button
              className="btn btn-primary btn-lg btn-block"
              type="submit"
              disabled={loading || !email || !pw}
              style={{ marginTop: 6, opacity: loading ? 0.7 : 1 }}
            >
              {loading
                ? <Icon name="refresh" size={16} />
                : mode === 'signin' ? t.sign_in : t.sign_up
              }
            </button>
          </form>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0 16px', color: 'var(--text-3)', fontSize: 12 }}>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            <span>{t.or}</span>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button className="btn btn-block" disabled style={{ justifyContent: 'center', padding: '12px 16px', opacity: 0.4, cursor: 'not-allowed' }}>
              <Icon name="apple" size={16} /> {t.continue_apple}
            </button>
            <button className="btn btn-block" disabled style={{ justifyContent: 'center', padding: '12px 16px', opacity: 0.4, cursor: 'not-allowed' }}>
              <Icon name="google" size={16} /> {t.continue_google}
            </button>
          </div>
        </div>

        <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--text-2)' }}>
          {mode === 'signin' ? t.no_account : t.have_account}{' '}
          <a
            style={{ color: 'var(--accent)', cursor: 'pointer', fontWeight: 500 }}
            onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError('') }}
          >
            {mode === 'signin' ? t.sign_up : t.sign_in}
          </a>
        </div>
      </div>
    </div>
  )
}
