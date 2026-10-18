

import { classifyFetchFailure } from './classify.js'


export const HTML_INPUT_CAP = 2_000_000


export function withClassification(err, context = {}) {
  if (!err || typeof err !== 'object') return err
  const memo = err.webFocusClassification ?? err.cause?.webFocusClassification
  if (memo) return err
  const classification = classifyFetchFailure({


    code: typeof err.code === 'string' ? err.code : undefined,
    error: err.message ?? String(err),
    statusCode: context.statusCode,
    mode: context.mode,
  })
  const wrapper = new Error(err.message ?? String(err), { cause: err })
  wrapper.code = err.code
  wrapper.name = err.name
  wrapper.webFocusClassification = classification
  return wrapper
}


export function classificationAdvice(err) {
  const classification = err?.webFocusClassification ?? err?.cause?.webFocusClassification
  if (!classification) return ''
  const { errorClass, action } = classification
  if (!action) return ''
  return `[${errorClass}] ${action}`
}


export function noticeHeadChars(parts = {}) {
  let n = 0
  if (parts.rawPath) n += `[Full page text cached at path ${parts.rawPath}]\n\n`.length
  if (parts.partialNote) n += `${parts.partialNote}\n\n`.length
  if (parts.markupNote) n += `${parts.markupNote}\n\n`.length
  if (parts.truncationNote) n += `${parts.truncationNote}\n\n`.length
  return n
}


export function withRawPointer(text, rawPath) {
  if (!rawPath) return text
  return `[Full page text cached at path ${rawPath}]\n\n${text}`
}


export function withPartialNotice(text, notice) {
  if (!notice) return text
  return `${notice}\n\n${text}`
}


export function withTruncationNote(text, notice) {
  if (!notice) return text
  return `${notice}\n\n${text}`
}


export function withMarkupNote(text, notice) {
  if (!notice) return text
  return `${notice}\n\n${text}`
}


export function withCacheNotice(text, notice) {
  if (!notice) return text
  return `${notice}\n\n${text}`
}


export function applyHeadNotes(text, parts = {}) {
  let out = text
  out = withMarkupNote(out, parts.markupNote)
  out = withPartialNotice(out, parts.partialNote)
  out = withTruncationNote(out, parts.truncationNote)
  out = withRawPointer(out, parts.rawPath)
  return out
}
