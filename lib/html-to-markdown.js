


const DROP_CONTENT = new Set(['script', 'style', 'noscript', 'template', 'svg', 'head', 'iframe'])

const BLOCK = new Set([
  'p', 'div', 'section', 'article', 'header', 'footer', 'main', 'aside', 'nav',
  'ul', 'ol', 'dl', 'dt', 'dd', 'li', 'table', 'thead', 'tbody', 'tfoot', 'tr',
  'blockquote', 'figure', 'figcaption', 'form', 'fieldset', 'hr', 'pre', 'address',
])

const VOID = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta',
  'param', 'source', 'track', 'wbr',
])

const HEADING = { h1: 1, h2: 2, h3: 3, h4: 4, h5: 5, h6: 6 }


const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  copy: '©', reg: '®', trade: '™', hellip: '…', mdash: '—', ndash: '–',
  lsquo: '\u2018', rsquo: '\u2019', ldquo: '\u201c', rdquo: '\u201d',
  times: '×', divide: '÷', middot: '·', bull: '•', deg: '°', euro: '€',
  pound: '£', yen: '¥', sect: '§', para: '¶', dagger: '†', laquo: '«', raquo: '»',
}


export function decodeEntities(s) {
  if (!s.includes('&')) return s
  return s.replace(/&(#[0-9]+|#[xX][0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]{1,31});/g, (m, body) => {
    if (body[0] === '#') {
      const isHex = body[1] === 'x' || body[1] === 'X'
      const code = Number.parseInt(isHex ? body.slice(2) : body.slice(1), isHex ? 16 : 10)
      if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return m
      try {
        return String.fromCodePoint(code)
      } catch {
        return m
      }
    }
    const named = ENTITIES[body]
    return named === undefined ? m : named
  })
}


function ensureBlockBreak(out, state) {
  const last = state.lastContent
  if (last < 0) return
  const tail = out[last]
  if (tail.endsWith('\n\n')) return
  if (tail.endsWith('\n')) {
    out.push('\n')
    return
  }
  out.push('\n', ' ', '\n')
}


const WS_RUN_RE = /\s+/g
const NL_RUN_RE = /\n{3,}/g


export function parseStartTag(raw) {
  let i = 0
  const n = raw.length
  while (i < n && /[^\s/]/.test(raw[i])) i += 1
  const name = raw.slice(0, i).toLowerCase()
  const attrs = {}
  while (i < n) {
    while (i < n && /\s/.test(raw[i])) i += 1
    if (i >= n || raw[i] === '/') break
    const nameStart = i
    while (i < n && /[^\s=/]/.test(raw[i])) i += 1
    const attrName = raw.slice(nameStart, i).toLowerCase()
    while (i < n && /\s/.test(raw[i])) i += 1
    if (raw[i] !== '=') {
      if (attrName) attrs[attrName] = ''
      continue
    }
    i += 1
    while (i < n && /\s/.test(raw[i])) i += 1
    let value = ''
    const quote = raw[i]
    if (quote === '"' || quote === "'") {
      i += 1
      const end = raw.indexOf(quote, i)
      const stop = end === -1 ? n : end
      value = raw.slice(i, stop)
      i = end === -1 ? n : end + 1
    } else {
      const valueStart = i
      while (i < n && !/\s/.test(raw[i])) i += 1
      value = raw.slice(valueStart, i)
    }
    if (attrName) attrs[attrName] = decodeEntities(value)
  }
  return { name, attrs, selfClosing: raw.endsWith('/') }
}


function linkTarget(url) {
  return /[\s()]/.test(url) ? `<${url}>` : url
}


export function htmlToMarkdown(html, options = {}) {
  const src = typeof html === 'string' ? html : String(html ?? '')
  if (!src) return { markdown: '', links: 0, dropped: 0 }
  const out = []
  let links = 0
  let dropped = 0
  let i = 0
  const n = src.length

  const srcLower = src.toLowerCase()

  const linkStack = []

  const state = { lastContent: -1 }

  const pushText = (text) => {
    if (!text) return



    const decoded = decodeEntities(text).replace(WS_RUN_RE, ' ')
    if (!decoded.trim()) return
    out.push(decoded)
    state.lastContent = out.length - 1
  }
  const pushBlock = () => ensureBlockBreak(out, state)

  const pushContent = (text) => {
    out.push(text)
    state.lastContent = out.length - 1
  }
  while (i < n) {
    const lt = src.indexOf('<', i)
    if (lt === -1) {
      pushText(src.slice(i))
      break
    }
    if (lt > i) pushText(src.slice(i, lt))


    if (src.startsWith('<!--', lt)) {
      const end = src.indexOf('-->', lt + 4)
      i = end === -1 ? n : end + 3
      continue
    }
    if (src.startsWith('<!', lt) || src.startsWith('<?', lt)) {
      const end = src.indexOf('>', lt)
      i = end === -1 ? n : end + 1
      continue
    }

    const gt = src.indexOf('>', lt)
    if (gt === -1) {

      pushText(src.slice(lt))
      break
    }
    const inner = src.slice(lt + 1, gt)
    i = gt + 1

    if (inner.startsWith('/')) {
      const name = inner.slice(1).trim().toLowerCase()
      if (DROP_CONTENT.has(name)) continue




      if (name === 'li') continue
      if (name === 'a' && linkStack.length) {
        const open = linkStack.pop()
        const text = out.splice(open.textStart).join('').trim()
        state.lastContent = Math.min(state.lastContent, open.textStart - 1)
        if (open.href) {
          pushContent(text ? `[${text}](${linkTarget(open.href)})` : '')
          links += 1
        } else {
          pushContent(text)
        }
        continue
      }
      const level = HEADING[name]
      if (level) pushBlock()
      else if (BLOCK.has(name)) pushBlock()
      continue
    }

    const tag = inner.endsWith('/') ? inner.slice(0, -1) : inner
    const { name, attrs, selfClosing } = parseStartTag(tag)
    if (!name) continue



    if (DROP_CONTENT.has(name)) {
      dropped += 1
      if (!selfClosing && !VOID.has(name)) {









        const close = srcLower.indexOf(`</${name}`, i)
        if (close === -1) {




          i = n
          continue
        }
        const closeGt = src.indexOf('>', close)
        i = closeGt === -1 ? n : closeGt + 1
      }
      continue
    }

    if (name === 'br') {
      out.push('\n')
      continue
    }
    if (VOID.has(name) || selfClosing) {
      if (name === 'img') {
        const alt = attrs.alt ?? ''
        if (alt) pushText(alt)
      }
      if (name === 'hr') pushBlock()
      continue
    }

    const level = HEADING[name]
    if (level) {
      pushBlock()
      pushContent(`${'#'.repeat(level)} `)
      continue
    }
    if (name === 'li') {




      if (out.length && !out[out.length - 1].endsWith('\n')) out.push('\n')
      pushContent('- ')
      continue
    }
    if (name === 'pre') {
      pushBlock()
      continue
    }
    if (name === 'a') {
      linkStack.push({ href: attrs.href ?? '', textStart: out.length })
      continue
    }
    if (name === 'td' || name === 'th') {
      out.push(' | ')
      continue
    }
    if (BLOCK.has(name)) {
      pushBlock()
      continue
    }

  }


  while (linkStack.length) {
    const open = linkStack.pop()
    const text = out.splice(open.textStart).join('')
    out.push(text)
  }

  const markdown = out
    .join('')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(NL_RUN_RE, '\n\n')
    .replace(/\n[ \t]+/g, '\n')
    .trim()
  return { markdown, links, dropped }
}
