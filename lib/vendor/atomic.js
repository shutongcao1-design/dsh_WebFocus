

import { readFile, mkdir, rename, rm, writeFile, open } from 'node:fs/promises'
import { dirname, join, basename } from 'node:path'
import { randomBytes } from 'node:crypto'


export const ATOMIC_RETRY_ATTEMPTS = 5
export const ATOMIC_RETRY_DELAY_MS = 20

export const ATOMIC_RETRY_JITTER_MS = 12


const RETRYABLE_CODES = new Set(['EPERM', 'EBUSY', 'EACCES', 'ENOTEMPTY'])


const TRANSIENT_CODES = new Set([
  'EPERM', 'EBUSY', 'EACCES', 'EMFILE', 'ENFILE', 'EAGAIN', 'ENOTEMPTY',
])

function codeOf(err) {
  return err && typeof err === 'object' && typeof err.code === 'string'
    ? err.code
    : ''
}


export function isTransientIOError(err) {
  return TRANSIENT_CODES.has(codeOf(err))
}


export function isNotFoundError(err) {
  return codeOf(err) === 'ENOENT' || codeOf(err) === 'ENOTDIR'
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))


function uniqueSuffix() {
  return `${process.pid.toString(36)}${randomBytes(6).toString('hex')}`
}


export function tempPathFor(dst) {
  return join(dirname(dst), `.${basename(dst)}.${uniqueSuffix()}.part`)
}


const retryDefaults = {
  attempts: ATOMIC_RETRY_ATTEMPTS,
  delayMs: ATOMIC_RETRY_DELAY_MS,
}


export function configureAtomicRetry(options = {}) {
  if (Number.isInteger(options.attempts) && options.attempts >= 1) {
    retryDefaults.attempts = options.attempts
  }
  if (Number.isInteger(options.delayMs) && options.delayMs >= 0) {
    retryDefaults.delayMs = options.delayMs
  }
  return { ...retryDefaults }
}


export function currentAtomicRetry() {
  return { ...retryDefaults }
}


export async function atomicReplace(src, dst, options = {}) {



  const attempts = Math.max(1, options.attempts ?? retryDefaults.attempts)
  const delayMs = Math.max(0, options.delayMs ?? retryDefaults.delayMs)
  let last = null
  for (let i = 0; i < attempts; i += 1) {
    try {
      await rename(src, dst)
      return
    } catch (err) {
      if (!RETRYABLE_CODES.has(codeOf(err))) throw err
      last = err
      if (i + 1 >= attempts) break
















      const jitterMax = options.jitterMs ?? ATOMIC_RETRY_JITTER_MS
      const backoff = delayMs + i * delayMs * 0.5
      const jitter = jitterMax > 0 ? Math.random() * jitterMax : 0
      await sleep(Math.round(backoff + jitter))
    }
  }

  if (last) throw last
  throw new Error(`atomicReplace failed: ${src} -> ${dst}`)
}


export async function atomicWriteText(dst, text, options = {}) {
  if (options.mkdirp !== false) await mkdir(dirname(dst), { recursive: true })
  const tmp = tempPathFor(dst)
  try {
    const handle = await open(tmp, 'w')
    try {
      await handle.writeFile(text, 'utf8')
      await handle.sync()
    } finally {
      await handle.close()
    }
    await atomicReplace(tmp, dst, options)
  } finally {



    await rm(tmp, { force: true }).catch(() => {})
  }
}


export async function atomicWriteJson(dst, value, options = {}) {
  const text = `${JSON.stringify(value, null, options.indent ?? 2)}\n`
  await atomicWriteText(dst, text, options)
}


export async function readTextClassified(path, options = {}) {
  try {













    const buf = await readFile(path, { signal: options.signal })
    const text = new TextDecoder('utf-8', { fatal: true }).decode(buf)
    return { ok: true, text }
  } catch (err) {
    if (isNotFoundError(err)) return { ok: false, kind: 'missing', error: err }




    if (isTransientIOError(err)) return { ok: false, kind: 'transient', error: err }
    if (err instanceof TypeError || err instanceof URIError) {




      return { ok: false, kind: 'encoding', error: err }
    }
    return { ok: false, kind: 'transient', error: err }
  }
}


export async function readJsonClassified(path, options = {}) {
  const read = await readTextClassified(path, options)
  if (!read.ok) return read
  const text = read.text
  if (!text.trim()) {



    return { ok: false, kind: 'invalid', error: new SyntaxError('empty file') }
  }
  try {
    return { ok: true, value: JSON.parse(text), recovered: false }
  } catch (err) {
    const backupPath = await backupCorrupt(path, text).catch(() => undefined)
    return { ok: false, kind: 'invalid', error: err, backupPath }
  }
}


export async function backupCorrupt(path, text) {
  const ns = process.hrtime.bigint().toString()
  let target = `${path}.corrupt-${ns}`
  for (let i = 0; i < 8; i += 1) {
    try {
      await writeFile(target, text, { encoding: 'utf8', flag: 'wx' })
      return target
    } catch (err) {
      if (codeOf(err) !== 'EEXIST') throw err
      target = `${path}.corrupt-${ns}-${i + 1}`
    }
  }
  return undefined
}


export function createMutex() {
  let tail = Promise.resolve()
  return function withLock(fn) {
    const run = tail.then(fn, fn)

    tail = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  }
}
