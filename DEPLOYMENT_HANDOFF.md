# Bóveda 2.0.1 — deployment handoff

This document describes the current hosted viewer. The [v1 handoff](docs/releases/v1-hosting/DEPLOYMENT_HANDOFF.md) is historical.

## Deployment boundary

- Repository: `100471551/boveda-public-demo`; production branch: `main`.
- Application: [boveda.dev](https://boveda.dev), hosted with Vercel.
- Build: Node 24, `npm ci --ignore-scripts`, then `npm run build:demo`.
- `dist/` contains public UI assets. `api/demo.mjs` serves the HTML and protected content through the v2 access service.
- The deployed bundle excludes the legacy `engine/`, `src/` and `public/` directories. It contains no endpoint for creating, deleting or regenerating audits.
- Encrypted snapshots preserve existing records. Do not use the legacy `demo:export` command to refresh v2 content.

## Private server configuration

Configure these values in the hosting environment, never in Git or browser bundles:

| Setting | Purpose |
| --- | --- |
| `BOVEDA_PUBLIC_ORIGIN` | Exact HTTPS production origin |
| `BOVEDA_DATA_KEY` | Existing snapshot decryption key, 32 bytes encoded as hex |
| `BOVEDA_DEMO_CREDENTIAL` | JSON credential record: username, `pbkdf2_sha256`, iterations, hex salt and password hash |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | Redis REST connection; `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` are supported alternatives |
| `VERCEL_URL` | Deployment hostname supplied by Vercel for preview origin validation |

The data key must match the encrypted snapshot; a new random key cannot decrypt existing records. Changing the credential or data key invalidates sessions. Configuration or Redis failures deny protected access. Demo account details are distributed privately.

## Release checks

1. Run `npm ci --ignore-scripts`, `npm run demo:validate`, `npm run test:deploy` and `npm run build:demo`.
2. Review the source diff and deployment preview. Check both anonymous denial of protected data and authorized viewing, logout, and disabled new-audit controls.
3. Promote the reviewed branch to `main`; the connected Vercel project deploys that branch.
4. Confirm the resulting deployment and retain the previous known-good commit or deployment for rollback.

Production and preview environment values, GitHub integration scope, domain ownership and account permissions must be managed in the respective hosting accounts. A source review alone does not verify those settings.

## Repository publication is a separate decision

A deployed website does not imply permission to redistribute every file in its Git history. Flink redistribution rights remain unverified; the owner has chosen to retain the current typography for the educational demo. This choice is not evidence of a font license. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Also review Actions logs, release attachments and historical branches before changing visibility; a new cleanup commit does not remove previously committed material.

Recommended repository controls: dependency alerts, protected production merges requiring deployment checks, and restricted access to production secrets. Do not place confidential security findings in public issues or build logs.
