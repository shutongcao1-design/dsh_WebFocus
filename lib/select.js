

import { splitSentences } from './vendor/sentences.js'
import { stemToken } from './vendor/tokenize.js'
import { FORCE_HEAD, FORCE_TAIL, scoreSentences } from './score.js'


export const SELECT_DEFAULTS = Object.freeze({
  minChars: 8000,
  ratio: 0.5,
  minKeep: 4000,
  maxKeep: 24000,
})


export const COHESION_MAX_SENTENCES = 4


export const COVERAGE_MAX_TOKENS = 12
export const COVERAGE_RATIO = 0.3
export const COVERAGE_MAX_CHARS = 6000


export const ADAPTIVE_SCORE_RATIO = 0.22


export const FOCUS_BUDGET_PER_TOKEN = 320
export const FOCUS_BUDGET_MIN = 4000
export const FOCUS_BUDGET_MAX = 12000


export const HEADING_FORCE_MAX = 8


export const ANSWER_PROTECT_MAX = 3
export const ANSWER_PROTECT_CHARS = 1200


export const STICKY_DROP_BONUS = 0.75


function isContentToken(token) {
  return typeof token === 'string' && (token.length >= 2 || /[\u3400-\u4DBF\u4E00-\u9FFF]/.test(token))
}


export function omissionMarker(count) {
  return `…[${count} sentences omitted]…`
}


export class SelectionResult {
  constructor(text, kept, total, keptChars, totalChars, fallback) {
    this.text = text
    this.kept = kept
    this.total = total
    this.keptChars = keptChars
    this.totalChars = totalChars
    this.fallback = fallback
  }

  get keptRatio() {
    return this.kept / Math.max(1, this.total)
  }


  get skipped() {
    return this.total === 0
  }
}


export function expandGroups(sentences, keep) {
  const sticky = new Set()
  const byGroup = new Map()
  for (const s of sentences) {
    if (!byGroup.has(s.group)) byGroup.set(s.group, [])
    byGroup.get(s.group).push(s.index)
  }
  for (const members of byGroup.values()) {
    if (members.length > COHESION_MAX_SENTENCES) continue
    if (!members.some((i) => keep.has(i))) continue
    for (const i of members) {
      sticky.add(i)
      keep.add(i)
    }
  }
  return sticky
}


