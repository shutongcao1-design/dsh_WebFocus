

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve, relative, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const pkgRoot = resolve(here, '..')

const IMPORT_RE =
  /(?:^|\n)\s*(?:import|export)[^'"\n]*?from\s*['"]([^'"]+)['"]|(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g


const ALLOWED_BARE = new Set(['@deepseek-ai/schemastery'])

test('the module graph stays inside the package', () => {
  const seen = new Set()
  const escapes = []
  const missing = []
  const bare = new Set()

  const walk = (file) => {
    if (seen.has(file)) return
    seen.add(file)
    const src = readFileSync(file, 'utf8')
    for (const match of src.matchAll(IMPORT_RE)) {
      const spec = match[1] ?? match[2]
      if (!spec || spec.startsWith('node:') || spec.startsWith('data:')) continue
      if (!spec.startsWith('.') && !isAbsolute(spec)) { bare.add(spec); continue }
      const target = resolve(dirname(file), spec)
      const rel = relative(pkgRoot, target)
      if (rel.startsWith('..')) escapes.push(`${relative(pkgRoot, file)} → ${spec}`)
      else if (!existsSync(target)) missing.push(`${relative(pkgRoot, file)} → ${spec}`)
      else walk(target)
    }
  }

  walk(resolve(pkgRoot, 'index.js'))

  assert.deepEqual(escapes, [], 'imports must not leave the package root')
  assert.deepEqual(missing, [], 'every relative import must resolve')
  assert.deepEqual(
    [...bare].filter((s) => !ALLOWED_BARE.has(s)),
    [],
    'unexpected external dependency; vendor it or declare it as a peer dependency',
  )
  assert.ok(seen.size > 20, 'the graph walk found suspiciously few modules')
})

test('every file the manifest promises to ship exists', () => {
  const pkg = JSON.parse(readFileSync(join(pkgRoot, 'package.json'), 'utf8'))
  for (const entry of pkg.files) {
    assert.ok(existsSync(join(pkgRoot, entry)), `files[] lists a missing path: ${entry}`)
  }
  assert.ok(existsSync(join(pkgRoot, pkg.dsh.bundle.patch)), 'the declared bundle patch must exist')
  assert.ok(existsSync(join(pkgRoot, pkg.icon)), 'the declared icon must exist')
})

test('the bundle patch inserts this package and leaves the web row alone', () => {
  const patch = readFileSync(join(pkgRoot, 'cordis.patch.yml'), 'utf8')
  const pkg = JSON.parse(readFileSync(join(pkgRoot, 'package.json'), 'utf8'))

  assert.match(patch, new RegExp(`name:\\s*'${pkg.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`))



  assert.doesNotMatch(patch, /fetchProvider\s*:/, 'the patch must not redirect web.fetchProvider')
  assert.doesNotMatch(patch, /-\s*id:\s*web\s*$/m, 'the patch must not replace the web row config')
})
