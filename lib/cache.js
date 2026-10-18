


export const PAGE_CACHE_TTL_MS = 1800 * 1000

export const NEGATIVE_CACHE_TTL_MS = 240 * 1000

export const PAGE_CACHE_MAX_ENTRIES = 300

export const PAGE_CACHE_MAX_CHARS = 64 * 1024 * 1024


export function cacheHitNotice({ ageMs, ttlMs, statusCode, negative = false }) {
  const ageSec = Math.max(0, Math.round(ageMs / 1000))
  const ttlSec = Math.max(0, Math.round(ttlMs / 1000))
  if (negative) {
    return (
      `[cache hit: negative — this failure was recorded ${ageSec}s ago and is ` +
      `reused for ${ttlSec}s. It may be transient; pass refresh=true to retry now]`
    )
  }
  return (
    `[cache hit: this copy was fetched ${ageSec}s ago (ttl ${ttlSec}s) and may ` +
    `be stale; pass refresh=true to fetch again, or max_age=0 to require a fresh copy]`
  )
}


export function hostnameOf(url) {
  try {
    return new URL(String(url)).hostname.toLowerCase()
  } catch {
    return ''
  }
}


export function entryWeight(entry) {
  let weight = 0
  weight += typeof entry.text === 'string' ? entry.text.length : 0
  weight += typeof entry.rawText === 'string' ? entry.rawText.length : 0


  weight += typeof entry.rawPath === 'string' ? entry.rawPath.length : 0
  const blocks = entry.blocks
  if (Array.isArray(blocks)) {
    for (const block of blocks) {
      try {
        weight += JSON.stringify(block)?.length ?? 0
      } catch {
        weight += 0
      }
    }
  }
  return weight
}


export class PageCache {

  constructor(options = {}) {
    this.now = options.now ?? (() => Date.now())
    this.ttlMs = options.ttlMs ?? PAGE_CACHE_TTL_MS
    this.negativeTtlMs = options.negativeTtlMs ?? NEGATIVE_CACHE_TTL_MS
    this.maxEntries = options.maxEntries ?? PAGE_CACHE_MAX_ENTRIES
    this.maxChars = options.maxChars ?? PAGE_CACHE_MAX_CHARS

    this.pages = new Map()

    this.failures = new Map()
    this._chars = 0
    this.stats = { pageHits: 0, pageMisses: 0, negativeHits: 0, stores: 0, evictions: 0 }
  }


  get chars() {
    return this._chars
  }

  get size() {
    return this.pages.size
  }


  getPage(url, options = {}) {
    const key = normalizeKey(url)
    const entry = this.pages.get(key)
    if (options.refresh) {





      if (entry) this._dropPage(key, entry)
      return { hit: false, reason: 'disabled' }
    }
    if (!entry) {
      this.stats.pageMisses += 1
      return { hit: false, reason: 'miss' }
    }
    const ageMs = this.now() - entry.storedAt
    if (ageMs > this.ttlMs) {
      this._dropPage(key, entry)
      this.stats.pageMisses += 1
      return { hit: false, reason: 'expired' }
    }
    if (typeof options.maxAgeMs === 'number' && ageMs > options.maxAgeMs) {
      this.stats.pageMisses += 1
      return { hit: false, reason: 'too-old' }
    }

    this.pages.delete(key)
    this.pages.set(key, entry)
    this.stats.pageHits += 1
    return {
      hit: true,
      entry,
      ageMs,
      notice: cacheHitNotice({ ageMs, ttlMs: this.ttlMs }),
    }
  }


  setPage(url, record) {
    const key = normalizeKey(url)
    const entry = {
      url: String(url),
      host: hostnameOf(url),
      text: String(record.text ?? ''),
      rawText: String(record.rawText ?? ''),
      statusCode: Number(record.statusCode ?? 200),
      rawPath: record.rawPath === undefined ? undefined : String(record.rawPath),


      truncated: record.truncated === true,
      blocks: record.blocks,
      headers: record.headers,
      storedAt: this.now(),
    }
    const previous = this.pages.get(key)
    if (previous) this._dropPage(key, previous)
    this.pages.set(key, entry)
    this._chars += entryWeight(entry)
    this.stats.stores += 1
    this._evict()
    return entry
  }


  getFailure(url, options = {}) {
    const key = normalizeKey(url)
    if (options.refresh) {
      this.failures.delete(key)
      return { hit: false, reason: 'disabled' }
    }
    const entry = this.failures.get(key)
    if (!entry) return { hit: false, reason: 'miss' }
    const ageMs = this.now() - entry.storedAt
    if (ageMs > this.negativeTtlMs) {
      this.failures.delete(key)
      return { hit: false, reason: 'expired' }
    }
    this.stats.negativeHits += 1
    return {
      hit: true,
      entry,
      ageMs,
      notice: cacheHitNotice({
        ageMs,
        ttlMs: this.negativeTtlMs,
        statusCode: entry.statusCode,
        negative: true,
      }),
    }
  }


  setFailure(url, failure) {
    const key = normalizeKey(url)
    this.failures.set(key, {
      url: String(url),
      host: hostnameOf(url),
      errorClass: failure?.errorClass ?? 'unknown',
      statusCode: Number(failure?.statusCode ?? 0),
      message: String(failure?.message ?? ''),
      storedAt: this.now(),
    })
  }


  invalidateHost(host) {
    const target = hostnameOf(host) || String(host ?? '').toLowerCase()
    let pages = 0
    let failures = 0
    for (const [key, entry] of [...this.pages]) {
      if (entry.host === target || hostSuffixMatch(entry.host, target)) {
        this._dropPage(key, entry)
        pages += 1
      }
    }
    for (const [key, entry] of [...this.failures]) {
      if (entry.host === target || hostSuffixMatch(entry.host, target)) {
        this.failures.delete(key)
        failures += 1
      }
    }
    return { pages, failures }
  }


  clear() {
    this.pages.clear()
    this.failures.clear()
    this._chars = 0
  }


  describe() {
    return {
      pages: this.pages.size,
      failures: this.failures.size,
      chars: this._chars,
      maxChars: this.maxChars,
      maxEntries: this.maxEntries,
      ...this.stats,
    }
  }

  _dropPage(key, entry) {
    this.pages.delete(key)
    this._chars -= entryWeight(entry)
    if (this._chars < 0) this._chars = 0
  }


  _evict() {
    while (this.pages.size > this.maxEntries || this._chars > this.maxChars) {
      const oldestKey = this.pages.keys().next().value
      if (oldestKey === undefined) break
      this._dropPage(oldestKey, this.pages.get(oldestKey))
      this.stats.evictions += 1
    }
  }
}


export function normalizeKey(url) {
  try {
    const u = new URL(String(url))
    u.hash = ''
    return u.toString()
  } catch {
    return String(url ?? '')
  }
}


function hostSuffixMatch(a, b) {
  if (!a || !b) return false
  if (a === b) return true
  return a.endsWith(`.${b}`)
}
