# Bóveda — hosted research demo (2.0.1)

Bóveda is a research prototype for inspecting machine-learning projects and presenting their purpose, construction, evidence and supervisory Signals. The hosted demo at [boveda.dev](https://boveda.dev) lets evaluators explore preserved audits; access to audit content requires the demo account supplied separately by the project author.

## What this repository contains

This is the **deployment repository**, not the complete Bóveda 2.0 research workspace. It contains the current viewer, its access service and encrypted audit snapshots, together with the earlier v1 implementation retained for provenance. It supports inspection of the interface, deployment code and access controls. It does **not** independently reproduce the full 2.0 audit-generation pipeline or the research validation runs.

The current experience provides Overview, Evidence, Construction, Signals and an additional Visuals destination. It displays retained results rather than creating new audits. Audit creation, project import, deletion and regeneration are disabled in the hosted version; production does not call an LLM API.

| Location | Role |
| --- | --- |
| [`demo-v2/web/`](demo-v2/web/) | Current interface and canonical-report viewer |
| [`demo-v2/server/`](demo-v2/server/), [`api/demo.mjs`](api/demo.mjs) | Server-side access, sessions and protected content delivery |
| [`demo-v2/data/`](demo-v2/data/) | Encrypted snapshot and integrity manifest; decryption keys are not included |
| [`demo-v2/tests/`](demo-v2/tests/) | Deployment, authentication and session regression tests |
| [`src/`](src/), [`engine/`](engine/), [`tests/`](tests/), [`public/`](public/) | Historical v1 application, engine, tests and sanitized demo material; excluded from the current hosted payload |
| [`docs/releases/`](docs/releases/) | Version-specific implementation notes and retained release material |

### Evidence and corpus boundaries

The research inventory comprises **23 unique repositories**. The hosted snapshot presents **23 available audit cases corresponding to 21 repositories**, including repeated repository identities for NMR and Subway cases. These are different counting units, not 23 independent repositories displayed in the interface. R10 and R20 are retained as unavailable metadata entries; their non-publishable canonical reports and evidence are not included in the hosted bundle.

Signals and Audit Confidence describe the reconstruction and its supporting evidence; they are not a certification of model quality. Visuals distinguish contextual figures, comparisons drawn from established values, and additional source images shown with filenames and locations without inferred interpretations. A missing visual is a normal state.

The historical v1 snapshots are retained in plain text and pre-generated reports. Current v2 audit payloads and source images are encrypted; authorized access to the demo does not grant redistribution rights over third-party material.

## Verify the current deployment code

Use Node.js 24 and npm 11:

```bash
npm ci --ignore-scripts
npm run demo:validate
npm test
npm run build:demo
```

These checks run without production credentials or paid model calls. They validate encrypted-file integrity, access-control behavior with test fixtures, and the public build boundary. They do not decrypt production evidence, regenerate audits, or establish the scientific correctness of every retained claim.

The build writes public interface assets to `dist/`. Serving the protected application additionally requires the Vercel function, Redis and private configuration described in the [deployment handoff](DEPLOYMENT_HANDOFF.md). Opening `dist/` alone is not a complete running demo. Never put server secrets in browser-prefixed environment variables.

## Historical implementation

[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), the root `tests/` suite and commands such as `npm run server`, `npm run dev` and `npm run build:v1` concern the earlier application. The [archived v1 README](docs/releases/v1-hosting/README.md) preserves that history. `npm test` and `npm run test:deploy` run the current deployment suite; `npm run test:v1` explicitly runs the retained legacy suite. In the 10 September 2026 checkout, that legacy suite reports 285 passes and 64 failures (349 tests), including missing development fixtures and obsolete version/deployment expectations. Those legacy failures remain unresolved; they are not covered by a passing current-deployment check. Older tags and release descriptions remain version-specific; they should not be read as claims about the current hosted system.

## Rights and access

See [third-party notices and publication prerequisites](THIRD_PARTY_NOTICES.md). This repository currently has no general open-source license grant. In particular, permission to redistribute the bundled commercial Flink font files has not been established. The educational purpose of this project does not establish a redistribution license; no license to reuse these font files is granted here.

Project author: Luis López Trejo. Source-project attribution is available through repository links in the audit interface; Bóveda does not claim authorship of those projects or their figures.
