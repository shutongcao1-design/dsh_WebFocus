

import { PageCache } from './lib/cache.js'
import { MAX_TEXT_LENGTH } from './lib/cap.js'
import { createRawStore, defaultRawDir } from './lib/rawstore.js'
import { registerWebFocusTool } from './lib/web-focus.js'
import { getServiceWith } from './lib/vendor/services.js'
import z from '@deepseek-ai/schemastery'

export const name = 'web-focus'


export const inject = []


export const Config = z.object({
  rawDir: z
    .string()
    .description('Directory for uncompressed raw text (default: data/raw under the plugin directory; the path anchors to the module location, not to cwd).'),
  rawMaxChars: z
    .number()
    .step(1)
    .min(1024)
    .default(4194304)
    .description('Per-file limit for one uncompressed raw text (default 4MB); anything beyond it is truncated and noted in the file header.'),
  rawCleanupDays: z
    .number()
    .step(1)
    .min(0)
    .default(30)
    .description('Age in days after which raw text is cleaned up at startup (default 30; 0 = disabled). Symlinks are neither followed nor deleted.'),
  pageCacheTtlSeconds: z
    .number()
    .step(1)
    .min(0)
    .default(1800)
    .description('Page-cache TTL in seconds (default 1800).'),
  negativeCacheTtlSeconds: z
    .number()
    .step(1)
    .min(0)
    .default(240)
    .description('Failure-cache TTL in seconds (default 240, deliberately far shorter than the page cache).'),
  maxTextLength: z
    .number()
    .step(1)
    .min(1000)
    .default(MAX_TEXT_LENGTH)
    .description('Hard limit on the page text injected into the model context (default 80000; the truncation marker counts against this budget).'),
  sourcesMax: z
    .number()
    .step(1)
    .min(0)
    .default(30)
    .description('Maximum number of source-footer entries kept (default 30; a wiki-style page carries 700+ links, so leaving it unlimited means no compression at all).'),
  enableFocusTool: z
    .boolean()
    .default(true)
    .description('Whether to register the web_focus tool. Turning it off leaves only raw-text retention and the cache.'),
  exposeInternals: z
    .boolean()
    .default(false)
    .description('Expose cache/rawStore/web on ctx.__webFocus for end-to-end probes (off by default).'),
})


export function apply(ctx, config = {}) {
  const logger = {
    warn: (msg) => {
      try {
        ctx.logger?.warn?.(msg)
      } catch {

      }
    },
  }

  const web = getServiceWith(ctx, 'web', 'fetch', { logger })

  const cache = new PageCache({
    ttlMs: (config.pageCacheTtlSeconds ?? 1800) * 1000,
    negativeTtlMs: (config.negativeCacheTtlSeconds ?? 240) * 1000,
  })

  const rawStore = createRawStore({
    dir: config.rawDir ?? defaultRawDir(),
    maxChars: config.rawMaxChars,
    cleanupDays: config.rawCleanupDays,
  })


  rawStore
    .cleanup()
    .then((r) => {
      if (r.removed) logger.warn(`web-focus: removed ${r.removed} over-age raw file(s) (skipped ${r.skipped} symlink(s))`)
    })
    .catch((err) => logger.warn(`web-focus: raw-text cleanup failed: ${String(err)}`))

  if (!web) {
    logger.warn(
      'web-focus: web service unavailable ⇒ web_focus is not registered ' +
        '(raw-text retention and the page cache are still active)',
    )
  } else if (config.enableFocusTool !== false) {
    registerWebFocusTool(ctx, {
      web,
      cache,
      rawStore,
      logger,
      maxTextLength: config.maxTextLength ?? MAX_TEXT_LENGTH,
      sourcesMax: config.sourcesMax,
    })
  }


  if (config.exposeInternals === true) {
    try {
      ctx.__webFocus = { web, cache, rawStore }
    } catch {

    }
  }
}

export default { name, inject, Config, apply }
