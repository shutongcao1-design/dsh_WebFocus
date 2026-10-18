

import { SOURCES_FOOTER_MARKER, splitSourceFooter } from './compress.js'
import { safeClip, safeSlice } from './vendor/unicode.js'


export const MAX_TEXT_LENGTH = 80000


export const WINDOW_MARKER_RESERVE = 200


export const PAGE_SELECT_MIN_RETENTION = 0.4


export function truncationMarker(n, total) {
  return (
    `\n\n[Page truncated: showing first ${n} of ${total} chars — the remainder ` +
    `was cut to protect the context window. Base your answer on the visible ` +
    `part only; do not guess the omitted content. To READ THE REMAINDER: if a ` +
    `"[Full page text cached at path …]" line is shown at the top of this ` +
    `result, read that path (it holds the full uncompressed text); otherwise ` +
    `re-fetch this URL with full=true&offset=${n} to get the next section.]`
  )
}


export function capPageText(text, options = {}) {
  const maxLength = options.maxLength ?? MAX_TEXT_LENGTH
  const marker = options.marker ?? truncationMarker
  const src = typeof text === 'string' ? text : String(text ?? '')




  if (maxLength <= 0) return ''
  if (!src || src.length <= maxLength) return src

  const { body, footer } = splitSourceFooter(src, options.footerMarker ?? SOURCES_FOOTER_MARKER)



  const cappedFooter = safeSlice(footer, Math.max(0, Math.trunc(maxLength / 4)))




  const probe = marker(src.length, src.length)
  const quota = Math.max(0, maxLength - cappedFooter.length - probe.length)
  const out = safeSlice(body, quota) + marker(quota, src.length) + cappedFooter









  return out.length <= maxLength ? out : safeClip(out, maxLength)
}


export function applyRetentionBreaker(res, options = {}) {
  const minRetention = options.minRetention ?? PAGE_SELECT_MIN_RETENTION
  const maxKeep = options.maxKeep ?? 24000
  if (!res || res.total === 0) {
    return { text: res ? res.text : '', skipped: false }
  }
  if (res.keptRatio >= minRetention) {
    return { text: res.text, skipped: false }
  }
  const pct = Math.round(res.keptRatio * 100)
  const keptFull = res.keptFullText ?? res.text
  const header =
    `[digest SKIPPED: only ${res.kept}/${res.total} sentences (${pct}%) fit the ` +
    `${maxKeep}-char digest budget, which would leave mostly omission markers — ` +
    `the compressed full text is injected instead. Read it as complete; no need ` +
    `to re-fetch with full=true.]\n\n`


  return { text: header + keptFull, skipped: true }
}
