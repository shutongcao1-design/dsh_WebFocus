# dsh-plugin-web-focus

Focused reading for [DSH](https://github.com/deepseek-ai/deepseek-harness) (DeepSeek Harness):
`web_focus` fetches one URL and injects **the sentences that answer a focus you
write**, instead of the whole page.

The built-in `web_fetch` injects a page's markdown as-is (up to the host's
output cap). This plugin registers a separate tool, `web_focus`, that ranks
sentences by token overlap with `focus`, guarantees coverage of rare query terms,
drops navigation chrome and compresses links, keeps the uncompressed original on
disk, and labels exactly how much was omitted.

**0.2.0 registers no fetch provider.** `web_fetch` keeps its stock behaviour; the
plugin reaches the network only through the public `ctx.web.fetch()` API. There is
no `fetchProvider` patch and disabling the bundle cannot break `web_fetch`.

## What changed in 0.2.1 (2026-10-18)

- Every content-bearing focus term now keeps its best sentence, not only terms
  below a rarity threshold. `population` no longer loses to rarer words.
- The strongest query-bearing body sentences are protected from coverage and
  reconciliation, and long pages force at most 20 headings.
- `founding` / `foundation` now trigger the founding-date pass alongside
  `founded` / `established` / `incorporated`.
- The live-page check below states the exact focus used.

## What changed in 0.2.0 (2026-10-18)

The unreleased 0.1.0 prototype took over the fetch path and, when a digest
retained under 40% of a page's sentences, **injected the whole compressed page
instead**. A controlled benchmark (below) measured what that did:

| Page size | 0.1.0: injected | 0.2.0: injected | 0.1.0: key sentences kept | 0.2.0 |
|---|---|---|---|---|
| 10k chars | 6.9k | 2.7k | 76% | **100%** |
| 25k | 15.5k | 2.5k | 94% | **100%** |
| 50k | 62k (full text) | 3.9k | 100% (by accident) | **100%** |
| 100k | 79.8k (capped full text) | 4.2k | 61% | **100%** |
| 200k | 79.8k (capped full text) | 4.1k | 56% | **100%** |
| no matching content | 30k / 80k | 644 / 1.7k | — | — |

Live-page checks, same code path (measured during development):

- `en.wikipedia.org/wiki/San_Francisco`: 459,687 raw chars → 3,876 body chars
  (0.8% of the raw page) with focus `population mayor mission founding date`.
  Population `873,965`, mayor `Daniel Lurie`, and `June 29, 1776` are all
  present. The old full-text fallback produced 79.8k chars on this page.
- `zh.wikipedia.org/wiki/Xiamen`: 335,038 raw chars → 3,966 body chars (1.2% of
  the raw page). The Siming district and Hubin North Road 61 are present.

Four changes produced that:

1. **Query-term coverage.** Every content-bearing focus term keeps its
   best-scoring sentence, not only terms that pass a rarity threshold; rare
   terms keep every occurrence or their two best sentences. Coverage runs after
   the score fill and may displace ordinary filler, never a protected answer.
   Two role/date fact passes cover shapes that share no query token: a
   `| Mayor | Daniel Lurie |` row (role + person) and a `| Mission | June 29,
   1776 |` row (earliest dated founding/incorporation row). The date pass
   recognises `founded`, `founding`, `foundation`, `established` and
   `incorporated`.
2. **Sparse digest instead of the full-text breaker.** A low retention ratio now
   yields a small digest plus an explicit `⚠️ [digest: sparse match …]` note.
   `full=true` (or the retained raw text) remains the way to read everything.
   Zero-match pages now return headings and first/last sentences — not 80k chars
   of unrelated text.
3. **Focus-sized adaptive budget.** The legacy `clamp(50%, 4k, 24k)` page budget
   was replaced by a cap that scales with the number of content-bearing focus
   tokens (4k–12k), and sentences below 22% of the best selected score are dropped
   unless forced, block-cohesive, or coverage-protected. Whole low-score blocks are
   dropped together, so list items stay whole.
4. **Answer protection and a heading cap.** The top query-bearing body sentences
   are protected from coverage and reconciliation, and at most 20 headings are
   forced on a long page. This keeps a multi-attribute answer in the digest even
   when a table of contents would otherwise consume the budget.

Two measured selection bugs were also fixed: the budget-reconciliation pass used
to sacrifice a rank-2 answer sentence (score 44.7) to keep low-score "sticky"
filler, and the score fill could exceed the budget because coverage additions were
not counted. MediaWiki Parsoid JSON (the infobox template leaked as one 18.6k
line on the San Francisco page) is dropped, and markdown table rows are preserved
instead of being mistaken for menu lines.

## How selection works

```
raw text → strip invisible chars → compress links / drop nav → split sentences
        → forced: first 2 + last 2 + up to 20 headings
        → score fill: focus-sized budget 4k–12k
        → protect the top query-bearing answer sentences
        → query-term/role/date coverage (displaces ordinary filler)
        → block cohesion (groups of ≤4 sentences)
        → adaptive trim (<22% of best score)
        → budget reconciliation (answers and forced sentences survive)
        → coverage header + sparse-match note
```

Scoring is in-page IDF × query-token overlap, plus small priors for position,
numbers and headings. `focus` is a **keyword query**, not a summarization
instruction: write the words you expect the answer to contain.

