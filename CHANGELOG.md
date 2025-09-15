# Changelog

All notable changes to this project are documented here.

## 2025-09-15 — Workflow hardening for Azure deploy

Updated `.github/workflows/main_jestbddgenerator.yml` to deploy a prebuilt, zip-packaged bundle and improve diagnosability.

- Packaging: Build in CI, prune to production deps, assemble runtime bundle.
  - `npm prune --production` to keep only runtime dependencies.
  - Copy `dist/`, `public/`, `package.json`, `package-lock.json`, and `node_modules/` into `release/`.
  - Create `release.zip` from `release/` for deterministic deployment.
- Artifact: Upload `release.zip` as the build artifact (instead of a folder).
- Deploy: Download `release.zip`, list contents for visibility, and deploy with `azure/webapps-deploy` using `package: release.zip`.
- Rationale: Avoid server-side builds (which caused “tsc: not found”), ensure only runtime files are deployed, and make the deploy logs self-verifying via file listings.

Notes:
- App start remains `node dist/server.js`.
- Previous code updates improved static hosting (serve `public/` with cache controls and long-cache under `/assets`).

