

import { defaultJsonChars } from './budget.js'


export const LOW_YIELD_ROUNDS = 3

export const LOW_YIELD_MIN_CHARS = 2000

export const REPEAT_FAILURE_LIMIT = 3

export const SEARCH_DEDUP_OVERLAP = 0.7

export const SEARCH_DEDUP_MIN_URLS = 5


export const STOP_REASONS = Object.freeze({
  NONE: '',
  NO_PROGRESS: 'no_progress',
  DIMINISHING_RETURNS: 'diminishing_returns',
})


export function callSignature(toolName, args) {
  let blob
  try {
    blob = JSON.stringify(sortKeysDeep(args), (_k, v) =>
      typeof v === 'bigint' ? v.toString() : v,
    )
  } catch {
    blob = String(args)
  }
  return `${toolName}|${blob ?? String(args)}`
}


function sortKeysDeep(value) {
  if (Array.isArray(value)) return value.map(sortKeysDeep)
  if (value && typeof value === 'object') {
    const out = {}
    for (const key of Object.keys(value).sort()) out[key] = sortKeysDeep(value[key])
    return out
  }
  return value
}


export function candidateUrlsOf(sources) {
  const out = new Set()
  for (const s of sources ?? []) {
    const url = typeof s === 'string' ? s : s?.url
    if (typeof url === 'string' && url) out.add(url)
  }
  return out
}


export function countsAsEvidence(outcome) {
  return (
    outcome?.kind === 'fetch' &&
    outcome.ok === true &&
    outcome.fromCache !== true &&
    Number(outcome.charsKept ?? 0) > 0
  )
}


export function dedupHintText(overlap) {
  return (
    `[system note] ${Math.round(overlap * 100)}% of this search's candidate URLs are the ` +
    'same as your previous search — the result set is unlikely to change. Do NOT repeat ' +
    'this query. Either fetch a specific page you have not read yet from the results above, ' +
    'or wrap up and answer the user from the information already gathered.'
  )
}


export class RoundGovernor {

  constructor(options = {}) {
    this.webEnabled = options.webEnabled !== false
    this.repeatFailureLimit = options.repeatFailureLimit ?? REPEAT_FAILURE_LIMIT
    this.lowYieldRounds = options.lowYieldRounds ?? LOW_YIELD_ROUNDS
    this.lowYieldMinChars = options.lowYieldMinChars ?? LOW_YIELD_MIN_CHARS
    this.searchDedupOverlap = options.searchDedupOverlap ?? SEARCH_DEDUP_OVERLAP
    this.searchDedupMinUrls = options.searchDedupMinUrls ?? SEARCH_DEDUP_MIN_URLS

    this.prevToolChars = 0
    this.prevOpsCount = 0
    this.prevEvidenceFetched = 0
    this.lowYieldStrikes = 0

    this.prevSearchUrls = new Set()

    this._failCounts = new Map()

    this._repeatWorst = { n: 0, tool: '', shown: '' }

    this.lastStopReason = STOP_REASONS.NONE
  }


  noteToolOutcome(toolName, args, ok) {
    if (this.repeatFailureLimit <= 0) return
    const sig = callSignature(toolName, args)
    if (ok) {



      if (this._failCounts.delete(sig)) this._recomputeWorst()
      return
    }
    const n = (this._failCounts.get(sig) ?? 0) + 1
    this._failCounts.set(sig, n)
    if (n >= this._repeatWorst.n) {
      this._repeatWorst = { n, tool: toolName, shown: safeArgsPreview(args) }
    }
  }


  _recomputeWorst() {
    if (!this._failCounts.size) {
      this._repeatWorst = { n: 0, tool: '', shown: '' }
      return
    }
    let bestSig = ''
    let bestN = -1
    for (const [sig, n] of this._failCounts) {
      if (n > bestN) {
        bestN = n
        bestSig = sig
      }
    }
    const sep = bestSig.indexOf('|')
    this._repeatWorst = {
      n: bestN,
      tool: bestSig.slice(0, sep),
      shown: bestSig.slice(sep + 1, sep + 121),
    }
  }


