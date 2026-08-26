# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [1.3.0] - 2026-08-26

### Added
- Test coverage for the JWT authorization flow (EC and RSA key signing, access token caching and renewal) - previously untested
- Test coverage for the S3 destination path - previously untested
- New `awsEndpoint` config option, for pointing the S3 client at custom S3-compatible endpoints (e.g. MinIO) instead of real AWS S3
- `config/epic-sandbox.js` - example config for connecting to Epic's sandbox

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