## Known boundary: paraphrase

Token-overlap selection cannot find a fact that shares **no vocabulary** with the
focus. The benchmark's paraphrase case (page says "closed a $42 million financing
round", focus says "how much outside money did it take") keeps 2 of 3 key
sentences; the missing one has a score of 0.8 (numeric prior only). This is a
limitation of lexical retrieval, not a tuning bug. Mitigations: write the focus
with likely page vocabulary, use `full=true` for paraphrase-heavy pages, or read
the retained raw text. The other adversarial cases — multi-sentence answers,
tables, Chinese pages, a rare term appearing in seven sentences, a key past the
80k cap — all keep 100% of key sentences.

## Requirements

- DSH with the built-in `web` service (`@deepseek-ai/dsh-web-app`).
- Node.js ≥ 18.
- `@deepseek-ai/schemastery` (peer dependency; DSH provides it).

### Host fetch cap (important on long pages)

The host's http fetcher truncates decoded bodies at **100,000 chars** by default.
On a large Wikipedia page that cut lands inside the infobox, before the prose:
the plugin receives navigation only, compresses it under the 8k selection
trigger, and cannot select what never arrived. The plugin now warns explicitly
when `truncated: true`, but the real fix is the host row:

```yaml
- id: web-fetch-http
  config:
    maxBodyChars: 2000000
```

That is the value used by the profile this was tested with (2M = the plugin's own
HTML input cap, so the host is no longer the limiting factor). It requires a host
restart. `maxTextLength` (80k) remains the separate context-budget knob.

## Install

The package is not published to npm. Clone this repository and install the
bundle from the checkout:

```sh
git clone https://github.com/shutongcao1-design/dsh_WebFocus.git
```

```
plugin_manager  action: install_bundle   target: <absolute path to the checkout>
```

The bundle patch only inserts the plugin row; it does **not** touch the `web`
row. If an older provider-based copy is installed, remove that bundle first and
update any profile patch that referenced its provider id.

## Configuration

| Option | Default | Meaning |
|---|---|---|
| `rawDir` | `<package>/data/raw` | Where uncompressed raw text is written (anchored to the module location, not `cwd`) |
| `rawMaxChars` | `4194304` | Per-file limit; beyond it the file is truncated and the header says so |
| `rawCleanupDays` | `30` | Age at which raw text is deleted at startup (`0` disables); symlinks are skipped |
| `pageCacheTtlSeconds` | `1800` | Page-cache TTL |
| `negativeCacheTtlSeconds` | `240` | Failure-cache TTL, deliberately shorter |
| `maxTextLength` | `80000` | Hard limit on injected page text; headers and markers count against it |
| `sourcesMax` | `30` | Maximum source-footer entries kept |
| `enableFocusTool` | `true` | Register `web_focus` |
| `exposeInternals` | `false` | Expose `cache`/`rawStore`/`web` on `ctx.__webFocus` for probes |

## Behaviour that will otherwise surprise you

- **A failure cache hit throws.** A URL that failed within 4 minutes makes
  `web_focus` throw instead of re-fetching. `refresh: true` clears both caches.
- **A page-cache hit is re-selected**, not replayed: the same URL with a different
  `focus` produces a different digest.
- **A non-2xx response is a result, not an error.** It is returned with a notice
  and put in the failure cache.
- **`web_focus` renders only `notice` + `content`.** The structured fields
  (`kept`, `total`, `fallback`, `fromCache`, `rawPath`) are for tooling.
- **Raw text lives inside the package directory by default.** Reinstalling the
  bundle can discard it; set `rawDir` somewhere durable if you rely on it.
- **Raw pages may contain personal data.** They are kept for 30 days by default
  (`rawCleanupDays`). Choose a private `rawDir`, lower the retention, or delete
  the directory if you process sensitive pages. The page cache is in memory and
  is lost on restart.

## Security posture

- **It does not fetch anything itself.** Every request goes through
  `ctx.web.fetch`, so URL validation, SSRF blocking, redirect policy, size caps and
  charset rules remain the host's.
- **A security block is never disguised as success.** Host errors are propagated
  unchanged; only this plugin's own post-processing failures fall back to the
  page unprocessed (capped).
- **Fetched pages are untrusted data.** They are sanitized before injection and
  are never treated as instructions. See [SECURITY.md](SECURITY.md) for the
  reporting process.

## Development

```sh
node --test          # 30 tests; integration tests skip when the host peer is absent
```

The package is self-contained: shared helpers are vendored under `lib/vendor/`,
and `test/package.test.js` enforces that no import leaves the package root.

The benchmark harness used for these numbers is a separate development-only
project and is not shipped in this package. It generates filler pages, injects
known key sentences over five length bands (10k–200k) and runs the adversarial
cases; it compares this package against a frozen earlier snapshot of the same
selection code and writes JSON evidence.

## Contributing

Issues and pull requests are welcome. Run `npm test` before sending a change.
The package deliberately has no runtime dependencies; keep host integration on
the public `ctx.web.fetch()` API and vendor any shared helper under `lib/vendor`.

## License

MIT — see [LICENSE](LICENSE).

This is an independent community plugin, not affiliated with or endorsed by
DeepSeek.
