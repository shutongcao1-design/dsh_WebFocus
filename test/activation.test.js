

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let peerAvailable = true
try {
  await import('@deepseek-ai/schemastery')
} catch {
  peerAvailable = false
}

const PAGE_HTML =
  '<html><head><title>Quarterly report</title><style>p{color:red}</style></head><body>' +
  '<h1>Quarterly report</h1>' +
  '<p>Revenue rose 12% to 120 million dollars in the third quarter.</p>' +
  '<p>Operating margin improved to 18% on lower supply chain costs.</p>' +
  '<p>' + 'Unrelated office furniture and parking policy filler. '.repeat(220) + '</p>' +
  '</body></html>'


function makeWebService() {
  const calls = []
  return {
    calls,
    async fetch(request) {
      calls.push(request.url)
      return {
        url: request.url,
        statusCode: 200,
        body: { kind: 'html', content: PAGE_HTML },
        truncated: false,
      }
    },
  }
}


async function activate(t, config = {}) {
  const web = makeWebService()
  const tools = { definition: undefined, register(definition) { this.definition = definition; return () => {} } }
  const warnings = []
  const ctx = {
    get(name) {
      if (name === 'web') return web
      if (name === 'tools') return tools
      return undefined
    },
    logger: { warn: (m) => warnings.push(m) },
  }

  const dir = await mkdtemp(join(tmpdir(), 'web-focus-activation-'))
  t.after(() => rm(dir, { recursive: true, force: true }))

  const plugin = (await import('../index.js')).default
  plugin.apply(ctx, { rawDir: dir, ...config })
  return { plugin, web, tools, warnings, dir }
}

const skip = !peerAvailable && 'peer dependency @deepseek-ai/schemastery is not installed'

test('activation registers the tool and does not register a fetch provider', { skip }, async (t) => {
  const { web, tools, warnings } = await activate(t)

  assert.equal(web.registered, undefined, '0.2.0 must not register a fetch provider')
  assert.equal(typeof web.fetch, 'function')
  assert.ok(tools.definition, 'the web_focus tool must be registered')
  assert.equal(tools.definition.name, 'web_focus')
  assert.deepEqual(warnings, [], 'activation on a healthy host must not warn')
})

test('activation degrades instead of crashing when the web service is missing', { skip }, async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'web-focus-degraded-'))
  t.after(() => rm(dir, { recursive: true, force: true }))

  const tools = { definition: undefined, register(d) { this.definition = d; return () => {} } }
  const warnings = []
  const ctx = {
    get: (name) => (name === 'tools' ? tools : undefined),
    logger: { warn: (m) => warnings.push(m) },
  }

  const plugin = (await import('../index.js')).default
  plugin.apply(ctx, { rawDir: dir })



  assert.equal(tools.definition, undefined, 'the tool must not be registered without web.fetch')
  assert.ok(warnings.some((w) => /web service unavailable/.test(w)), `expected a degradation warning, got: ${warnings.join(' | ')}`)
})

test('the tool fetches through web.fetch and converts HTML without retaining markup', { skip }, async (t) => {
  const { web, tools } = await activate(t, { exposeInternals: true })

  const result = await tools.definition.execute({ url: 'https://example.test/report', focus: 'Revenue rose 12%' }, {})
  assert.deepEqual(web.calls, ['https://example.test/report'], 'the request must go through the public web.fetch')
  assert.equal(result.statusCode, 200)

  const content = result.content
  assert.match(content, /Revenue rose 12%/, 'the article body must survive')
  assert.doesNotMatch(content, /<p>|<html>/, 'no HTML tags may remain')
  assert.doesNotMatch(content, /color:red/, 'the <style> block must be dropped')



  const pointer = content.match(/\[Full page text cached at path (.+?)\]/)
  assert.ok(pointer, `expected a raw-text pointer in: ${content.slice(0, 200)}`)
  assert.ok(existsSync(pointer[1]), `the retained raw text must exist: ${pointer[1]}`)
  assert.match(readFileSync(pointer[1], 'utf8'), /Revenue rose 12%/)
})

test('the tool selects on focus, validates arguments and reuses its cache', { skip }, async (t) => {
  const { web, tools } = await activate(t)

  const url = 'https://example.test/tool'
  const fresh = await tools.definition.execute({ url, focus: 'operating margin supply chain' }, {})

  assert.equal(fresh.url, url)
  assert.equal(fresh.statusCode, 200)
  assert.equal(fresh.fromCache, false)
  assert.equal(fresh.notice, undefined, 'a 2xx carries no notice')
  assert.ok(fresh.content.length > 0)

  const cached = await tools.definition.execute({ url, focus: 'operating margin supply chain' }, {})
  assert.equal(cached.fromCache, true, 'the second call must come from the page cache')
  assert.match(cached.notice, /cache hit/)
  assert.equal(web.calls.length, 1, 'a cache hit must not re-fetch')


  await assert.rejects(() => tools.definition.execute({ url }, {}), /focus is required/)
  await assert.rejects(() => tools.definition.execute({ focus: 'x' }, {}), /url is required/)


  const full = await tools.definition.execute({ url, focus: 'x', full: true }, {})
  assert.ok(full.content.length > 0)
  await assert.rejects(() => tools.definition.execute({ url, full: true }, {}), /focus is required/)
})

test('a sparse match stays a small digest instead of falling back to the whole page', { skip }, async (t) => {
  const { tools } = await activate(t)
  const url = 'https://example.test/sparse'
  const result = await tools.definition.execute(
    { url, focus: 'operating margin supply chain' },
    {},
  )
  const body = result.content
  assert.match(body, /digest: kept \d+\/\d+ sentences/)
  assert.doesNotMatch(body, /\[digest SKIPPED/, 'the full-text breaker is gone by design')
  assert.ok(body.length < 2000, `a sparse focus must not inject the whole page (got ${body.length} chars)`)
})

test('a truncated fetch says so, and the cache hit repeats the note', { skip }, async (t) => {
  const { web, tools } = await activate(t)
  const originalFetch = web.fetch
  web.fetch = async (request, signal) => ({ ...(await originalFetch(request, signal)), truncated: true })

  const url = 'https://example.test/truncated'
  const first = await tools.definition.execute({ url, focus: 'Revenue rose 12%' }, {})
  assert.equal(first.truncated, true)
  assert.match(first.content, /fetch layer truncated this page/, 'the model must be told the tail never arrived')

  const cached = await tools.definition.execute({ url, focus: 'Revenue rose 12%' }, {})
  assert.equal(cached.fromCache, true)
  assert.match(cached.content, /fetch layer truncated this page/, 'a cache hit must repeat the same warning')
})

test('the config schema applies its documented defaults', { skip }, async () => {
  const { Config } = await import('../index.js')
  const resolved = new Config({})
  assert.equal(resolved.pageCacheTtlSeconds, 1800)
  assert.equal(resolved.negativeCacheTtlSeconds, 240)
  assert.equal(resolved.sourcesMax, 30)
  assert.equal(resolved.rawCleanupDays, 30)
  assert.equal(resolved.enableFocusTool, true)
  assert.equal(resolved.exposeInternals, false)
  assert.equal(resolved.maxTextLength, 80000)
})
