# Bóveda Alpha v1.1.0

Bóveda inspects a local ML or AI project without executing or modifying it, reconstructs one fixed supervisor-facing Overview, validates every material answer against cited evidence, and persists the resulting record locally. v1.1.0 adds an honest browser-local demo session and a general supervisory workspace using the existing sanitized project snapshots. The public Welcome and How it works pages remain open; the workspace, Projects and project routes share one compact sign-in experience. The analytical structure and project dashboards remain unchanged.

The analytical projection reconstructs evidence-backed workstreams, context-bound model comparisons, supported evaluation diagnostics, feature/driver evidence, population/sample lineage, data-formation operations, persisted analytical failures, and source-visual references. Components are omitted when their minimum evidence contract is not met. Project identities, labels, values and expected answers are never encoded in the runtime; the projection is built from persisted notebook evidence and retains evidence IDs and source locators.

v0.20.2 adds one bounded population-role capability: an explicit complete population partition can supply the project population when its parent unit matches the established project unit and the evidence is not model-, evaluation-, scoring-, or output-scoped. Numerically larger repeated or filtered rows remain downstream lineage stages. Persisted tabular scoring artefacts with recorded shapes are exposed separately as output populations.

v0.20.3 makes a bounded dashboard UX correction: result contexts are selected instead of overlaid, headline results use a consistent two-decimal decimal scale, comparison cards fit their evidence table, selectors expose the complete option list with a clear selected state, and record actions remain adjacent to the title.

v0.20.4 adds one bounded project-anatomy capability: the selected population-lineage workstream supplies the dashboard's model and evaluation samples everywhere they are summarised, while the broad project population remains fixed. Output-only contexts cannot inherit unrelated modelling samples.

v0.20.5 adds one bounded focal-target capability: Bóveda selects one evidence-backed target and connects its main result, like-for-like model comparison, selected-model features, evaluation diagnostics, original/training/evaluation counts, missingness evidence, and a simplified population map. Missing diagnostics or missingness quantities remain explicitly unavailable instead of being borrowed or inferred from another workstream.

`GET /api/projects/:id/analytical` is a read-only, provider-free projection. It reads only notebook files already represented in the project evidence pack when the audited source path remains available, and otherwise falls back conservatively to the stored excerpts. It does not modify the canonical Project Record or the imported project.

v0.20.8 makes Reconstruction confidence an overall reconstruction assessment while retaining the deterministic main-result evidence ladder. Ordinary Signals do not lower confidence. The canonical Material evidence absence Signal does: when an important applicable analytical area is entirely unavailable, overall confidence cannot remain above partial and is reduced by at least one level from the otherwise supported result-trace score. The explanation still states how far the main result was traced and separately identifies the whole-area reconstruction limitation.

v0.20.9 adds evidence-aware empty and partial dashboard states. Missing analytical areas keep their own heading and evidence-specific explanation in a compact white state card, while obsolete outer backgrounds, fixed heights and ghost space are removed. Populated comparison, evaluation and data-lineage components now size to their actual content, and the project drawer uses a more regular reading rhythm. Reconstruction, Signals, Findings and reports are unchanged.

v0.20.10 makes seven bounded UX corrections: project titles now describe the established primary analytical target while preserving the canonical project identity, the side-menu layout flows around multi-line titles, reanalysis has a wider animated busy state, the redundant title warning is removed, vertical lineage cards size to their graph, empty-state copy and icons are larger, and 11/12 px interface text advances by one pixel. No provider rerun is required because the descriptive title is a deterministic display projection from the established target.

v0.20.13 starts directly from v0.20.11 and adds a shared, question-aware semantic contract for Overview sections. Related evidence remains available internally, but a dashboard or report section is available only when the reconstructed evidence answers that section's supervisory question.

This directory is the independent v1.1.0 checkpoint based on the latest v1.0.2 production release. Findings remains a separate projection at `GET /api/projects/:id/signals`; History is a second read-only projection at `GET /api/projects/:id/history`. Neither projection can change the canonical Project Record.

History projects the canonical record together with bounded, read-only source history. When a real repository is available, it recovers up to 300 commits with authored timestamps, messages, changed files, and tags; it also recovers bounded file-backed MLflow run metadata when present. Deterministic materiality rules elevate only substantiated data, model, evaluation, pipeline, decision, failed-run, and versioned-release activity. Every other valid recovered event remains available in a collapsed supporting section, so a large repository does not become the main chronology. Host-project and Bóveda events remain visually separated; unresolved dates stay unresolved; Git HEAD alone creates no chronology; and Findings are linked only through an explicit temporal relationship.

