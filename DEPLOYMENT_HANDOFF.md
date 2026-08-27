# Bóveda public demo deployment handoff

The public build is a static Vite application. It reads only the versioned files under `public/demo-data/v1.0.2/`; it does not deploy Express, project source directories, provider credentials, or writable storage.

## Deployed infrastructure

- Private GitHub repository: `https://github.com/100471551/boveda-public-demo`
- Production branch: `main`
- Release tag: `v1.0.2`
- Vercel project: `boveda/boveda-public-demo`
- Public production fallback: `https://boveda-public-demo.vercel.app`
- GitHub Actions workflow: `Deployment checks / public-demo`

The Vercel GitHub application is limited to this repository. On the Hobby plan, commits to this private repository must be authored by the GitHub account connected to the Vercel project; the release checkout is configured with that account's GitHub noreply identity.

## Normal release workflow

1. Work locally on a branch and run `npm run test:deploy && npm run build:demo`.
2. Push the branch to GitHub. The GitHub checks and Vercel Preview must pass.
3. Merge the pull request into `main`.
4. Vercel automatically promotes the `main` build to Production and serves it at `boveda.dev` after the domain is connected.

When the three demo projects need to be deliberately refreshed, run `npm run demo:export` in the trusted local workspace, inspect the diff under `public/demo-data/v1.0.2/`, run `npm run demo:validate`, and commit only the sanitized output. Never add `storage/`, `.env`, source-project directories, or provider credentials.

## One-time manual actions

- Purchase or otherwise control `boveda.dev`, then add the exact DNS records Vercel displays for the project. Add `www.boveda.dev` only if desired and redirect it to the apex domain.
- Confirm that the bundled Flink font files are licensed for public web distribution before directing public traffic to the site. If not, replace them with an appropriately licensed font and re-run visual QA.

Recommended repository protection: require the `Deployment checks / public-demo` check and an up-to-date branch before merging to `main`; enable Vercel Deployment Protection for previews if previews may contain work-in-progress content.
