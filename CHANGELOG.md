# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [1.3.2] - 2026-10-23

### Fixed
- Failed exports exited with code `0` when there was no terminal (e.g. in CI or cron) and `SHOW_ERRORS` was not set, because the "Would you like to see error details" prompt threw. They now exit with code `1`
- A manifest entry without a `url` crashed the client outside of `run()` (as an unhandled rejection), so `run()` did not reject. Manifest entries in `output`, `deleted` and `error` must now have a `url`, and invalid ones are reported like other invalid manifests (`status_error`, then `client_error`)
- `run()` now also rejects if queuing the downloads for a manifest page fails, instead of the error becoming an unhandled rejection
- The CLI crashed while logging `status_page_complete` for manifests without an `error` array
- `node . --version` printed a hard-coded `2.0.0` instead of the version from `package.json`
- The reporters printed nonsense durations ("Download completed in 2964 weeks…" or `NaN`) when no file download had started, e.g. for an empty manifest. They now print "Download completed. No files were downloaded"

## [1.3.1] - 2026-10-23

### Security
- Require a Node.js version that includes the [October 2026 security releases](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases): `^22.23.4 || ^24.22.1 || >=26.12.1`. Node 18 and 20 are end-of-life and no longer supported. With `engine-strict=true` in `.npmrc`, `npm i` / `npm ci` now fails with `EBADENGINE` on older Node versions
- Stop requesting Brotli (`br`) compressed responses, both for file downloads and for all other requests (kick-off, status, auth, etc.), and refuse to decode Brotli encoded file downloads. Defense in depth against CVE-2026-111497 (Brotli decoder out-of-bounds write) for library users still on unpatched Node versions
- PDF attachments are now parsed with `isEvalSupported: false`, which mitigates CVE-2024-4367 / GHSA-wgrm-67xf-hhpq (arbitrary JavaScript execution from a malicious PDF) in the `pdfjs-dist` 2.x version we use
- `npm audit fix` (non-breaking): runtime `moment` `2.30.1` → `2.31.0` and `http-cache-semantics` `4.2.0` → `4.3.0` (via `got`), plus several dev dependencies

### Changed
- `.nvmrc` now points to Node `24.22.1` (was `18`)
- Upgraded `@types/node` `18` → `24`
- `content-encoding` response headers are now matched case-insensitively
- Upgraded the test toolchain: `mocha` `9` → `11`, `ts-mocha` `10` → `11`, `nyc` `15` → `18`, `@types/mocha` `9` → `10`, and added `ts-node` `10` as an explicit dev dependency (it was previously only pulled in by `ts-mocha` 10, as `ts-node` 7)
- TypeScript `target` raised from `ES2021` to `ES2023`. `useDefineForClassFields` is explicitly set to `false` to keep the existing class field semantics, so the emitted code in `built/` is unchanged
- Added a GitHub Actions workflow that builds, checks that `built/` is up to date, and runs the tests on Node `22.23.4` and `24.22.1`

### Fixed
- The CLI could exit silently with code 0, without doing anything, on Node 20+ (#26). The `.well-known/smart-configuration` and `CapabilityStatement` requests used got 11's `cache` option, and on Node 20+ such requests can never settle (e.g. for small or 404 responses that the server does not mark `no-store`). These requests are no longer cached. The `noCache` parameter of `getWellKnownSmartConfig()` and `getCapabilityStatement()` is now ignored
- On errors the CLI called `process.exit()` without waiting for the log file to be written, so the `client_error` entry, and sometimes earlier entries, could be missing from the log. It now flushes the log first, and no longer opens a second logger on the same file
- Removed `this.timeout()` calls from inside arrow-function tests in `test/logging.test.ts`. They targeted the parent suite, and since mocha 11 that re-arms the timeouts of tests that have already finished, failing them with "done() called multiple times"
- Spawned CLI processes in tests now run `ts-node` in transpile-only mode (type checking is covered by `npm run build`), keeping the test run fast without ts-node 7's compile cache
- `test/auth.test.ts` no longer needs a local, gitignored `config/test.js`. It generates its own EC signing key, so the tests also pass in a fresh clone (and in CI)

## [1.3.0] - 2026-08-26

### Added
- Test coverage for the JWT authorization flow (EC and RSA key signing, access token caching and renewal) - previously untested
- Test coverage for the S3 destination path - previously untested
- New `awsEndpoint` config option, for pointing the S3 client at custom S3-compatible endpoints (e.g. MinIO) instead of real AWS S3

### Changed
- Upgraded TypeScript `4.4.2` → `5.9.3` and typedoc `0.22.3` → `0.28.20`
- Migrated from `aws-sdk` (v2) to `@aws-sdk/client-s3` + `@aws-sdk/lib-storage` (v3)
- Upgraded `jsonwebtoken` `8` → `9` (and `@types/jsonwebtoken`)
- Upgraded `winston`, `moment`, `node-jose`, `express`, `cors`, `commander`, `ts-mocha`, `@hapi/code`, `@types/pdfjs-dist` and related `@types/*` packages within their existing major versions
- Relaxed `engines.node` from `>=15 <19` to `>=15`

### Fixed
- S3 destination: fixed a bug where the whole `s3://bucket-name/optional-subfolder` path was sent as the S3 bucket name instead of being split into a bucket name and a key prefix
- S3 destination: fixed a fire-and-forget upload race where a failed S3 upload could be silently swallowed (only logged to the console) instead of failing the export
- Test harness: spawned CLI test processes no longer inherit the test runner's own `TS_NODE_PROJECT`, which could cause them to compile against the wrong `tsconfig.json`
- Removed an implicit dependency on the global `fhir4` type namespace in `src/lib/utils.ts` (now explicitly imported)
- Fixed a wrong `readme` path and an invalid `gitRemote` value in `typedoc.js` that broke doc generation and source links
- Removed the dead `zlib` npm dependency (Node's built-in `zlib` module always wins resolution over it, so the dependency was never actually used)
- Fixed the `logStatusProgress` test to match its default-off behavior

### Docs
- Documented the new `awsEndpoint` option
- Documented that Epic's bulk-data endpoint requires `lenient: false` (it does a strict check on the `Prefer` header and rejects the standard `respond-async, handling=lenient` value)
