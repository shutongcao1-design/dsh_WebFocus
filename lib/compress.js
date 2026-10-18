


export const ANCHOR_MAX = 500

export const URL_MAX = 500

export const SOURCES_MAX = 30


const MD_LINK_TAIL = `(?:\\s+[^)]{0,${ANCHOR_MAX}})?`

const MD_IMAGE_RE = new RegExp(
  `!\\[([^\\]]{0,${ANCHOR_MAX}})\\]\\(\\s*(https?://[^)\\s]{1,${URL_MAX}})${MD_LINK_TAIL}\\)`,
  'g',
)
const MD_LINK_RE = new RegExp(
  `\\[([^\\]]{0,${ANCHOR_MAX}})\\]\\(\\s*(https?://[^)\\s]{1,${URL_MAX}})${MD_LINK_TAIL}\\)`,
  'g',
)

const MD_CITE_RE = new RegExp(
  `\\[\\[([^\\[\\]]{1,${ANCHOR_MAX}})\\]\\]\\(\\s*(https?://[^)\\s]{1,${URL_MAX}})${MD_LINK_TAIL}\\)`,
  'g',
)

const AUTOLINK_RE = new RegExp(`<(https?://[^>\\s]{1,${URL_MAX}})>`, 'g')


export const SOURCES_FOOTER_MARKER = '--- Sources (deduped) ---'


export function compressLinks(text, options = {}) {
  const sourcesMax = options.sourcesMax ?? SOURCES_MAX
  const sources = []
  const seen = new Set()

  const collect = (anchor, url) => {
    if (seen.has(url)) return
    seen.add(url)
    const trimmed = String(anchor ?? '').trim()
    sources.push([trimmed || url, url])
  }

  let out = String(text ?? '')


  out = out.replace(MD_CITE_RE, (_m, anchor, url) => {
    collect(anchor, url)
    return `[${anchor}]`
  })

  out = out.replace(MD_IMAGE_RE, (_m, anchor, url) => {
    collect(anchor, url)
    return anchor
  })

  out = out.replace(MD_LINK_RE, (_m, anchor, url) => {
    collect(anchor, url)
    return anchor
  })

  out = out.replace(AUTOLINK_RE, (_m, url) => {
    collect('', url)
    return ''
  })

  return { text: out, sources, dropped: Math.max(0, sources.length - sourcesMax) }
}


export function buildSourceFooter(sources, options = {}) {
  const sourcesMax = options.sourcesMax ?? SOURCES_MAX
  const marker = options.marker ?? SOURCES_FOOTER_MARKER
  if (!sources.length) return ''
  const lines = ['', marker]
  for (const [anchor, url] of sources.slice(0, sourcesMax)) {
    lines.push(`- [${anchor.slice(0, 80)}](${url})`)
  }
  if (sources.length > sourcesMax) {
    lines.push(`…[${sources.length - sourcesMax} more links omitted]`)
  }
  return lines.join('\n')
}




export const JUNK_LINE_MIN = 200
export function isJunkLine(line) {
  const s = String(line ?? '')
  if (s.length < JUNK_LINE_MIN) return false
  if (/"wt"\s*:/.test(s) && /"params"\s*:/.test(s)) return true
  if (/^\s*\\n?",\s*"/.test(s) && /"wt"\s*:/.test(s)) return true
  return false
}


export function filterJunkLines(text) {
  const lines = String(text ?? '').split('\n')
  let dropped = 0
  const out = []
  for (const line of lines) {
    if (isJunkLine(line)) {
      dropped += 1
      continue
    }
    out.push(line)
  }
  return { text: out.join('\n'), dropped }
}




export const MENU_LINE_MAX = 40
export const MENU_RUN_MIN = 3
export const MENU_END_CHARS = '。！？.!?:：,，;；'

export const MENU_BULLET_MAX = 18
const BULLET_MARKERS = '-*+'


export function hasBulletMarker(line) {
  const r = String(line).replace(/^\s+/, '')
  return r.length >= 2 && BULLET_MARKERS.includes(r[0]) && (r[1] === ' ' || r[1] === '\t')
}


export function isMenuLine(line) {
  const raw = String(line)
  if (raw.trimStart().startsWith('#')) return false




  if (raw.trimStart().startsWith('|')) return false
  const s = raw.trim().replace(/^[*\-+#>\s]+/, '').trim()
  if (!s || s.length > MENU_LINE_MAX) return false
  if (/[0-9]/.test(s)) return false
  for (const c of MENU_END_CHARS) if (s.includes(c)) return false
  if (hasBulletMarker(raw) && s.length > MENU_BULLET_MAX) return false
  return true
}


export function filterMenuBlocks(text, options = {}) {
  const runMin = options.runMin ?? MENU_RUN_MIN
  const lines = String(text ?? '').split('\n')
  const out = []
  let i = 0
  let dropped = 0
  while (i < lines.length) {
    let j = i
    let menuCount = 0
    while (j < lines.length && (!lines[j].trim() || isMenuLine(lines[j]))) {
      if (isMenuLine(lines[j])) menuCount += 1
      j += 1
    }
    if (menuCount >= runMin) {
      dropped += j - i
      i = j
      continue
    }
    if (j === i) {
      out.push(lines[i])
      i += 1
      continue
    }
    for (let k = i; k < j; k += 1) out.push(lines[k])
    i = j
  }
  return { text: out.join('\n'), dropped }
}


export function compressPageText(text, options = {}) {
  const src = String(text ?? '')
  if (!src.trim()) {
    return { text: src, originalChars: src.length, sourceCount: 0, menuDropped: 0 }
  }
  const links = compressLinks(src, options)
  const junk = filterJunkLines(links.text)
  const menu = filterMenuBlocks(junk.text)
  const footer = buildSourceFooter(links.sources, options)
  const fullText = menu.text + (footer ? `\n${footer}` : '')
  return {
    text: fullText,
    originalChars: src.length,
    sourceCount: links.sources.length,
    menuDropped: menu.dropped,
    junkDropped: junk.dropped,
  }
}


export function splitSourceFooter(fullText, marker = SOURCES_FOOTER_MARKER) {
  const src = String(fullText ?? '')
  const idx = src.lastIndexOf(marker)
  if (idx === -1) return { body: src, footer: '' }
  return {
    body: src.slice(0, idx).replace(/\n+$/, ''),
    footer: `\n\n${src.slice(idx)}`,
  }
}
