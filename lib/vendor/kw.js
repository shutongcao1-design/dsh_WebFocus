


const PURE_DIGITS_RE = /^\d+$/


export function kwHit(haystack, kw) {
  if (!haystack || !kw) return false
  const hay = String(haystack).toLowerCase()
  const k = String(kw)
  if (PURE_DIGITS_RE.test(k)) {

    return new RegExp(`\\b${k}\\b`).test(hay)
  }

  return hay.includes(k.toLowerCase())
}


export function matchFirstRule(haystack, rules) {
  for (let i = 0; i < rules.length; i += 1) {
    const rule = rules[i]
    for (const kw of rule.keywords) {
      if (kwHit(haystack, kw)) {
        return { errorClass: rule.errorClass, matchedKeyword: kw, ruleIndex: i }
      }
    }
  }
  return null
}
