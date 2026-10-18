

import { kwHit } from './vendor/kw.js'


export const PAYWALL_MIN_CHARS = 600


export const PARTIAL_MODES = Object.freeze(['static', 'text'])


export const PAYWALL_MARKERS = Object.freeze([

  'subscribe to continue',
  'subscribe now',
  'subscribe to read',
  'subscribers only',
  'to keep reading',
  'keep reading and get access',
  'continue reading with a subscription',
  'become a member',
  'sign in to continue reading',
  'log in to continue reading',
  'this content is for subscribers',
  'premium content',
  'start your free trial',
  'already a subscriber',

  '订阅后继续',
  '订阅继续阅读',
  '继续阅读请订阅',
  '开通会员',
  '登录后继续阅读',
  '仅限会员',
  '付费阅读',
  '试读结束',
  '会员专享',
])


export const STUB_MARKERS = Object.freeze([
  'loading…',
  'loading...',
  'please wait',
  'enable javascript',
  'javascript is required',
  'javascript is disabled',
  'checking your browser',
  'loading the page',
  '正在加载',
  '请开启 javascript',
  '请启用 javascript',
  '请稍候',
])


export const PARTIAL_ACTIONS = Object.freeze({
  paywall:
    'this page is a PAYWALL/SUBSCRIPTION stub, NOT the article — the text you hold is only ' +
    'the preview. Do NOT present it as the full article. Ask the user whether they have an ' +
    'account and can supply the text, or fetch an alternative source covering the same ' +
    'story, or tell the user the full text sits behind a paywall',
  stub:
    'the page body looks like a stub, a half-rendered JS shell, or an index page rather ' +
    'than the article text. Confirm with another source before relying on it — do not treat ' +
    'it as the full text',
})


export function detectPartial(input = {}) {
  if (input.success === false) return { reason: '', ratio: 1.0 }
  const mode = String(input.mode ?? '')
  if (!PARTIAL_MODES.includes(mode)) return { reason: '', ratio: 1.0 }
  const text = typeof input.text === 'string' ? input.text : ''
  const n = text.trim().length


  if (n >= PAYWALL_MIN_CHARS) return { reason: '', ratio: 1.0 }
  const ratio = Math.round(Math.min(1.0, n / PAYWALL_MIN_CHARS) * 1000) / 1000
  if (PAYWALL_MARKERS.some((m) => kwHit(text, m))) return { reason: 'paywall', ratio }
  if (STUB_MARKERS.some((m) => kwHit(text, m))) return { reason: 'stub', ratio }
  return { reason: '', ratio: 1.0 }
}


export function markPartial(input) {
  if (!input || input.success === false) return input
  const { reason, ratio } = detectPartial(input)
  if (!reason) return input
  const out = { ...input }
  out.partial = true
  out.partialReason = reason
  out.partialRatio = ratio

  if (!out.suggestedAction) out.suggestedAction = PARTIAL_ACTIONS[reason] ?? ''
  return out
}


export function describePartial(input) {
  if (!input?.partial) return ''
  const pct = Math.round((input.partialRatio ?? 1) * 100)
  const reason = input.partialReason === 'paywall' ? 'PAYWALL/preview stub' : 'stub / half-rendered page'
  return (
    `⚠️ [partial: this looks like a ${reason} — only ${pct}% of a normal article's lower ` +
    `bound was retrieved. ${input.suggestedAction ?? PARTIAL_ACTIONS[input.partialReason] ?? ''}]`
  )
}
