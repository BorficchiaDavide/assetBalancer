import { useState, useRef, useEffect } from 'react'
import { Icon } from './Icon'

export function Topbar({ t, user, lang, setLang, theme, setTheme, tab, setTab, onSignOut, onSettings }) {
  const [profileOpen, setProfileOpen] = useState(false)
  const profileRef = useRef(null)

  useEffect(() => {
    if (!profileOpen) return
    function handleClickOutside(e) {
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setProfileOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [profileOpen])

  return (
    <div className="topbar">
      <div className="brand">
        <div className="brand-mark" />
        AssetBalancer
      </div>
      <div className="nav">
        <a
          className={tab === 'portfolio' ? 'active' : ''}
          onClick={() => setTab('portfolio')}
        >
          {t.dashboard}
        </a>
        <a
          className={tab === 'rebalance' ? 'active' : ''}
          onClick={() => setTab('rebalance')}
        >
          {t.rebalance}
        </a>
      </div>
      <div className="spacer" />
      <div className="toggle">
        <button className={lang === 'it' ? 'active' : ''} onClick={() => setLang('it')}>IT</button>
        <button className={lang === 'en' ? 'active' : ''} onClick={() => setLang('en')}>EN</button>
      </div>
      <button
        className="btn btn-ghost"
        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        style={{ padding: 8, borderRadius: 999 }}
      >
        <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={16} />
      </button>
      <div ref={profileRef} style={{ position: 'relative' }}>
        <button
          onClick={() => setProfileOpen(o => !o)}
          style={{ width: 32, height: 32, borderRadius: 999, background: 'var(--surface-2)', border: 'none', cursor: 'pointer', display: 'grid', placeItems: 'center', color: 'var(--text-2)' }}
        >
          <Icon name="user" size={14} />
        </button>
        {profileOpen && (
          <div style={{
            position: 'absolute', top: 44, right: 0, zIndex: 1000,
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 10, minWidth: 200,
            boxShadow: '0 8px 24px rgba(0,0,0,.25)',
            overflow: 'hidden',
          }}>
            {user && (
              <div style={{
                padding: '12px 16px', borderBottom: '1px solid var(--border)',
                fontSize: 13, color: 'var(--text-1)', fontWeight: 500,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {user.display_name || user.email}
                <div style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 400, marginTop: 2 }}>
                  {user.display_name ? user.email : ''}
                </div>
              </div>
            )}
            <button
              onClick={() => { setProfileOpen(false); onSettings() }}
              style={{
                width: '100%', padding: '11px 16px', background: 'none', border: 'none',
                cursor: 'pointer', textAlign: 'left', fontSize: 14,
                color: 'var(--text)',
                display: 'flex', alignItems: 'center', gap: 10,
                borderBottom: '1px solid var(--border)',
              }}
            >
              <Icon name="settings" size={15} />
              {t.settings}
            </button>
            <button
              onClick={() => { setProfileOpen(false); onSignOut() }}
              style={{
                width: '100%', padding: '11px 16px', background: 'none', border: 'none',
                cursor: 'pointer', textAlign: 'left', fontSize: 14,
                color: 'var(--danger, #e05252)',
                display: 'flex', alignItems: 'center', gap: 10,
              }}
            >
              <Icon name="logout" size={15} />
              {t.sign_out || 'Sign out'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
