

import { MAX_TEXT_LENGTH, WINDOW_MARKER_RESERVE } from './cap.js'
import { safeSlice } from './vendor/unicode.js'


export function windowMarker(start, end, total) {
  const tailNote =
    end >= total
      ? ' This is the END of the page.'
      : ` Ask again with offset=${end} for the next section (up to char ${total}).`
  return `[Content window: chars ${start}–${end} of ${total}.${tailNote}]\n\n`
}


export function pastEndMarker(start, total) {
  return (
    `[Content window: offset ${start} is past the end of this page (it has ` +
    `${total} chars). Re-fetch with offset=0 to read it, or read the cached ` +
    `full page if a path is shown above.]`
  )
}


export function windowPageText(text, offset = 0, limit = 0, options = {}) {
  const src = typeof text === 'string' ? text : String(text ?? '')

  if (offset <= 0 && limit <= 0) return src
  const maxLength = options.maxLength ?? MAX_TEXT_LENGTH
  const reserve = options.reserve ?? WINDOW_MARKER_RESERVE
  const total = src.length

  const effectiveLimit = Math.min(
    limit > 0 ? limit : maxLength,
    Math.max(0, maxLength - reserve),
  )








  const rawStart = Math.max(0, Math.min(Math.trunc(offset), total))
  const start =
    rawStart > 0 && rawStart < total &&
    src.charCodeAt(rawStart) >= 0xdc00 && src.charCodeAt(rawStart) <= 0xdfff &&
    src.charCodeAt(rawStart - 1) >= 0xd800 && src.charCodeAt(rawStart - 1) <= 0xdbff
      ? rawStart - 1
      : rawStart
  const end = Math.min(total, start + effectiveLimit)

  if (start >= total) return pastEndMarker(start, total)

  return windowMarker(start, end, total) + safeSlice(src.slice(start), end - start)
}
