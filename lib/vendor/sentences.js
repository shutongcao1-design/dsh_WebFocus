


export const SENT_END = '。！？!?'


export const TRAILING = '”’"\')）】」』'


const EN_PERIOD_TAIL_RE = /\s+[A-Z"'（(0-9]/uy

const TRAILING_SET = new Set(TRAILING)


export class Sentence {

  constructor(text, isHeading, index, group = 0) {
    this.text = text
    this.isHeading = isHeading
    this.index = index
    this.group = group
  }
}


export function isSentenceEnd(line, i) {
  const ch = line[i]
  if (SENT_END.includes(ch)) return true
  if (ch !== '.') return false

  if (i + 1 >= line.length) return true

  EN_PERIOD_TAIL_RE.lastIndex = i + 1
  return EN_PERIOD_TAIL_RE.test(line)
}


export function splitSentences(text) {

  const sentences = []
  let idx = 0
  let lineNo = 0
  for (const rawLine of String(text).split('\n')) {
    lineNo += 1
    const line = rawLine.trim()
    if (!line) continue
    if (line.startsWith('#')) {
      const body = line.replace(/^#+/, '').trim()
      sentences.push(new Sentence(body || line, true, idx, lineNo))
      idx += 1
      continue
    }
    let buf = ''
    let i = 0
    while (i < line.length) {
      buf += line[i]
      if (isSentenceEnd(line, i)) {
        let j = i + 1
        while (j < line.length && TRAILING_SET.has(line[j])) {
          buf += line[j]
          j += 1
        }
        const chunk = buf.trim()
        if (chunk) {
          sentences.push(new Sentence(chunk, false, idx, lineNo))
          idx += 1
        }
        buf = ''
        i = j
        continue
      }
      i += 1
    }
    const tail = buf.trim()
    if (tail) {
      sentences.push(new Sentence(tail, false, idx, lineNo))
      idx += 1
    }
  }
  return sentences
}
