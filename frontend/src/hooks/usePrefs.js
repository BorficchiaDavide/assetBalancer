import { useState } from 'react'

const KEY = 'assetbalancer_prefs'

function load() {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? JSON.parse(raw) : {}
  } catch { return {} }
}

function save(patch) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...load(), ...patch }))
  } catch {}
}

export function usePrefs() {
  const prefs = load()

  const [lang,     setLangState]     = useState(prefs.lang     || 'it')
  const [theme,    setThemeState]    = useState(prefs.theme    || 'light')
  const [currency, setCurrencyState] = useState(prefs.currency || 'EUR')
  const [density,  setDensityState]  = useState(prefs.density  || 'comfortable')
  const [pnlColor, setPnlColorState] = useState(prefs.pnlColor || 'on')

  const setLang     = v => { setLangState(v);     save({ lang: v }) }
  const setTheme    = v => { setThemeState(v);    save({ theme: v }) }
  const setCurrency = v => { setCurrencyState(v); save({ currency: v }) }
  const setDensity  = v => { setDensityState(v);  save({ density: v }) }
  const setPnlColor = v => { setPnlColorState(v); save({ pnlColor: v }) }

  return { lang, setLang, theme, setTheme, currency, setCurrency, density, setDensity, pnlColor, setPnlColor }
}
