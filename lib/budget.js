

import { safeSlice } from './vendor/unicode.js'


export const DEFAULT_CHARS_PER_TOKEN = 2.15


export function messageChars(message, options = {}) {
  const jsonChars = options.jsonChars ?? defaultJsonChars
  if (!message || typeof message !== 'object') return 0
  return (
    jsonChars(message.content) +
    jsonChars(message.reasoningContent ?? message.reasoning_content) +
    jsonChars(message.toolCalls ?? message.tool_calls)
  )
}


export function defaultJsonChars(value) {
  if (typeof value === 'string') return value.length
  if (Array.isArray(value) || (value && typeof value === 'object')) {
    try {
      return JSON.stringify(value)?.length ?? 0
    } catch {
      return 0
    }
  }
  return 0
}


export function estimateTokens(messages, options = {}) {
  const ratio = options.charsPerToken > 0 ? options.charsPerToken : DEFAULT_CHARS_PER_TOKEN
  const extra = Math.max(0, Math.trunc(options.extraChars ?? 0))
  let chars = extra
  for (const m of messages ?? []) chars += messageChars(m, options)
  return chars / ratio
}


export function toolsChars(tools) {
  return defaultJsonChars(tools)
}


export function enforceCtxTokenBudget(messages, tokenBudget, options = {}) {
  const list = Array.isArray(messages) ? messages : []
  const ratio = options.charsPerToken > 0 ? options.charsPerToken : DEFAULT_CHARS_PER_TOKEN
  const extra = Math.max(0, Math.trunc(options.extraChars ?? 0))

  if (!(tokenBudget > 0)) {
    return { messages: list, rewritten: 0, overTokens: 0, stillOver: false, estTokens: 0 }
  }

  const estTokens = estimateTokens(list, { ...options, charsPerToken: ratio, extraChars: extra })
  if (estTokens <= tokenBudget) {
    return { messages: list, rewritten: 0, overTokens: 0, stillOver: false, estTokens }
  }

  const overTokens = Math.trunc(estTokens - tokenBudget)
  const overChars = Math.trunc(overTokens * ratio)


  const payloads = collectPayloads(list, options)
  const payloadChars = payloads.reduce((a, p) => a + p.chars, 0)
  if (!payloadChars) {



    return { messages: list, rewritten: 0, overTokens, stillOver: true, estTokens }
  }

  const keepChars = Math.max(0, payloadChars - overChars)
  const trimmed = trimPayloads(list, payloads, keepChars, options)






  const residual = estimateTokens(trimmed.messages, {
    ...options,
    charsPerToken: ratio,
    extraChars: extra,
  })
  return {
    messages: trimmed.messages,
    rewritten: trimmed.rewritten,
    overTokens,
    stillOver: residual > tokenBudget,
    estTokens,
  }
}


export function collectPayloads(messages, options = {}) {
  const payloadsOf = options.payloadsOf ?? defaultPayloadsOf
  const out = []
  messages.forEach((message, index) => {
    for (const handle of payloadsOf(message) ?? []) {
      const text = handle.get()
      if (typeof text !== 'string' || !text) continue
      out.push({ index, handle, chars: text.length })
    }
  })

  out.sort((a, b) => b.chars - a.chars)
  return out
}


export function defaultPayloadsOf(message) {
  if (!message || typeof message !== 'object') return []
  if (message.role !== 'tool' && message.role !== 'function') return []
  const out = []
  const consider = (obj, key, label) => {
    if (typeof obj?.[key] !== 'string' || !obj[key]) return
    out.push({
      label,
      get: () => obj[key],
      set: (v) => {
        obj[key] = v
      },
    })
  }
  consider(message, 'content', 'content')
  for (const key of ['text', 'searchResults', 'search_results', 'itemsJson']) {
    consider(message, key, key)
  }
  if (Array.isArray(message.content)) {
    message.content.forEach((block, i) => {
      if (block && typeof block === 'object' && typeof block.text === 'string' && block.text) {
        out.push({
          label: `content[${i}].text`,
          get: () => block.text,
          set: (v) => {
            block.text = v
          },
        })
      }
    })
  }
  return out
}


export function trimPayloads(messages, payloads, keepChars, options = {}) {
  const trim = options.trim ?? defaultTrimText
  const maxPasses = Math.max(1, options.maxPasses ?? 6)
  if (!payloads.length) return { messages, rewritten: 0, residualChars: totalOf(payloads) }

  const next = messages.map((m) => cloneMessage(m))
  let rewritten = 0
  for (let pass = 0; pass < maxPasses; pass += 1) {

    const live = payloads
      .map((p) => ({ p, text: resolveHandle(next[p.index], p) }))
      .filter((x) => typeof x.text === 'string' && x.text.length > 0)
    if (!live.length) break
    const total = live.reduce((a, x) => a + x.text.length, 0)
    if (total <= keepChars) break
    const deficit = total - keepChars

    let passRewrote = 0
    for (const { p, text } of live) {
      if (deficit <= 0) break
      const fair = Math.ceil((deficit * text.length) / total)
      const target = Math.max(0, text.length - fair)
      if (target >= text.length) continue
      const shortened = trim(text, target)
      if (shortened.length >= text.length) continue
      applyHandle(next[p.index], p, shortened)
      if (pass === 0) rewritten += 1
      passRewrote += 1
    }
    if (!passRewrote) break
  }
  return { messages: next, rewritten, residualChars: residualOf(next, payloads) }
}


