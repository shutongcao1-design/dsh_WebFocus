

import { stripInvisibleChars } from './sanitize.js'
import { compressPageText, splitSourceFooter } from './compress.js'
import { capPageText, WINDOW_MARKER_RESERVE } from './cap.js'
import { describeCoverage } from './coverage.js'
import { selectRelevant } from './select.js'
import { windowPageText } from './window.js'


export function compressStage(text, options = {}) {
  const raw = typeof text === 'string' ? text : String(text ?? '')
  const clean = stripInvisibleChars(raw)
  const compressed = compressPageText(clean.text, options)
  return {
    text: compressed.text,
    strippedInvisible: clean.stripped,
    sourceCount: compressed.sourceCount,
    menuDropped: compressed.menuDropped,
    junkDropped: compressed.junkDropped,
    originalChars: compressed.originalChars,
  }
}


export function injectStage(compressedText, options = {}) {
  const src = typeof compressedText === 'string' ? compressedText : String(compressedText ?? '')
  const notes = []
  let body = src
  let selection = null
  let windowed = false


  const wantSelect = options.select !== false && !options.full && Boolean(options.focus)
  if (wantSelect) {
    const { body: mainBody, footer } = splitSourceFooter(src)
    selection = selectRelevant(mainBody, options.focus)

















    const coverage = describeCoverage(selection)
    if (coverage) notes.push(coverage)
    body = selection.text + footer
  }



  let contentWasTruncated = false
  if ((options.offset ?? 0) > 0 || (options.limit ?? 0) > 0) {


    const headLen = notes.length ? notes.join('\n').length + 2 : 0
    const windowBudget = Math.max(1000, (options.maxLength ?? 80000) - headLen)






    const requested = options.limit ?? 0
    const budgetForBody = Math.max(0, windowBudget - WINDOW_MARKER_RESERVE)
    const effective = requested > 0 ? Math.min(requested, budgetForBody) : budgetForBody




    const budgetConstrained = requested <= 0 || requested > budgetForBody
    if (budgetConstrained && body.length - (options.offset ?? 0) > effective) {
      contentWasTruncated = true
    }
    body = windowPageText(body, options.offset, options.limit, {
      maxLength: windowBudget,
    })
    windowed = true
  }












  const headText = notes.length ? `${notes.join('\n')}\n\n` : ''
  const capBudget = Math.max(0, (options.maxLength ?? 80000) - headText.length)
  if (body.length > capBudget) contentWasTruncated = true
  body = capPageText(body, { maxLength: capBudget })

  return {
    text: headText + body,
    selection,
    windowed,
    notes,

    truncated: contentWasTruncated,
  }
}


export function assembleInjection(text, options = {}) {
  const compressed = compressStage(text, options)
  const injected = injectStage(compressed.text, options)
  return { ...compressed, ...injected, compressedText: compressed.text }
}
