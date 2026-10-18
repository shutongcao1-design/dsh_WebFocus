# Changelog

## 0.2.2 (2026-10-18)

- Focused digests now admit only headings that contain a focus term, at most 8;
  unmatched headings are skipped by both the forced set and the score fill. On
  the San Francisco check this removed the 19 heading lines; the digest is now
  17 non-omitted lines with 0 headings (2 navigation links and 4 citation/footer
  lines remain). The zero-match fallback still returns the outline.
- `SANITIZE_CALL_SITES` now names `assemble.js`'s `compressStage`; the stale
  `provider.js` entry is gone.
- Added a regression test for stale sanitize call-site references.

## 0.2.1 (2026-10-18)

- Query-term coverage now applies to **every** content-bearing focus term, not
  only terms below the rarity threshold. A common attribute such as
  `population` can no longer be crowded out by rarer ones.
- The strongest query-bearing answer sentences are protected from the coverage
  and reconciliation passes.
- The minimum focus budget is 4k (was 3k), so a five-attribute focus has room
  for every aspect.
- Long pages force at most 20 headings, so a table of contents cannot consume
  the focus budget (superseded by 0.2.2's focus-matched cap).
- The founding-date pass recognises `founding` and `foundation`, in addition to
  `founded`, `established` and `incorporated`.
- Added a synthetic regression test for a multi-attribute focus with a dated
  founding row.

## 0.2.0 (2026-10-18)

First public release. It is a focused-reading tool for DSH, not a replacement
for `web_fetch`.

- Registers `web_focus`; registers **no fetch provider**, so `web_fetch` keeps
  its stock behaviour and disabling the bundle cannot break it.
- Rare-term coverage, role/date fact passes, a focus-sized adaptive budget, and
  block cohesion.
- Sparse digests plus an explicit warning replace the old 40% full-text
  breaker; zero-match pages no longer return the whole page.
- Compresses links, drops navigation chrome and MediaWiki Parsoid JSON, keeps
  markdown table rows, and retains the uncompressed raw text.
- Adds page and failure caches, section windows, truncation notes, and
  output hardening.

## 0.1.0

Unreleased prototype. It took over the fetch path and could inject a whole
compressed page when a digest retained under 40% of its sentences. The 0.2.0
benchmark in the README measures that behaviour against the current release.
