# Bóveda public demo deployment handoff

The public build is a static Vite application. It reads only the versioned files under `public/demo-data/v1.0.2/`; it does not deploy Express, project source directories, provider credentials, or writable storage.

## Deployed infrastructure

- Private GitHub repository: `https://github.com/100471551/boveda-public-demo`
- Production branch: `main`
- Release tag: `v1.0.2`
- Vercel project: `boveda/boveda-public-demo`
- Production domain: `https://boveda.dev`
- Redirect: `https://www.boveda.dev` → `https://boveda.dev` (HTTP 308)
- Public production fallback: `https://boveda-public-demo.vercel.app`
- GitHub Actions workflow: `Deployment checks / public-demo`

The GoDaddy-hosted DNS zone is connected with the Vercel-provided apex A record and project-specific `www` CNAME. Vercel reports both custom domains as valid. DNS resolver caches and TLS issuance can lag behind the authoritative record change during the configured one-hour TTL window.

The Vercel GitHub application is limited to this repository. On the Hobby plan, commits to this private repository must be authored by the GitHub account connected to the Vercel project; the release checkout is configured with that account's GitHub noreply identity.

## Normal release workflow

1. Work locally on a branch and run `npm run test:deploy && npm run build:demo`.
2. Push the branch to GitHub. The GitHub checks and Vercel Preview must pass.
3. Merge the pull request into `main`.
4. Vercel automatically promotes the `main` build to Production and serves it at `boveda.dev` after the domain is connected.

When the three demo projects need to be deliberately refreshed, run `npm run demo:export` in the trusted local workspace, inspect the diff under `public/demo-data/v1.0.2/`, run `npm run demo:validate`, and commit only the sanitized output. Never add `storage/`, `.env`, source-project directories, or provider credentials.

## One-time manual actions

- Confirm that the bundled Flink font files are covered by a Webfont License for `boveda.dev` before promoting the custom domain publicly. The [Identity Letters EULA](https://www.moritz-kleinsorge.de/files/EULA-Identity-Letters-v2-1-20250109) distinguishes self-hosted web use from desktop/static-document use. If no matching license exists, purchase the appropriate license or replace Flink with an appropriately licensed font and re-run visual QA.

Recommended repository protection: require the `Deployment checks / public-demo` check and an up-to-date branch before merging to `main`; enable Vercel Deployment Protection for previews if previews may contain work-in-progress content.
