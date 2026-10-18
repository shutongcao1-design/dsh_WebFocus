

import { kwHit } from './vendor/kw.js'


export const POLICY_BLOCK_TOKEN = 'policy_block'
export const READER_FORBIDDEN_TOKEN = 'reader_forbidden'
export const FORBIDDEN_TOKEN = 'forbidden_no_login'
export const UNSUPPORTED_CONTENT_TOKEN = 'unsupported_content'


export const POLICY_BLOCK_MARKERS = Object.freeze([
  POLICY_BLOCK_TOKEN,
  'you have been blocked',
  'you have been banned',
  'attention required',
  'error 1020',
  '402',
  'payment required',
  '支付后访问',
  '拒绝自动化访问',
])


export const FAILURE_RULES = Object.freeze([
  {
    errorClass: 'cancelled',
    keywords: ['cancelled'],
    action: '',
  },
  {


    errorClass: 'sandbox_limit',
    keywords: ['sandbox_limit_asyncio'],
    action:
      'this is a sandbox/platform capability limit, not a safety problem with your code ' +
      'and not a site problem. Do not retry the same way; restructure to avoid it.',
  },
  {

    errorClass: 'policy_block',
    keywords: POLICY_BLOCK_MARKERS,
    action:
      'this is a site-policy block (Cloudflare-style), NOT a missing-login or rendering ' +
      'problem — changing UA/fingerprint/rendering will not help, and supplying credentials ' +
      'will not help either; do NOT retry this URL: switch to search aggregation or the ' +
      "site's official channel, and tell the user this publisher currently blocks automated " +
      'access',
  },
  {


    errorClass: 'blocked',
    keywords: [READER_FORBIDDEN_TOKEN],
    action:
      'the reader service got HTTP 401/403 for this URL and there is NO login evidence ' +
      '(no WWW-Authenticate header, no password form, no login-page redirect) — treat it ' +
      'as a bot/paywall/robots refusal, not a missing session. Do NOT ask the user for ' +
      'cookies on a bare 403. Next step: switch to an alternative source.',
  },
  {
    errorClass: 'blocked',
    keywords: ['反爬', '验证页面', 'anti-bot', 'cloudflare', 'captcha', 'just a moment', 'cf-chl'],
    action:
      'this site blocks automated fetches; if it turns out to need an account, ask the user ' +
      'to supply one; otherwise switch to an alternative source and tell the user this URL ' +
      'is unavailable',
  },
  {



    errorClass: 'unsupported_content',
    keywords: [UNSUPPORTED_CONTENT_TOKEN, '不支持的内容类型', 'application/pdf'],
    action:
      'this URL is a non-HTML document (PDF/binary) — it cannot be read here, and it is ' +
      'NOT a bot-block: do not retry or escalate. Find the HTML version of the same content, ' +
      'or ask the user to download the file into the workspace and read it from there',
  },
  {

    errorClass: 'http_error_403',
    keywords: [FORBIDDEN_TOKEN],
    action:
      'the site refused this request with HTTP 403 and there is NO login evidence — this is ' +
      'an access/bot-policy refusal, not a missing session. Do NOT ask the user for ' +
      'credentials: they have no account that would help. Switch to an alternative source — ' +
      'a mirror, the official API/channel, or an archive copy — and tell the user this URL ' +
      'refuses automated access',
  },
  {
    errorClass: 'auth_required',
    keywords: ['401', '403', 'login', 'unauthorized', 'forbidden', '需要登录', 'sign in'],
    action:
      'this page needs a logged-in session. This environment has no login channel, so: ask ' +
      'the user to provide the content or a credential-free alternative, and never present a ' +
      'login-walled page as if you had read it',
  },
  {
    errorClass: 'rate_limited',
    keywords: ['429', 'too many requests', 'rate limit', '限流'],
    action: 'wait before retrying, and reduce the number of parallel fetches to this site',
  },
  {
    errorClass: 'not_found',
    keywords: ['404', 'not found', '页面不存在'],
    action: 'do not retry this URL — it does not exist; pick another link',
  },
  {
    errorClass: 'server_error',
    keywords: ['500', '502', '503', '504', 'server error', 'bad gateway', 'service unavailable'],
    action: 'the site is failing; retry later or use another source',
  },
  {
    errorClass: 'timeout',
    keywords: ['timeout', 'timed out', '超时'],
    action: 'retry once; if it fails again, use another source',
  },
  {




    errorClass: 'empty_content',
    keywords: ['EMPTY_VISION_RESULT'],
    action:
      'the vision model produced no text for this image. That is NOT proof the image is ' +
      'blank — retry with another task (ocr / caption); if it stays empty, tell the user you ' +
      'could not read this image',
  },
  {
    errorClass: 'empty_content',
    keywords: ['空壳', '正文过少', '内容为空或过短', '无有效正文', 'spa_detected', '内容过短'],
    action:
      'the page body never rendered (the static response carried no readable text); treat this ' +
      'URL as content-unavailable — do not guess the omitted content',
  },
  {

    errorClass: 'browser_driver',
    keywords: [
      'browser_driver_error',
      'connection closed while reading from the driver',
      'browsertype.launch',
      "executable doesn't exist",
    ],
    action:
      'the headless-browser driver itself failed to start — this is NOT the site refusing you. ' +
      'Do not retry a JS-rendering path; pick another source',
  },
  {
    errorClass: 'network',
    keywords: [
      'connection',
      'dns',
      'ssl',
      'temporary failure',
      'name or service',
      'failed to connect',
      'cannot connect',
    ],
    action:
      'this looks like a network/DNS failure, not a content problem; retry once or use another ' +
      'source',
  },
])


