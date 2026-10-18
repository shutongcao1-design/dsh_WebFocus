

import { stemToken, tokenize } from './vendor/tokenize.js'


export const DEFAULT_WEIGHTS = Object.freeze({

  query: 3.0,

  pos_first: 0.6,

  pos_last: 0.6,

  struct_numeric: 0.8,

  struct_after_heading: 0.5,
})


export const FORCE_HEAD = 2
export const FORCE_TAIL = 2


export const NUMERIC_RE =
  /\d{2,}|[0-9]+(?:\.[0-9]+)?%|[0-9]{4}\s*年|[0-9]+\s*月|[0-9]+\s*日|\$[0-9]+|[0-9]+(?:\.[0-9]+)?\s*(?:亿|万|千|million|billion|k|m|bn)/


export function scoreSentences(sentences, query, options = {}) {
  const w = { ...DEFAULT_WEIGHTS, ...(options.weights ?? {}) }
  const qTokens = new Set(tokenize(query))
  const qStems = new Set([...qTokens].map((t) => stemToken(t)))
  const n = Math.max(1, sentences.length)


  const tokenized = sentences.map((s) => tokenize(s.text))
  if (options.tokenizedOut) {
    options.tokenizedOut.qTokens = qTokens
    options.tokenizedOut.qStems = qStems
    options.tokenizedOut.tokenized = tokenized
  }

  const df = new Map()
  for (const toks of tokenized) {
    for (const t of new Set(toks)) df.set(t, (df.get(t) ?? 0) + 1)
  }
  if (options.tokenizedOut) options.tokenizedOut.df = df

  const scores = []
  for (let i = 0; i < sentences.length; i += 1) {
    const s = sentences[i]
    let score = 0
    if (qTokens.size) {
      for (const t of new Set(tokenized[i])) {




        if (!qTokens.has(t) && !qStems.has(stemToken(t))) continue
        const idf = Math.log(1 + n / Math.max(1, df.get(t) ?? 1))
        score += w.query * idf
      }
    }


    if (s.isHeading) score += w.struct_after_heading
    if (i < FORCE_HEAD) score += w.pos_first
    if (i >= n - FORCE_TAIL) score += w.pos_last
    if (NUMERIC_RE.test(s.text)) score += w.struct_numeric
    const prevHeading = i > 0 && sentences[i - 1].isHeading
    if (prevHeading && !s.isHeading) score += w.struct_after_heading
    scores.push(score)
  }
  return scores
}


export function loadWeightsFromEnv(raw) {
  const out = {}
  for (const chunk of String(raw ?? '').split(',')) {
    if (!chunk.includes('=')) continue
    const idx = chunk.indexOf('=')
    const k = chunk.slice(0, idx).trim()
    const v = chunk.slice(idx + 1).trim()
    if (!(k in DEFAULT_WEIGHTS)) continue
    const num = Number(v)
    if (!Number.isFinite(num)) continue
    out[k] = num
  }
  return out
}
