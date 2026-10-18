# Security policy

## Supported versions

The `0.2.x` line is current. Security fixes land there first.

## Reporting a vulnerability

Please do not open a public issue for a vulnerability. Use GitHub's private
vulnerability reporting for this repository (**Security → Report a
vulnerability**), and include:

- the plugin version and the DSH version;
- the URL or HTML shape that triggers the problem;
- whether the host fetch layer or this plugin's post-processing is involved;
- whether the issue is a crash, a bypass, or data exposure.

Do not include live credentials or personal data in a report.

## Scope notes

- `web_focus` does not fetch anything itself. Every request goes through the
  host's `ctx.web.fetch`, so URL validation, SSRF policy, redirect handling and
  response-size caps remain the host's responsibility.
- Fetched pages are untrusted data. They are sanitized before injection and are
  never treated as instructions.
- Raw pages are written to `rawDir` (by default `data/raw` under the package)
  and kept for `rawCleanupDays` (default 30). They can contain personal data;
  choose the directory and retention accordingly.
