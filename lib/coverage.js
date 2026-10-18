

import { SelectionResult } from './select.js'


export function describeCoverage(res) {
  if (!res || res.total === 0) return ''
  const pct = Math.round(res.keptRatio * 100)
  let note =
    `⚠️ [digest: kept ${res.kept}/${res.total} sentences = ` +
    `${fmt(res.keptChars)} of ${fmt(res.totalChars)} chars ` +
    `(${pct}% of sentences). The text injected below is ` +
    `${fmt(res.text.length)} chars including omission markers; the omitted ` +
    `sentences are NOT included — pass full=true to inject the whole ` +
    `page, or read the cached full page if a pointer is given above]`
  if (res.fallback) {




    note +=
      '\n⚠️ [digest fallback: no query term matched this page, so ' +
      'only headings and the first/last sentences are shown — ' +
      'do not conclude from this that the page lacks the topic; ' +
      're-fetch with full=true or a different focus]'
  } else if (res.keptRatio < 0.4) {





    note +=
      '\n⚠️ [digest: sparse match — only ' +
      `${pct}% of sentences mention the focus, so unrelated text was omitted. ` +
      'If the answer needs material the focus did not name, pass full=true or ' +
      'read the cached full page.]'
  }
  return note
}


export function describeSelection(res) {
  if (!res || res.total === 0) return 'skipped(short)'
  const tag = res.fallback ? ' fallback' : ''
  const pct = Math.round(res.keptRatio * 100)
  return (
    `kept ${res.kept}/${res.total} sentences ` +
    `(${fmt(res.keptChars)}/${fmt(res.totalChars)} chars, ${pct}%)${tag}`
  )
}


export function dumpsStats(res) {
  return JSON.stringify({
    kept: res.kept,
    total: res.total,
    keptChars: res.keptChars,
    totalChars: res.totalChars,
    fallback: res.fallback,
  })
}


export function fmt(n) {
  return String(Math.trunc(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

export { SelectionResult }
