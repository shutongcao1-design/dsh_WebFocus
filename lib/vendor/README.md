# lib/vendor

These modules are **first-party helpers**, not third-party libraries. They live
here so the plugin has no runtime dependencies and no import escapes the package
root (the boundary is enforced by `test/package.test.js`).

They are MIT-licensed with the rest of the package; see the repository's
[LICENSE](../../LICENSE).
