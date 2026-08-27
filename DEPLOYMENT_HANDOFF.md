# Bóveda public demo deployment handoff

The public build is a static Vite application. It reads only the versioned files under `public/demo-data/v1.0.2/`; it does not deploy Express, project source directories, provider credentials, or writable storage.

## Normal release workflow

1. Work locally on a branch and run `npm run test:deploy && npm run build:demo`.
2. Push the branch to GitHub. The GitHub checks and Vercel Preview must pass.
3. Merge the pull request into `main`.
4. Vercel automatically promotes the `main` build to Production and serves it at `boveda.dev` after the domain is connected.

When the three demo projects need to be deliberately refreshed, run `npm run demo:export` in the trusted local workspace, inspect the diff under `public/demo-data/v1.0.2/`, run `npm run demo:validate`, and commit only the sanitized output. Never add `storage/`, `.env`, source-project directories, or provider credentials.

## One-time manual actions

- Authorize access to the chosen GitHub account and create/connect the repository if this was not completed automatically.
- Authorize Vercel, import the GitHub repository, select `main` as Production, and leave the detected Vite settings in place (`npm ci`, `npm run build:demo`, `dist`). Do not add analytical-provider environment variables.
- Purchase or otherwise control `boveda.dev`, then add the exact DNS records Vercel displays for the project. Add `www.boveda.dev` only if desired and redirect it to the apex domain.
- Confirm that the bundled Flink font files are licensed for public web distribution before the first public deployment. If not, replace them with an appropriately licensed font and re-run visual QA.

Recommended repository protection: require the `Deployment checks / public-demo` check and an up-to-date branch before merging to `main`; enable Vercel Deployment Protection for previews if previews may contain work-in-progress content.
