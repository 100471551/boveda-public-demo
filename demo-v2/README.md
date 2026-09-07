# Bóveda 2.0.1 hosted demo

The public home and How it works are open. The library, audit views, supporting evidence and canonical downloads require the existing demo account. Login includes a close button; the authenticated menu includes logout. There is no registration or collection of user profile information.

The cloud release serves a preserved snapshot of 22 available audits and two unavailable metadata entries (R10 and R20). It does not run the analytical pipeline, access local project directories, remove audits or regenerate outputs. The canonical reports retain their original bytes. The UX source comes from `apps/primitive_probe/static/product_v2_0_1` in the Boveda_2.0 workspace.

## Deployment

- GitHub repository: `100471551/boveda-public-demo`; production branch: `main`.
- Vercel project: `boveda-public-demo`, team `boveda`; public domain: `https://boveda.dev`.
- Build: `npm ci --ignore-scripts` followed by `npm run build:demo` (Node 24).
- `dist/` contains only public UI assets. The Node function serves HTML and the protected API.
- Audit payloads, canonical reports and supporting references are encrypted individually with AES-256-GCM. The logical filename is authenticated as AAD. The build validates every ciphertext digest in `data/manifest.json`.
- The Vercel Upstash integration supplies `KV_REST_API_URL` and `KV_REST_API_TOKEN` in Production and Preview. The current database is on the Free plan.
- Set `BOVEDA_PUBLIC_ORIGIN=https://boveda.dev`, `BOVEDA_DATA_KEY` (32 bytes, hex), and `BOVEDA_DEMO_CREDENTIAL` (JSON with username, `pbkdf2_sha256`, iterations, hex salt and hex password_hash). These are Vercel secrets; never put them in Git. Preview login uses the exact deployment hostname supplied by `VERCEL_URL`.

Sessions are opaque, server-held Redis entries with an absolute eight-hour lifetime, or fourteen days with Remember me. Cookies are Secure, HttpOnly, SameSite=Lax and host-only. Login rotates the session; logout revokes it in Redis. Changing the credential or encryption key invalidates existing sessions. The global rolling limit allows five login attempts per minute across function instances. Redis/configuration failures deny access; free-plan exhaustion therefore makes authentication temporarily unavailable rather than exposing data.

## Validation

Run `npm run demo:validate`, `npm run test:deploy` and `npm run build:demo`. Tests cover credential compatibility with Python, session rotation/revocation/expiry, shared limiting, Redis failures, origin/host validation, encrypted data integrity and public build contents. Inspect the preview deployment before promoting the production branch.

## Version 1 preservation and rollback

The previous source, engine, public assets and documentation remain in Git. The former hosting configuration and handoff are copied to `docs/releases/v1-hosting/`. The last v1 production commit is `65826eef9b4626d748dba2ce33382739a1899f2b`. Revert the v2 release commit(s) or restore the earlier Vercel deployment to roll back; do not delete v1 files to deploy v2. `.vercelignore` and the new build prevent v1 audit files from becoming public assets in the v2 deployment.