export function selectRelevant(text, query, options = {}) {
  const minChars = options.minChars ?? SELECT_DEFAULTS.minChars
  const ratio = options.ratio ?? SELECT_DEFAULTS.ratio
  const minKeep = options.minKeep ?? SELECT_DEFAULTS.minKeep
  const maxKeep = options.maxKeep ?? SELECT_DEFAULTS.maxKeep
  const src = typeof text === 'string' ? text : String(text ?? '')

  if (src.length <= minChars) {
    return new SelectionResult(src, 0, 0, src.length, src.length, false)
  }
  const sentences = splitSentences(src)
  if (!sentences.length) {
    return new SelectionResult(src, 0, 0, src.length, src.length, false)
  }




  const tok = {}
  const scores = scoreSentences(sentences, query, {
    weights: options.weights,
    tokenizedOut: tok,
  })
  const baseBudget = Math.trunc(Math.min(maxKeep, Math.max(minKeep, ratio * src.length)))
  const focusTokenCount = [...(tok.qTokens ?? [])].filter(isContentToken).length
  const focusBudget = Math.max(
    FOCUS_BUDGET_MIN,
    Math.min(FOCUS_BUDGET_MAX, FOCUS_BUDGET_PER_TOKEN * focusTokenCount),
  )
  const budget = Math.min(baseBudget, focusBudget)

  const forced = new Set()
  for (const s of sentences) {
    if (s.index < FORCE_HEAD || s.index >= sentences.length - FORCE_TAIL) forced.add(s.index)
  }





  const qTokens = tok.qTokens ?? new Set()
  const qStems = tok.qStems ?? new Set()
  const sentTokens = tok.tokenized ?? []
  const hasQuerySignal =
    qTokens.size > 0 &&
    sentTokens.some((toks) => toks.some((t) => qTokens.has(t) || qStems.has(stemToken(t))))


  const intentSignal =
    /\b(founded|founding|foundation|established|incorporat(?:ed|ion))\b/i.test(query) ||
    /\b(who|mayor|chief executive|ceo|founder|co-?founder|president|chairman|chairwoman|director)\b/i.test(query)
  const fallback = !hasQuerySignal && !intentSignal

  let forcedHeadings = 0
  for (const s of sentences) {
    if (!s.isHeading || forced.has(s.index)) continue
    if (fallback) {
      forced.add(s.index)
      continue
    }
    if (forcedHeadings >= HEADING_FORCE_MAX) break
    const toks = sentTokens[s.index] ?? []
    if (!toks.some((t) => qTokens.has(t) || qStems.has(stemToken(t)))) continue
    forced.add(s.index)
    forcedHeadings += 1
  }

  const render = (k) => {
    const parts = []
    let omitted = 0
    for (const s of sentences) {
      if (k.has(s.index)) {
        if (omitted) {
          parts.push(omissionMarker(omitted))
          omitted = 0
        }
        parts.push(s.text)
      } else {
        omitted += 1
      }
    }
    if (omitted) parts.push(omissionMarker(omitted))
    return parts.join('\n')
  }

  const keep = new Set(forced)
  const coverageKeep = new Set()
  const answerKeep = new Set()
  let sticky = new Set()
  if (!fallback) {

    let used = 0
    for (const s of sentences) if (keep.has(s.index)) used += s.text.length + 1





    const order = sentences
      .map((_, i) => i)
      .sort((a, b) => scores[b] - scores[a] || a - b)
    for (const i of order) {
      if (keep.has(i)) continue
      if (sentences[i].isHeading && !forced.has(i)) continue
      const size = sentences[i].text.length + 1
      if (used + size > budget) continue
      keep.add(i)
      used += size
    }




    let answerChars = 0
    for (const i of order) {
      if (answerKeep.size >= ANSWER_PROTECT_MAX) break
      if (sentences[i].isHeading) continue
      const toks = sentTokens[i] ?? []
      if (!toks.some((t) => qTokens.has(t) || qStems.has(stemToken(t)))) continue
      const size = sentences[i].text.length + 1
      if (answerKeep.size > 0 && answerChars + size > ANSWER_PROTECT_CHARS) continue
      if (!keep.has(i)) {
        const victims = [...keep]
          .filter((j) => !forced.has(j) && !answerKeep.has(j))
          .sort((a, b) => scores[a] - scores[b] || a - b)
        for (const v of victims) {
          if (used + size <= budget) break
          keep.delete(v)
          used -= sentences[v].text.length + 1
        }
        if (used + size > budget) continue
        keep.add(i)
        used += size
      }
      answerKeep.add(i)
      answerChars += size
    }




    if (options.coverage !== false && qTokens.size) {
      const df = tok.df ?? new Map()
      const stemDf = new Map()
      for (const [term, count] of df) {
        const st = stemToken(term)
        stemDf.set(st, (stemDf.get(st) ?? 0) + count)
      }
      const rareLimit = Math.max(2, Math.ceil(sentences.length * 0.01))
      const coverageTokens = [...qTokens]
        .filter(isContentToken)
        .map((t) => {
          const exact = df.get(t) ?? 0
          const st = stemToken(t)
          return { t, st, rarity: exact || (stemDf.get(st) ?? 0) }
        })
        .filter((x) => x.rarity > 0)
        .sort((a, b) => a.rarity - b.rarity || b.t.length - a.t.length)
        .slice(0, COVERAGE_MAX_TOKENS)
      const coverageCap = Math.min(COVERAGE_MAX_CHARS, Math.max(2000, Math.floor(budget * 0.5)))
      let coverageUsed = 0
      for (const { t, st, rarity } of coverageTokens) {
        const occurrences = []
        for (const s of sentences) {
          const toks = sentTokens[s.index] ?? []
          if (toks.includes(t) || toks.some((tok) => stemToken(tok) === st)) occurrences.push(s.index)
        }
        const ranked = occurrences.sort((a, b) => scores[b] - scores[a] || a - b)
        const rare = rarity <= rareLimit
        const take = rarity <= 2 ? ranked : rare ? ranked.slice(0, 2) : ranked.slice(0, 1)
        for (const i of take) {
          if (keep.has(i)) {
            coverageKeep.add(i)
            continue
          }
          const size = sentences[i].text.length + 1
          if (coverageUsed + size > coverageCap) continue
          if (used + size > budget) {
            const victims = [...keep]
              .filter((j) => !forced.has(j) && !coverageKeep.has(j) && !answerKeep.has(j))
              .sort((a, b) => scores[a] - scores[b] || a - b)
            for (const v of victims) {
              if (used + size <= budget) break
              keep.delete(v)
              used -= sentences[v].text.length + 1
            }
          }
          if (used + size > budget) continue
          keep.add(i)
          coverageKeep.add(i)
          coverageUsed += size
          used += size
        }
      }








      if (/\b(who|mayor|chief executive|ceo|founder|co-?founder|president|chairman|chairwoman|director)\b/i.test(query)) {
        const roleRe = /\b(?:mayor|chief executive|ceo|founder|co-?founder|president|chairman|chairwoman|director|governor|senator)\b/i
        const personRe = /\b[A-Z][a-z]+ [A-Z][a-z]+\b/
        const roleCandidates = []
        for (const s of sentences) {
          if (!roleRe.test(s.text) || !personRe.test(s.text)) continue
          const toks = sentTokens[s.index] ?? []
          if (!toks.some((t) => qTokens.has(t) || qStems.has(stemToken(t)))) continue
          roleCandidates.push(s.index)
        }
        roleCandidates.sort((a, b) => {


          const rowA = /^\s*\|/.test(sentences[a].text) ? 1 : 0
          const rowB = /^\s*\|/.test(sentences[b].text) ? 1 : 0
          return rowB - rowA || scores[b] - scores[a] || a - b
        })
        let roleUsed = 0
        for (const i of roleCandidates.slice(0, 3)) {
          if (keep.has(i)) {
            coverageKeep.add(i)
            continue
          }
          const size = sentences[i].text.length + 1
          if (roleUsed + size > 900) continue
          if (used + size > budget) {
            const victims = [...keep]
              .filter((j) => !forced.has(j) && !coverageKeep.has(j) && !answerKeep.has(j))
              .sort((a, b) => scores[a] - scores[b] || a - b)
            for (const v of victims) {
              if (used + size <= budget) break
              keep.delete(v)
              used -= sentences[v].text.length + 1
            }
          }
          if (used + size > budget) continue
          keep.add(i)
          coverageKeep.add(i)
          roleUsed += size
          used += size
        }
      }







      if (/\b(founded|founding|foundation|established|incorporat(?:ed|ion))\b/i.test(query)) {
        const yearRe = /\b(1[0-9]{3}|20[0-9]{2})\b/
        const labelRe = /\b(founded|established|incorporated|mission|created|opened|built|completed)\b/i
        const dated = []
        for (const s of sentences) {
          if (!/^\s*\|/.test(s.text)) continue
          if (!labelRe.test(s.text)) continue
          const m = yearRe.exec(s.text)
          if (!m) continue
          dated.push({ i: s.index, year: Number(m[1]) })
        }
        dated.sort((a, b) => a.year - b.year || a.i - b.i)
        for (const { i } of dated.slice(0, 1)) {
          if (keep.has(i)) {
            coverageKeep.add(i)
            continue
          }
          const size = sentences[i].text.length + 1
          if (size > 400) continue
          if (used + size > budget) {
            const victims = [...keep]
              .filter((j) => !forced.has(j) && !coverageKeep.has(j) && !answerKeep.has(j))
              .sort((a, b) => scores[a] - scores[b] || a - b)
            for (const v of victims) {
              if (used + size <= budget) break
              keep.delete(v)
              used -= sentences[v].text.length + 1
            }
          }
          if (used + size > budget) continue
          keep.add(i)
          coverageKeep.add(i)
          used += size
        }
      }
    }


    sticky = expandGroups(sentences, keep)






    if (options.adaptive !== false) {
      const maxScore = scores.reduce((m, x) => Math.max(m, x), 0)
      const cutoff = maxScore * ADAPTIVE_SCORE_RATIO
      if (cutoff > 0) {
        const byGroup = new Map()
        for (const s of sentences) {
          if (!byGroup.has(s.group)) byGroup.set(s.group, [])
          byGroup.get(s.group).push(s.index)
        }
        for (const members of byGroup.values()) {
          if (!members.some((i) => keep.has(i))) continue
          if (members.some((i) => forced.has(i) || coverageKeep.has(i) || answerKeep.has(i))) continue
          const best = members.reduce((m, i) => Math.max(m, scores[i]), 0)
          if (best >= cutoff) continue
          for (const i of members) keep.delete(i)
        }
        for (const i of [...keep]) {
          if (forced.has(i) || coverageKeep.has(i) || answerKeep.has(i) || sticky.has(i)) continue
          if (scores[i] < cutoff) keep.delete(i)
        }
      }
    }
  }

  let out = render(keep)













  if (!fallback && out.length > budget) {
    const dropCost = (i) => scores[i] + (sticky.has(i) ? STICKY_DROP_BONUS : 0)
    const candidates = [...keep]
      .filter((i) => !forced.has(i) && !coverageKeep.has(i) && !answerKeep.has(i))
      .sort((a, b) => dropCost(a) - dropCost(b) || a - b)
    for (const i of candidates) {
      if (out.length <= budget) break
      keep.delete(i)
      out = render(keep)
    }
  }

  let keptChars = 0
  let totalChars = 0
  for (const s of sentences) {
    totalChars += s.text.length
    if (keep.has(s.index)) keptChars += s.text.length
  }

  return new SelectionResult(out, keep.size, sentences.length, keptChars, totalChars, fallback)
}
