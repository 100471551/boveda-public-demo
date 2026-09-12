# Bóveda 2.0.1 hosted demo

The public home and How it works are open. The library, audit views, supporting evidence and canonical downloads require the existing demo account. Login includes a close button; the authenticated menu includes logout. There is no registration or collection of user profile information.

The cloud release serves a preserved snapshot of 23 available audits and two unavailable metadata entries (R10 and R20). It does not run the analytical pipeline, access local project directories, remove audits or regenerate outputs. The canonical reports retain their original bytes. The UX source comes from `apps/primitive_probe/static/product_v2_0_1` in the Boveda_2.0 workspace.

## Deployment

- GitHub repository: `100471551/boveda-public-demo`; production branch: `main`.
- Vercel project: `boveda-public-demo`, team `boveda`; public domain: `https://boveda.dev`.
- Build: `npm ci --ignore-scripts` followed by `npm run build:demo` (Node 24).
- `dist/` contains only public UI assets. The Node function serves HTML and the protected API.
- Audit payloads, canonical reports and supporting references are encrypted individually with AES-256-GCM. The logical filename is authenticated as AAD. The build validates every ciphertext digest in `data/manifest.json`.
- The Vercel Upstash integration supplies `KV_REST_API_URL` and `KV_REST_API_TOKEN` in Production and Preview. The current database is on the Free plan.
- Set `BOVEDA_PUBLIC_ORIGIN=https://boveda.dev`, `BOVEDA_DATA_KEY` (32 bytes, hex), and `BOVEDA_DEMO_CREDENTIAL` (JSON with username, `pbkdf2_sha256`, iterations, hex salt and hex password_hash). These are Vercel secrets; never put them in Git. Preview login accepts the generated deployment hostname from `VERCEL_URL` and the stable Git branch hostname from `VERCEL_BRANCH_URL`.

Sessions are opaque, server-held Redis entries with an absolute eight-hour lifetime, or fourteen days with Remember me. Cookies are Secure, HttpOnly, SameSite=Lax and host-only. Login rotates the session; logout revokes it in Redis. Changing the credential or encryption key invalidates existing sessions. The global rolling limit allows five login attempts per minute across function instances. Redis/configuration failures deny access; free-plan exhaustion therefore makes authentication temporarily unavailable rather than exposing data.

## Validation

Run `npm run demo:validate`, `npm run test:deploy` and `npm run build:demo`. Tests cover credential compatibility with Python, session rotation/revocation/expiry, shared limiting, Redis failures, origin/host validation, encrypted data integrity and public build contents. Inspect the preview deployment before promoting the production branch.

## Version 1 preservation and rollback

The previous source, engine, public assets and documentation remain in Git. The former hosting configuration and handoff are copied to `docs/releases/v1-hosting/`. The last v1 production commit is `65826eef9b4626d748dba2ce33382739a1899f2b`. Revert the v2 release commit(s) or restore the earlier Vercel deployment to roll back; do not delete v1 files to deploy v2. `.vercelignore` and the new build prevent v1 audit files from becoming public assets in the v2 deployment.


## Motion and local snapshot revision

The local application creates audits; this cloud snapshot displays a disabled New audit button and never starts processing. This release includes the completed R23 public-health audit under its original runtime UUID, including its canonical report and retained evidence. R10 and R20 remain metadata only.

UI motion uses viewport-triggered entrances, staggered inner surfaces, progressive confidence ticks and brief dashboard transitions. Reduced-motion preferences disable these effects; numerical evidence and final colors are not modified. Local remembered sessions now survive server restarts in a private file containing only token hashes and expiration times; cloud sessions continue using Redis.

## Visuals release

A fifth, secondary Visuals destination contains the reviewed local snapshot: 49 figures/collections/comparisons in 18 of the 23 available audits, backed by 47 unique original images. No material is a normal state. The graphical surface uses solid white, rounded image corners, adaptive sizing and an accessible enlargement dialog.

Images are encrypted alongside the audit data, served only after authentication and only when referenced by the requested audit. Decrypted bytes must match their SHA-256 identity, PNG/JPEG format and 4 MB limit. The public static directory contains no project images. Computed visuals use already established values; no API inference is performed in production.

Previous production commit: `bd0a93c9da0441d6b09d6bdf32338ff8e94f64b1`. Preserved by the `codex/pre-visuals-2026-09-09` release tag. Revert this release commit or redeploy that preserved commit to roll back. Existing v1 files remain in Git.

### Source-image gallery release

Visuals now includes Other source images below the contextual cards: 592 additional entries, 574 distinct protected image assets globally, with 24 entries per page and lazy loading. Repository filenames and locations are shown without generated audit interpretations. The four R1 `graphs` PNGs are included. Existing 49 contextual items and 23 canonical reports are preserved.

`visual_evidence.additional_images` uses the same protected image URL contract as contextual `items`; internal asset metadata is never exposed. The hosted demo still has no audit-creation endpoint. Publication adds no LLM calls. Previous release: `6edac57f0713858c1ff4c53fe400f0697163f499` / tag `codex/pre-visuals-coverage-2026-09-09`.
