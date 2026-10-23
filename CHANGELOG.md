# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [1.3.1] - 2026-10-23

### Security
- Require a Node.js version that includes the [October 2026 security releases](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases): `^22.23.4 || ^24.22.1 || >=26.12.1`. Node 18 and 20 are end-of-life and no longer supported. With `engine-strict=true` in `.npmrc`, `npm i` / `npm ci` now fails with `EBADENGINE` on older Node versions
- Stop requesting Brotli (`br`) compressed responses, both for file downloads and for all other requests (kick-off, status, auth, etc.), and refuse to decode Brotli encoded file downloads. Defense in depth against CVE-2026-111497 (Brotli decoder out-of-bounds write) for library users still on unpatched Node versions

### Changed
- `.nvmrc` now points to Node `24.22.1` (was `18`)
- Upgraded `@types/node` `18` → `24`
- `content-encoding` response headers are now matched case-insensitively

### Fixed
- The CLI could exit silently with code 0, without doing anything, on Node 20+ (#26). The `.well-known/smart-configuration` and `CapabilityStatement` requests used got 11's `cache` option, and on Node 20+ such requests can never settle (e.g. for small or 404 responses that the server does not mark `no-store`). These requests are no longer cached. The `noCache` parameter of `getWellKnownSmartConfig()` and `getCapabilityStatement()` is now ignored
- On errors the CLI called `process.exit()` without waiting for the log file to be written, so the `client_error` entry, and sometimes earlier entries, could be missing from the log. It now flushes the log first, and no longer opens a second logger on the same file

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
