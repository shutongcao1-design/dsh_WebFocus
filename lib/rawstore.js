

import { readFile, readdir, rm, stat } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { atomicWriteText, isTransientIOError } from './vendor/atomic.js'
import { assertInsideRoot, anchorToModule } from './vendor/paths.js'
import { safeSlice } from './vendor/unicode.js'


export const RAW_MAX_CHARS = 4 * 1024 * 1024

export const RAW_CLEANUP_DAYS = 30


export function rawNameFor(url) {
  const hash = createHash('sha256').update(String(url)).digest('hex').slice(0, 16)
  let host = 'unknown'
  try {
    host = new URL(String(url)).hostname.replace(/[^a-z0-9.-]/gi, '_').slice(0, 40)
  } catch {

  }
  return `${host}-${hash}.md`
}


export function createRawStore(spec) {
  const root = spec.dir
  const maxChars = spec.maxChars ?? RAW_MAX_CHARS


  async function save(url, rawText) {
    const text = typeof rawText === 'string' ? rawText : String(rawText ?? '')
    const clipped =
      text.length > maxChars
        ? `${safeSlice(text, maxChars)}\n\n[raw store truncated at ${maxChars} chars; the provider had already capped this body]`
        : text
    const path = assertInsideRoot(root, join(root, rawNameFor(url)))
    await atomicWriteText(path, clipped)
    return path
  }


  async function read(url) {
    const path = assertInsideRoot(root, join(root, rawNameFor(url)))
    try {
      const text = await readFile(path, 'utf8')
      return { ok: true, text, path }
    } catch (err) {
      const kind = err && err.code === 'ENOENT' ? 'missing' : isTransientIOError(err) ? 'transient' : 'error'
      return { ok: false, kind, path }
    }
  }


  async function list() {
    let names
    try {
      names = await readdir(root)
    } catch (err) {
      if (err && (err.code === 'ENOENT' || err.code === 'ENOTDIR')) return []
      throw err
    }
    const out = []
    for (const name of names) {
      if (!name.endsWith('.md')) continue
      const full = join(root, name)
      const info = await stat(full).catch(() => null)
      if (info) out.push({ name, path: full, bytes: info.size, mtimeMs: info.mtimeMs })
    }
    return out.sort((a, b) => b.mtimeMs - a.mtimeMs)
  }


  async function cleanup(now = Date.now(), days = spec.cleanupDays ?? RAW_CLEANUP_DAYS) {
    if (!days || days <= 0) return { removed: 0, skipped: 0 }
    const cutoff = now - days * 24 * 60 * 60 * 1000
    let removed = 0
    let skipped = 0
    for (const entry of await list()) {
      let info
      try {
        const { lstat } = await import('node:fs/promises')
        info = await lstat(entry.path)
      } catch {
        continue
      }
      if (info.isSymbolicLink()) {
        skipped += 1
        continue
      }
      if (info.mtimeMs >= cutoff) continue
      await rm(entry.path, { force: true }).catch(() => {})
      removed += 1
    }
    return { removed, skipped }
  }

  return { root, save, read, list, cleanup, nameFor: rawNameFor }
}


export function defaultRawDir(configDir) {
  if (configDir) return configDir
  return anchorToModule(import.meta.url, '..', 'data', 'raw')
}
