

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const pkgRoot = join(here, '..')

const CJK = /[\u3000-\u303f\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff00-\uffef]/


const CJK_DATA_FILES = new Set([
  'lib/classify.js',
  'lib/partial.js',
  'lib/compress.js',
  'lib/score.js',
  'lib/sanitize-marks.js',
  'lib/vendor/sentences.js',
  'lib/vendor/tokenize.js',
  'locale/zh.json',
])

function walkFiles(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'data' || entry === '.git') continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walkFiles(full, out)
    else out.push(full)
  }
  return out
}

test('no CJK outside the declared match-data files', () => {
  const offenders = []
  for (const file of walkFiles(pkgRoot)) {
    const rel = relative(pkgRoot, file).split('\\').join('/')
    if (CJK_DATA_FILES.has(rel) || rel.startsWith('test/')) continue
    if (!/\.(js|json|ya?ml|md)$/.test(rel)) continue
    const text = readFileSync(file, 'utf8')
    if (!CJK.test(text)) continue
    const line = text.split('\n').findIndex((l) => CJK.test(l)) + 1
    offenders.push(`${rel}:${line}`)
  }
  assert.deepEqual(
    offenders,
    [],
    `English-only surfaces found CJK at: ${offenders.join(', ')}. ` +
      'If this is new functional match data, add the file to CJK_DATA_FILES and say why.',
  )
})

test('the CJK match tables are still populated', async () => {
  const classify = await import('../lib/classify.js')
  const partial = await import('../lib/partial.js')
  const sentences = await import('../lib/vendor/sentences.js')
  const tokenize = await import('../lib/vendor/tokenize.js')
  const compress = await import('../lib/compress.js')
  const score = await import('../lib/score.js')

  assert.ok(classify.POLICY_BLOCK_MARKERS.includes('支付后访问'))
  assert.ok(classify.POLICY_BLOCK_MARKERS.includes('拒绝自动化访问'))
  const blocked = classify.FAILURE_RULES.find((r) => r.keywords.includes('反爬'))
  assert.ok(blocked, 'the 反爬 (anti-bot) keyword rule is missing')
  assert.ok(classify.FAILURE_RULES.some((r) => r.keywords.includes('需要登录')))

  assert.ok(partial.PAYWALL_MARKERS.includes('订阅后继续'))
  assert.ok(partial.PAYWALL_MARKERS.includes('会员专享'))
  assert.ok(partial.STUB_MARKERS.includes('正在加载'))
  assert.ok(partial.STUB_MARKERS.includes('请开启 javascript'))

  assert.ok(sentences.SENT_END.includes('。'))
  assert.ok(sentences.TRAILING.includes('』'))
  assert.ok(tokenize.STOPWORDS.has('的') || [...tokenize.STOPWORDS].some((w) => w === '的'))
  assert.ok(compress.MENU_END_CHARS.includes('。'))

  assert.ok(score.NUMERIC_RE.test('3 月'), 'CJK month suffix must still be recognised')
  assert.ok(score.NUMERIC_RE.test('2023 年'))



  const marks = await import('../lib/sanitize-marks.js')
  assert.equal(marks.hasToolCallSignal('<联网搜索>x</联网搜索>'), true, 'the CJK fake-tag form must still be detected')
  assert.equal(marks.stripToolMarkup('<联网搜索>苹果公司财报</联网搜索>'), '', 'the CJK fake-tag form must still be stripped')
  assert.equal(marks.hasToolCallSignal('<｜DSML｜tool_calls>x</｜DSML｜tool_calls>'), true, 'the full-width-bar DSML form must still be detected')
  assert.equal(marks.hasToolCallSignal('<｜｜tool_calls>'), true)



  const cjkSentences = sentences.splitSentences('第一句。第二句。”')
  assert.equal(cjkSentences.length, 2)
  assert.equal(cjkSentences[0].text, '第一句。')
  assert.equal(cjkSentences[1].text, '第二句。”')


  assert.ok(tokenize.tokenize('公司的 revenue 增长了 12%').includes('revenue'))
})