Existing audits remain compatible and are reused without reconstruction. Their audit IDs, source identity, evidence, generation metadata, provider/model, and originating product version remain unchanged. Importing an unchanged source reuses its current audit; explicit **Reanalyse** or a changed source snapshot can create a new audit.

The layer implements ten bounded checks across purpose, target, population scope, evaluation design, population filters, sample lineage, primary-result origin, project context, source inventory, and reproduction inputs. Checks retain the four canonical results, typed evidence roles, explicit gaps, allowed/prohibited claims, and complete trails. A material `SIGNAL PRESENT` creates a Signal; a material `INSUFFICIENT EVIDENCE` condition creates an Evidence Gap. `NO SIGNAL DETECTED` and `NOT APPLICABLE` create no Finding. Every Finding is canonical and counted once even when several fields or coverage domains reference it.

The Findings surface leads with **What needs attention**. Deterministic `SignalPresentation` objects provide factual title, established condition, bounded relevance, compact scope, owning field, and a trail entry. Signals and Evidence Gaps are visually and epistemically separate. The complete field/check matrix remains available under collapsed **Checks performed**, where successful, inapplicable, and insufficient executions can be verified without turning green checks into Findings.

The UI presents reconstructed evidence states as `Reconstructed`, `Partially reconstructed`, `Material information gap`, and `Missing information / Not applicable`. These are display labels over the unchanged internal state model. Project Evidence Coverage remains separate and uses `Sufficiently covered`, `Partially covered`, `Material evidence gap`, and `Not assessed / Not applicable`. Neither system averages colours or computes a project score.

Reconstruction confidence is the existing deterministic cumulative 0–8 evidentiary ladder for the primary result, renamed for display clarity. It replaces the displayed provider-authored confidence without changing the stored audit. Explicit primary-result Finding impacts cap confidence at 3 (`blocks`), 5 (`limits`), or 6 (`qualifies`); `contextualises` and general coverage gaps do not cap it.

## Public demo build

The default production build is fail-closed and static. It reads the immutable sanitized, pre-analysed snapshots in `public/demo-data/v1.0.2/`; the snapshot version remains unchanged because v1.1.0 does not reconstruct analytical data. It does not call or deploy the Express server, writable storage, source-project paths, macOS browsing, reconstruction code, or provider credentials. Dashboards, Findings, History, evidence drawers, diagnostics and pre-generated HTML/PDF reports remain available. Import, new analysis, deletion and reanalysis show an explanatory read-only notice instead of issuing a request.

The v1.1.0 sign-in is a presentation-layer demo session, not an authentication service. It stores only the entered email, a derived display name and a sign-in timestamp in the current browser. It creates no account, sends no data and does not claim to secure the public static snapshots.

```bash
npm ci
npm run demo:validate
npm run test:deploy
npm run build:demo
```

See [DEPLOYMENT_HANDOFF.md](DEPLOYMENT_HANDOFF.md) for the GitHub → Vercel workflow and the short list of one-time account/domain actions.

## Run locally

Requirements: Node.js 24+ and macOS for the native **Browse** button. A directory path can be entered manually on other platforms.

```bash
npm ci
npm run build
npm run server
```

Open `http://127.0.0.1:4310`.

For development with Vite hot reload:

```bash
npm run dev
```

The UI is then available at `http://127.0.0.1:4309`.

## Live reconstruction

The server reads `OPENAI_API_KEY` only from its process environment. The credential is never sent to the browser or persisted in a record. The default model is `gpt-5.6-sol`; override it with `BOVEDA_OPENAI_MODEL`.

```bash
OPENAI_API_KEY=... npm run server
```

Without a provider credential, Bóveda uses a deliberately conservative fallback that establishes only directly recoverable project identity/README information and leaves unsupported fields unresolved.

## Validation

```bash
npm test
npm run build
npm run validate:corpus
npm run validate:live
```

`validate:live` loads the authorised local credential into that validation process only. It does not print, copy, persist, or pass the credential to the application frontend. Generated development records are written under ignored `validation/results/` directories.

See [Architecture](docs/ARCHITECTURE.md), the [v0.11 History validation](validation/HISTORY_VALIDATION.md), the inherited [v0.10.2 Findings validation](validation/SIGNALS_VALIDATION.md), and the historical [R1–R5 validation](validation/VALIDATION.md).