export const DEFAULT_CLASSIFICATION = Object.freeze({
  errorClass: 'unknown',
  matchedKeyword: '',
  ruleIndex: -1,
  action: 'the failure cause is unclear; try an alternative source rather than retrying this URL',
})


export const ERROR_CODE_CLASSES = Object.freeze({
  WEB_BLOCKED_URL: 'blocked',
  WEB_INVALID_URL: 'unknown',
  WEB_UNSUPPORTED_CONTENT_TYPE: 'unsupported_content',
  WEB_FETCH_TOO_LARGE: 'unsupported_content',
  WEB_FETCH_TIMEOUT: 'timeout',
  WEB_ABORTED: 'cancelled',
  WEB_REDIRECT_BLOCKED: 'blocked',
  WEB_PROVIDER_UNAVAILABLE: 'unknown',
  WEB_PROVIDER_CONFIGURED_MISSING: 'unknown',
  WEB_PROVIDER_CONFIGURED_UNAVAILABLE: 'unknown',
  WEB_PROVIDER_AMBIGUOUS: 'unknown',
})


export function classifyFetchFailure(input = {}) {
  const explicit = typeof input.errorClass === 'string' ? input.errorClass.trim() : ''
  if (explicit) return fromExplicit(explicit)

  const code = typeof input.code === 'string' ? input.code.trim() : ''
  const byCode = code ? ERROR_CODE_CLASSES[code] : undefined
  if (byCode) {
    const ruleIndex = FAILURE_RULES.findIndex((r) => r.errorClass === byCode)
    return {
      errorClass: byCode,
      matchedKeyword: code,
      ruleIndex,
      action: ruleIndex >= 0 ? FAILURE_RULES[ruleIndex].action : DEFAULT_CLASSIFICATION.action,
    }
  }
























  const match = matchFirstTwoFaceRule(input)
  if (!match) return { ...DEFAULT_CLASSIFICATION }
  return {
    errorClass: match.errorClass,
    matchedKeyword: match.matchedKeyword,
    ruleIndex: match.ruleIndex,
    action: match.action,
  }
}


function matchFirstTwoFaceRule(input = {}) {
  const errorHaystack = buildErrorHaystack(input)
  const head = typeof input.text === 'string' ? input.text.slice(0, 20000) : ''
  for (let i = 0; i < FAILURE_RULES.length; i += 1) {
    const rule = FAILURE_RULES[i]
    for (const kw of rule.keywords) {
      if (errorHaystack && kwHit(errorHaystack, kw)) {
        return { errorClass: rule.errorClass, matchedKeyword: kw, ruleIndex: i, action: rule.action }
      }

      if (head && POLICY_BODY_MARKERS.includes(kw) && kwHit(head, kw)) {
        return { errorClass: rule.errorClass, matchedKeyword: kw, ruleIndex: i, action: rule.action }
      }
    }
  }
  return null
}


function fromExplicit(explicit) {
  const ruleIndex = FAILURE_RULES.findIndex((r) => r.errorClass === explicit)
  return {
    errorClass: explicit,
    matchedKeyword: '<explicit>',
    ruleIndex,
    action: ruleIndex >= 0 ? FAILURE_RULES[ruleIndex].action : DEFAULT_CLASSIFICATION.action,
  }
}


export function buildHaystack(input) {
  const parts = []
  if (input.error) parts.push(String(input.error))
  if (typeof input.message === 'string') parts.push(input.message)
  if (typeof input.mode === 'string') parts.push(input.mode)
  if (typeof input.code === 'string' && input.code) parts.push(input.code)
  if (Number.isFinite(input.statusCode)) parts.push(`HTTP ${input.statusCode}`)
  if (typeof input.text === 'string' && input.text) parts.push(input.text.slice(0, 2000))
  return parts.join('\n')
}


export function isPolicyBlock(input = {}) {



  const headers = input.headers ?? {}
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === 'cf-mitigated' && String(value).trim().toLowerCase() === 'deny') {
      return true
    }
  }

  const head = typeof input.text === 'string' ? input.text.slice(0, 20000) : ''
  if (head && POLICY_BODY_MARKERS.some((m) => kwHit(head, m))) return true








  const errorHaystack = buildErrorHaystack(input)
  return POLICY_BLOCK_MARKERS.some((m) => kwHit(errorHaystack, m))
}


export function buildErrorHaystack(input = {}) {
  const parts = []
  if (input.error) parts.push(String(input.error))
  if (typeof input.message === 'string') parts.push(input.message)
  if (typeof input.mode === 'string') parts.push(input.mode)
  if (Number.isFinite(input.statusCode)) parts.push(`HTTP ${input.statusCode}`)
  return parts.join('\n')
}


export const POLICY_BODY_MARKERS = Object.freeze(
  POLICY_BLOCK_MARKERS.filter((m) => m !== POLICY_BLOCK_TOKEN && m !== '402'),
)


export function ruleIndexOf(errorClass, keyword) {
  return FAILURE_RULES.findIndex(
    (r) => r.errorClass === errorClass && (keyword === undefined || r.keywords.includes(keyword)),
  )
}