function totalOf(payloads) {
  return payloads.reduce((a, p) => a + p.chars, 0)
}

function residualOf(messages, payloads) {
  let total = 0
  for (const p of payloads) {
    const text = resolveHandle(messages[p.index], p)
    total += typeof text === 'string' ? text.length : 0
  }
  return total
}


export function trimMarker(elided) {
  return `\n…[${elided} chars elided by the context budget guard]…`
}












export function trimmedLength(text, keepChars) {
  const len = text.length
  if (len <= keepChars) return len
  if (keepChars <= 0) return trimMarker(len).length
  return keepChars + trimMarker(len - keepChars).length
}


export const MIN_TRIMMED_LENGTH = trimMarker(Number.MAX_SAFE_INTEGER).length


export function trimTextToFit(text, maxChars) {
  const len = text.length
  if (maxChars >= len) return text
  const budget = Math.max(maxChars, MIN_TRIMMED_LENGTH)
  let lo = 0
  let hi = Math.min(budget, len)
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (trimmedLength(text, mid) <= budget) lo = mid
    else hi = mid - 1
  }

  return `${safeSlice(text, lo)}${trimMarker(len - lo)}`
}


export function defaultTrimText(text, keepChars) {
  if (text.length <= keepChars) return text
  return trimTextToFit(text, keepChars)
}




export const DEPTH_PROFILES = Object.freeze({
  quick: Object.freeze({ iterations: 1, fetchBudget: 8 }),
  standard: Object.freeze({ iterations: 10, fetchBudget: 12 }),
  deep: Object.freeze({ iterations: 0, fetchBudget: 0 }),
})


export const FORCED_ROUNDS = Object.freeze({ quick: 1, standard: 2, deep: 2 })


export const MAX_FETCH_BUDGET = 120


export const UNLIMITED_FETCH_BUDGET = 10 ** 9


export const UNLIMITED_ITER_CAP = 9999


export function clampFetchBudget(budget) {





  if (typeof budget !== 'number' && typeof budget !== 'string') return MAX_FETCH_BUDGET
  if (typeof budget === 'string' && budget.trim() === '') return MAX_FETCH_BUDGET
  const n = Number(budget)
  if (!Number.isFinite(n)) return MAX_FETCH_BUDGET
  return Math.max(0, Math.min(Math.trunc(n), MAX_FETCH_BUDGET))
}


export function resolveFetchBudget({ goalActive = false, goalBudget, profileBudget } = {}) {
  if (goalActive) return clampFetchBudget(goalBudget)



  if (typeof profileBudget === 'number' && profileBudget === 0) return UNLIMITED_FETCH_BUDGET
  return clampFetchBudget(profileBudget)
}


export function resolveIterations(profileIterations) {

  if (typeof profileIterations === 'number' && profileIterations === 0) return UNLIMITED_ITER_CAP
  const numeric = Number(profileIterations)
  if (!Number.isFinite(numeric)) return UNLIMITED_ITER_CAP
  return Math.max(1, Math.trunc(numeric))
}


export function describeBudget(outcome) {
  if (!outcome) return ''
  const { rewritten = 0, overTokens = 0, stillOver = false, estTokens = 0 } = outcome
  if (!overTokens) return `within budget (est ${Math.round(estTokens)} tokens)`
  return (
    `over by ${overTokens} tokens (est ${Math.round(estTokens)}); rewrote ${rewritten} payload(s)` +
    (stillOver ? ' — STILL OVER BUDGET (payload trimming cannot fix this)' : '')
  )
}


function cloneMessage(message) {
  if (!message || typeof message !== 'object') return message
  const copy = { ...message }
  if (Array.isArray(message.content)) {
    copy.content = message.content.map((b) => (b && typeof b === 'object' ? { ...b } : b))
  }
  return copy
}


function resolveHandle(clonedMessage, payload) {
  const handles = defaultPayloadsOf(clonedMessage)
  return handles.find((h) => h.label === payload.handle.label)?.get()
}


function applyHandle(clonedMessage, payload, value) {
  const handles = defaultPayloadsOf(clonedMessage)
  handles.find((h) => h.label === payload.handle.label)?.set(value)
}
