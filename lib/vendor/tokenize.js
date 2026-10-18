


export const STOPWORDS = new Set(
  `
的 了 是 在 和 与 及 对 我 你 他 她 它 我们 你们 他们 这 那 这些 那些 有 就
都 而 也 被 把 给 从 到 中 上 下 里 一个 一种 什么 如何 怎么 为什么 以及
并且 但是 因为 所以 如果 可以 能够 需要 进行 通过 根据 关于 对于 其中
the a an of to in on for and or is are was were with that this it its as by at
from be can will what how why which who when where not but if then than
do does did have has had much many more most also into over under about
between during after before such only same too very just should could would
might must they their them our your he she his her
`.trim().split(/\s+/),
)


const TOKEN_CLEAN_RE = /^[^\p{L}\p{N}_]+|[^\p{L}\p{N}_]+$/gu


export function stemToken(word) {
  const w = String(word ?? '')
  if (!/^[a-z]+$/.test(w) || w.length < 4) return w
  let s = w
  if (s.endsWith('ies') && s.length > 4) s = `${s.slice(0, -3)}y`
  else if (s.endsWith('ing') && s.length > 5) s = s.slice(0, -3)
  else if (s.endsWith('ed') && s.length > 4) s = s.slice(0, -2)
  else if (s.endsWith('es') && s.length > 5) s = s.slice(0, -2)
  else if (s.endsWith('s') && !s.endsWith('ss') && s.length > 3) s = s.slice(0, -1)
  if (s.endsWith('e') && s.length > 4) s = s.slice(0, -1)
  return s
}


const FALLBACK_RE = /[A-Za-z0-9_]+|[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/g


export const HAS_SEGMENTER = typeof Intl !== 'undefined'
  && typeof Intl.Segmenter === 'function'


let cachedSegmenter
function segmenter() {
  if (cachedSegmenter === undefined) {
    try {
      cachedSegmenter = new Intl.Segmenter('zh', { granularity: 'word' })
    } catch {
      cachedSegmenter = null
    }
  }
  return cachedSegmenter
}


export function tokenize(text) {
  if (!text) return []
  const raw = []
  const seg = HAS_SEGMENTER ? segmenter() : null
  if (seg) {
    for (const part of seg.segment(String(text))) {
      if (part.isWordLike) raw.push(part.segment)
    }
  } else {
    raw.push(...(String(text).match(FALLBACK_RE) ?? []))
  }
  const out = []
  for (const w of raw) {
    const cleaned = String(w ?? '').trim().toLowerCase().replace(TOKEN_CLEAN_RE, '')
    if (!cleaned || STOPWORDS.has(cleaned)) continue
    out.push(cleaned)
  }
  return out
}


export function termInPage(term, pageText) {
  const t = (term ?? '').trim().toLowerCase()
  if (!t) return false
  const page = (pageText ?? '').toLowerCase()
  if (!page) return false
  if (/^[a-z0-9]+$/.test(t)) {
    return new RegExp(`(?<![a-z0-9])${t}(?![a-z0-9])`).test(page)
  }
  return page.includes(t)
}


const ALNUM_TERM_RE = /^[a-z0-9]+$/


const PAGE_WORD_RE = /[a-z0-9]+/g


export const TERM_MERGE_MAX = 40


export function termsOverlappingPage(termsByCategory, pageText, options = {}) {
  const maxTerms = options.maxTerms ?? TERM_MERGE_MAX

  const out = []
  const seen = new Set()
  const low = String(pageText ?? '').toLowerCase()
  if (!low) return out
  const pageWords = new Set(low.match(PAGE_WORD_RE) ?? [])
  for (const terms of Object.values(termsByCategory ?? {})) {
    for (const t of terms ?? []) {
      const key = String(t ?? '').trim().toLowerCase()
      if (!key || seen.has(key)) continue
      const hit = ALNUM_TERM_RE.test(key) ? pageWords.has(key) : termInPage(key, low)
      if (!hit) continue
      seen.add(key)
      out.push(String(t).trim())
      if (out.length >= maxTerms) return out
    }
  }
  return out
}
