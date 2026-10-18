


const HI_MIN = 0xd800
const HI_MAX = 0xdbff

const LO_MIN = 0xdc00
const LO_MAX = 0xdfff


export function isHighSurrogate(code) {
  return code >= HI_MIN && code <= HI_MAX
}


export function isLowSurrogate(code) {
  return code >= LO_MIN && code <= LO_MAX
}


export function safeSlice(s, n) {
  const str = typeof s === 'string' ? s : String(s ?? '')
  const k = Math.max(0, Math.trunc(Number(n)) || 0)
  if (k >= str.length) return str
  if (k <= 0) return ''

  if (isHighSurrogate(str.charCodeAt(k - 1))) return str.slice(0, k - 1)
  return str.slice(0, k)
}


export function safeClip(s, n, ellipsis = '…') {
  const str = typeof s === 'string' ? s : String(s ?? '')
  const k = Math.max(0, Math.trunc(Number(n)) || 0)
  if (str.length <= k) return str
  if (k <= ellipsis.length) return ellipsis.slice(0, k)
  return safeSlice(str, k - ellipsis.length) + ellipsis
}


export function countLoneSurrogates(s) {
  const str = typeof s === 'string' ? s : String(s ?? '')
  let n = 0
  for (let i = 0; i < str.length; i += 1) {
    const c = str.charCodeAt(i)
    if (isHighSurrogate(c)) {
      const d = i + 1 < str.length ? str.charCodeAt(i + 1) : 0
      if (!isLowSurrogate(d)) n += 1
    } else if (isLowSurrogate(c)) {
      const p = i - 1 >= 0 ? str.charCodeAt(i - 1) : 0
      if (!isHighSurrogate(p)) n += 1
    }
  }
  return n
}