  _repeatStop() {
    const { n, tool } = this._repeatWorst
    if (this.repeatFailureLimit <= 0 || n < this.repeatFailureLimit) {
      return { stop: false, note: '', event: '' }
    }
    return {
      stop: true,
      note:
        `No progress: the identical failing call \`${tool}\` with the same arguments has ` +
        `now failed ${n} times. Repeating it again will produce the same error — no further ` +
        'tool operations are possible; answer from the information already gathered, and ' +
        'state plainly what could not be completed and why.',
      event: `No progress: ${tool} has failed ${n} times in a row with identical arguments; wrap up and answer`,
    }
  }


  repeatSummary() {
    const { n, tool, shown } = this._repeatWorst
    return n ? `${tool} x${n} args=${shown}` : ''
  }


  onRoundStart(input) {
    const {
      round,
      toolChars = 0,
      fetchAttempts = 0,
      opsCount = 0,
      goalActive = false,
      evidenceFetched = 0,
    } = input ?? {}

    const opsProgress = opsCount > this.prevOpsCount
    this.prevOpsCount = opsCount


    const evidenceProgress = evidenceFetched > this.prevEvidenceFetched
    this.prevEvidenceFetched = evidenceFetched
    const gained = Math.max(0, toolChars - this.prevToolChars)
    this.prevToolChars = toolChars
    this.lastStopReason = STOP_REASONS.NONE

    if (round <= 1) return { stop: false, note: '', event: '', reason: STOP_REASONS.NONE }






    const repeat = this._repeatStop()
    if (repeat.stop) {
      this.lastStopReason = STOP_REASONS.NO_PROGRESS
      return { stop: true, note: repeat.note, event: repeat.event, reason: STOP_REASONS.NO_PROGRESS }
    }

    if (this.lowYieldRounds <= 0 || goalActive) {
      return { stop: false, note: '', event: '', reason: STOP_REASONS.NONE }
    }
    if (opsProgress || evidenceProgress) {
      this.lowYieldStrikes = 0
      return { stop: false, note: '', event: '', reason: STOP_REASONS.NONE }
    }
    if (this.webEnabled && fetchAttempts > 0 && gained < this.lowYieldMinChars) {
      this.lowYieldStrikes += 1
    } else {
      this.lowYieldStrikes = 0
    }
    if (this.lowYieldStrikes < this.lowYieldRounds) {
      return { stop: false, note: '', event: '', reason: STOP_REASONS.NONE }
    }
    this.lastStopReason = STOP_REASONS.DIMINISHING_RETURNS
    return {
      stop: true,
      note:
        `Diminishing returns: the last ${this.lowYieldStrikes} rounds each added fewer than ` +
        `${this.lowYieldMinChars} new characters of content and brought back no newly fetched ` +
        'page; no further tool operations are possible — answer from the information already ' +
        'gathered, and state plainly which parts of the question remain uncovered (do not ' +
        'claim that something was proven not to exist).',
      event: `${this.lowYieldStrikes} consecutive rounds added too little new content (<${this.lowYieldMinChars} chars); wrap up and answer`,
      reason: STOP_REASONS.DIMINISHING_RETURNS,
    }
  }


  searchCompleted(candUrls) {
    const current = candUrls instanceof Set ? candUrls : new Set(candUrls ?? [])
    let hint = ''
    if (current.size >= this.searchDedupMinUrls && this.prevSearchUrls.size) {
      let intersection = 0
      for (const url of current) if (this.prevSearchUrls.has(url)) intersection += 1
      const denom = Math.min(current.size, this.prevSearchUrls.size)
      const overlap = denom ? intersection / denom : 0
      if (overlap >= this.searchDedupOverlap) hint = dedupHintText(overlap)
    }
    this.prevSearchUrls = new Set(current)
    return hint
  }


  describe() {
    return {
      lowYieldStrikes: this.lowYieldStrikes,
      lowYieldRounds: this.lowYieldRounds,
      lowYieldMinChars: this.lowYieldMinChars,
      repeatWorst: this._repeatWorst.n,
      repeatTool: this._repeatWorst.tool,
      repeatLimit: this.repeatFailureLimit,
      trackedSignatures: this._failCounts.size,
      lastStopReason: this.lastStopReason,
    }
  }
}


export function safeArgsPreview(args) {
  try {
    const s = JSON.stringify(sortKeysDeep(args), (_k, v) =>
      typeof v === 'bigint' ? v.toString() : v,
    )
    return (s ?? String(args)).slice(0, 120)
  } catch {
    return String(args).slice(0, 120)
  }
}
