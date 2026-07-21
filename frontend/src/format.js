export function getCurrencySymbol(cur) {
  return cur === "USD" ? "$" : "€"
}

export function fxRate(from, to, rates = {}) {
  if (from === to) return 1
  if (from === "EUR" && rates[to])   return rates[to]
  if (to   === "EUR" && rates[from]) return 1 / rates[from]
  // fallback to approximate hardcoded values
  if (from === "EUR" && to === "USD") return 1.085
  if (from === "USD" && to === "EUR") return 0.922
  return 1
}

function formatNum(abs, decimals, useUS = false) {
  const fixed = abs.toFixed(decimals)
  const [intPart, decPart] = fixed.split('.')
  const intFormatted = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, useUS ? ',' : '.')
  const sep = useUS ? '.' : ','
  return decPart !== undefined ? `${intFormatted}${sep}${decPart}` : intFormatted
}

export function formatMoney(v, cur = "EUR", opts = {}) {
  const sym = getCurrencySymbol(cur)
  const sign = v < 0 ? "−" : ""
  const abs = Math.abs(v)
  const decimals = opts.max ?? 2
  const useUS = cur === "USD"
  const num = formatNum(abs, decimals, useUS)
  const placedRight = cur === "EUR"
  return placedRight ? `${sign}${num} ${sym}` : `${sign}${sym}${num}`
}

export function formatPct(v, digits = 2) {
  const sign = v > 0 ? "+" : v < 0 ? "−" : ""
  return `${sign}${formatNum(Math.abs(v), digits)}%`
}

export function formatQty(v) {
  return v.toLocaleString("it-IT", { maximumFractionDigits: 4 })
}
