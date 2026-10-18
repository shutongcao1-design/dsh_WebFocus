


export const INVISIBLE_RE =
  /[\u00ad\u061c\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff\u{e0000}-\u{e007f}\u{e0100}-\u{e01ef}]/gu


export const INVISIBLE_TEST_RE = new RegExp(INVISIBLE_RE.source, 'u')


export function inspectInvisible(text) {
  const counts = new Map()
  for (const ch of String(text ?? '')) {

    if (INVISIBLE_TEST_RE.test(ch)) {
      const cp = ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')
      counts.set(cp, (counts.get(cp) ?? 0) + 1)
    }
  }
  return counts
}


export function stripInvisibleChars(text) {
  const src = typeof text === 'string' ? text : String(text ?? '')
  if (!src) return { text: src, stripped: 0 }

  let stripped = 0
  const out = src.replace(INVISIBLE_RE, () => {
    stripped += 1
    return ''
  })
  return { text: out, stripped }
}


export const SANITIZE_CALL_SITES = Object.freeze([
  'assemble.js: compressStage (all fetched text, before link compression)',
])