test('the emitted tool description is English and stays concise', async () => {
  const { registerWebFocusTool, parseFocusArgs } = await import('../lib/web-focus.js')

  let captured
  const ctx = {
    get: (name) => (name === 'tools' ? { register: (def) => { captured = def; return () => {} } } : undefined),
  }
  registerWebFocusTool(ctx, {
    cache: {},
    logger: { warn: () => {} },
    maxTextLength: 80000,
  })

  assert.ok(captured, 'the tool definition was not registered')
  assert.equal(captured.name, 'web_focus')
  assert.equal(typeof captured.description, 'string')
  assert.ok(!CJK.test(captured.description), 'the tool description must not contain CJK')



  assert.ok(
    captured.description.length <= 900,
    `tool description grew to ${captured.description.length} chars; keep it under 900`,
  )

  for (const [name, prop] of Object.entries(captured.parameters.properties)) {
    if (prop.description === undefined) continue
    assert.ok(!CJK.test(prop.description), `parameter "${name}" description must not contain CJK`)
  }



  assert.ok(Array.isArray(captured.parameters.required))
  assert.ok(captured.parameters.required.every((n) => typeof n === 'string'))
  assert.deepEqual([...captured.parameters.required].sort(), ['focus', 'url'])

  for (const err of [
    () => parseFocusArgs({ focus: 'x' }),
    () => parseFocusArgs({ url: 'https://example.test' }),
  ]) {
    assert.throws(err, (e) => {
      assert.ok(!CJK.test(e.message), `thrown message must be English, got: ${e.message}`)
      return true
    })
  }
})

test('package and English locale metadata are English', async () => {
  const pkg = JSON.parse(readFileSync(join(pkgRoot, 'package.json'), 'utf8'))
  assert.ok(!CJK.test(pkg.description), 'package.json description must be English')
  assert.ok(!CJK.test(pkg.meta?.title ?? ''), 'package.json meta.title must be English')
  assert.ok(!CJK.test(pkg.meta?.description ?? ''), 'package.json meta.description must be English')
  assert.equal(pkg.private, undefined, 'a publishable package must not be private')
  assert.equal(pkg.license, 'MIT')

  const en = JSON.parse(readFileSync(join(pkgRoot, 'locale', 'en.json'), 'utf8'))
  assert.equal(typeof en.meta?.title, 'string')
  assert.equal(typeof en.meta?.description, 'string')
  assert.ok(!CJK.test(en.meta.title))
  assert.ok(!CJK.test(en.meta.description))




  const zh = JSON.parse(readFileSync(join(pkgRoot, 'locale', 'zh.json'), 'utf8'))
  assert.equal(typeof zh.meta?.title, 'string', 'locale/zh.json must use the { meta: { … } } shape')
  assert.equal(typeof zh.meta?.description, 'string')
})

test('model-facing helpers emit English', async () => {
  const cap = await import('../lib/cap.js')
  const win = await import('../lib/window.js')
  const coverage = await import('../lib/coverage.js')
  const partial = await import('../lib/partial.js')
  const select = await import('../lib/select.js')

  assert.ok(!CJK.test(cap.truncationMarker(10, 100)))
  assert.ok(!CJK.test(win.windowMarker(0, 10, 100)))
  assert.ok(!CJK.test(win.pastEndMarker(500, 100)))
  assert.ok(!CJK.test(select.omissionMarker(3)))

  const partialNotice = partial.describePartial({
    partial: true,
    partialRatio: 0.3,
    partialReason: 'paywall',
    suggestedAction: partial.PARTIAL_ACTIONS.paywall,
  })
  assert.ok(partialNotice.length > 0)
  assert.ok(!CJK.test(partialNotice))

  const res = new select.SelectionResult('body text', 2, 10, 20, 100, false)
  const coverageText = coverage.describeCoverage(res)
  if (coverageText) assert.ok(!CJK.test(coverageText))
})
