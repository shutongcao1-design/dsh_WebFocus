

import { dirname, resolve, isAbsolute, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'


export function anchorToModule(moduleUrl, ...segments) {
  if (!moduleUrl || !moduleUrl.startsWith('file:')) {
    throw new TypeError('anchorToModule: moduleUrl must be the caller\'s import.meta.url')
  }
  const here = dirname(fileURLToPath(moduleUrl))
  return resolve(here, ...segments)
}


export function assertInsideRoot(root, candidate) {
  const absRoot = resolve(root)
  const abs = isAbsolute(candidate) ? resolve(candidate) : resolve(absRoot, candidate)
  const rel = relative(absRoot, abs)
  if (!rel || rel.startsWith('..') || isAbsolute(rel) || rel.split(sep).includes('..')) {
    throw new Error(`path escapes its root: ${candidate}`)
  }
  return abs
}
