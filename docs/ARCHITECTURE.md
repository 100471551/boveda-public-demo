# Architecture — v0.14.0 (record contract v0.9.0, Signals contract v0.3.1, Findings presentation contract v1.0.0, History contract v0.11.1, analytical projection v0.13.2)

## Shape

The application has five deliberately isolated layers:

1. A local Node/Express service performs read-only evidence collection, OpenAI reconstruction, grounding validation, atomic JSON persistence, reanalysis, and HTML report generation.
2. A pure deterministic Findings module reads a compatible stored Project Record and derives versioned check executions, canonical shared Findings, Reconstruction confidence, Overview evidence states, and the independent Project Evidence Coverage states. It performs no I/O, provider calls, project inspection, persistence, or reconstruction.
3. A bounded, read-only History source collector recovers resolvable Git activity and file-backed MLflow runs; a separate pure deterministic History module combines those observations with the same canonical Project Record and derives a conservative material chronology plus supporting activity. Neither component performs provider calls, executes the imported project, persists History data, or changes the canonical record. Bóveda audit activity is never treated as host-project activity.
4. A React/Vite client renders the empty/import flow, unchanged Overview content, display-only reconstruction terminology, visual Overview indicators, the transversal Coverage indicator, Findings, and History. It never receives the provider credential and never independently determines a check, state, or event.
5. A read-only deterministic analytical layer recovers cell-scoped notebook evidence already authorised by the Project Record and builds a typed graph of targets, populations, data formation, model variants, searches, evaluation attempts, metrics, diagnostics, prevalence, features, selection/output statements, scoped limitations, evidence bindings, execution contexts, and persisted artefacts. It performs no provider calls, project execution, persistence, or pixel interpretation, and it cannot change the canonical Project Record.

## Analytical reconstruction flow

```text
stored canonical Project Record
  → notebook evidence items already authorised by that record
  → read-only cell / heading / persisted-output recovery when the audited source remains available
  → deterministic target, population, preparation, estimator/dataflow, search, metric, diagnostic, feature and output pattern extraction
  → strict context-preserving analytical object graph
  → applicability-gated supervisor-facing projections
```

`GET /api/projects/:id/analytical` computes this projection on demand. Canonical results are strictly bound by target, method, model variant, evaluation attempt, metric computation, dimension, sample and evidence; rounded proximity cannot bind a count to a rate or an untuned run to a final run. When persisted documentation establishes a metric priority and a compatible final held-out comparison exists, the Overview derives one Best final result without weighting or combining metric families. The historical canonical primary and formal project model selection remain separate objects. Every object carries an epistemic state, evidence IDs and a source locator. Persisted source images are registered as artefacts only; their pixels are not interpreted.

Target construction is retained as a first-class dependency DAG. `TargetDefinition` points to a construction root and target-scoped graph; observed assignment, grouping, aggregation, fill, mapping, cast, comparison and threshold/mask steps retain expressions, recoverable parameters, source lines, execution counts and evidence. Derived edges encode actual dataflow rather than notebook proximity. Terminal source fields remain a deterministic backwards traversal of this graph. Ambiguous roots, missing variable dependencies and cycles produce bounded partial graphs instead of fabricated continuity, while target-to-target subset relations remain a separate object family.

Population lineage is separately typed. Observation populations, filtered cohorts and train/evaluation samples may become nodes; prediction vectors and technical feature matrices may only attach as provenance to an established sample. Context-specific lineage views include defensible upstream ancestors, deduplicate only through count plus relationship/role evidence, and retain raw variable identity in provenance rather than supervisor-facing labels. A cross-component consistency projection verifies canonical raw-value reuse, comparison references and primary sample alignment before rendering.

There is one authoritative `boveda-supervisory-record-0.9.0` object per imported project. Identity, purpose/scope, samples, results/evaluation, data, confidence, provider metadata, validation outcome, and evidence items live together. The Hero, detail sections, evidence drawer, sidebar, and report project that same record.

In particular, `samples.source_data`, `samples.model_sample`, and `samples.evaluation_sample` are single shared facts. Their repeated appearances are render-time reuse, not separate reconstruction calls. `Evaluation sample` also has one canonical Findings field identity despite appearing under Evaluation and Sample lineage.

## Findings flow

```text
stored Project Record (unchanged)
  → Overview field and Project Evidence Coverage domain
  → supervisory question
  → deterministic, versioned check execution
  → canonical result + materiality rule
  → one Signal for material SIGNAL PRESENT, or one Evidence Gap for material INSUFFICIENT EVIDENCE
  → deterministic canonical aggregation and stable product ordering
  → supervisor-facing SignalPresentation (title, condition, bounded relevance, scope, owner, trail)
  → explicit object impacts
  → field/group/section state and separate coverage-domain/overall state
```

`GET /api/projects/:id/signals` computes this projection on demand. Stable hashes provide reproducible execution and Finding identities. Findings are stored once in the response and referenced by ID from every affected row or field. `NO SIGNAL DETECTED` and `NOT APPLICABLE` create no Finding. Existing audit files are neither extended nor rewritten.

The React presentation never re-evaluates a predicate. It projects active canonical Signals and Evidence Gaps into distinct compact cards, ordered by Overview ownership, supervisory-question priority, and canonical identity. Compatible executions sharing one Signal identity render once with combined scopes. Internal check IDs, execution IDs, graph IDs, and Evidence Token IDs remain in the trail. The full field/check matrix is secondary verification under progressive disclosure.

Every visible colour includes `state_reason_ids`. Every check and Finding retains supporting, contradicting, qualifying, and contextual evidence arrays, explicit gaps, claim boundaries, and a navigation trail to Evidence Tokens. `NO SIGNAL DETECTED` is emitted only when a check ran with sufficient required evidence. Missing evidence remains `INSUFFICIENT EVIDENCE`; an unimplemented question remains explicitly unimplemented.

Reconstruction confidence is derived after checks and Findings. Its unchanged 0–8 ladder is cumulative: primary identity, direct result evidence, method and target, evaluation design, evaluation sample/period/denominator, reproducibility, absence of material limits or contradictions, and a complete explicit claim boundary. A failed step stops the ladder. Only a Finding explicitly attached to the primary result or one of its required dependencies applies a `blocks` (maximum 3, or 0 when existence is blocked), `limits` (maximum 5), or `qualifies` (maximum 6) cap. General coverage gaps and `contextualises` impacts do not lower Reconstruction confidence.

Overview aggregation and Evidence Coverage aggregation are independent deterministic algorithms. Coverage is a reconstructibility property, not a fourth Overview section and not a project, documentation, governance, compliance, quality, risk, or health score.

## History flow

```text
stored canonical Project Record (unchanged)
  + bounded read-only Git history (messages, timestamps, changed files, tags)
  + bounded file-backed MLflow run metadata when present
  → supported dated record fields and persisted primary evaluation
  → recorded Bóveda audit metadata and retry telemetry
  → deterministic material-event projection + supporting/unresolved activity
  → passive chronological UI with Evidence Tokens, related objects, and audit diagnostics
```

`GET /api/projects/:id/history` computes this projection on demand and never rewrites the stored record. Git collection uses native read-only commands, is capped at the newest 300 commits across refs and 200 newest tags, and retains authored timestamps, bounded commit messages, and up to 60 changed paths per commit. MLflow collection is capped at 600 eligible metadata/tag/metric files and does not inspect artefact payloads. Version-shaped tags, failed/interrupted runs, and path-supported data/model/evaluation/pipeline/decision changes can be elevated; generic uploads, dependency churn, test/CI work, and other valid activity remain supporting. A large repository therefore retains routine evidence without turning the main chronology into a raw `git log`.

An event date remains unresolved unless the source supplies an explicit date. Git HEAD identity alone is not enough to reconstruct commit events. Finding links still require an explicit temporal relationship; shared evidence, adjacent timestamps, or changed files never imply causality or a Finding relationship.

## Reconstruction flow

```text
directory
  → canonical path + content snapshot
  → bounded evidence inventory
  → deterministic facts and persisted-output extraction
  → one schema-constrained LLM reconstruction
  → evidence-ID, numeric, state, confidence, and sample-role validation
  → exact-field repair using only already-cited evidence when every failure is safely localizable
  → otherwise, the existing full-reconstruction correction path
  → at most three total provider attempts across reconstruction and repair
  → second content snapshot / read-only assertion
  → atomic persisted record
```

The Responses API request uses `store: false`, a strict JSON schema, and an evidence-ID enum generated from the current audit. Project file content is explicitly treated as untrusted data rather than instructions. A localized repair receives only the failed field values and the evidence those fields already cited; its schema permits exactly those paths and evidence IDs. The merged candidate is accepted only after the unchanged full validator passes it.

Failures are localizable only when every validation error identifies an exact material-field path, all cited evidence IDs exist, the paths are independent, and no more than four fields are affected. Global, cross-field, citation-selection, and ambiguous failures continue through full reconstruction. If permitted local attempts are exhausted, only the failed fields are replaced with their canonical unresolved forms—and only if the resulting record passes the complete contract.

## Evidence supported

- README, Markdown, plain text, RST, HTML, and XML documentation;
- Python, R, JavaScript/TypeScript, SQL, and shell source;
- JSON, YAML, TOML, INI, CFG, manifests, and DVC metadata;
- Jupyter notebook source plus persisted text outputs;
- CSV/TSV text and deterministic physical row count (including header);
- text-bearing PDF reports;
- XLSX/XLSM shared-string content where extractable;
- checked-out Git branch and HEAD identity;
- filenames, paths, hashes, and project-directory identity.

Collection ignores dependency/build/cache directories, does not follow symlinks, accepts eligible files up to 8 MB, and bounds the semantic pack to 200 candidates, 28,000 characters per item, and 320,000 characters overall. Reusable analytical evidence classes such as evaluation, training, model, pipeline, output and deployment files are prioritized ahead of tests and examples when a large project exceeds the bound; Quarto and R Markdown sources are eligible alongside ordinary code and documentation.

## Epistemic and missing states

Material fields preserve `OBSERVED`, `DERIVED`, `INTERPRETED_INFERRED`, or `UNRESOLVED`, plus one or more evidence IDs when supported. Missing states are distinct:

- `not_established`: inspection did not support the value;
- `execution_required`: a specifically identified unpersisted execution is the missing dependency.

The engine does not run imported code. Numeric values must be supported by the field's cited evidence, either directly, through equivalent percentage/decimal or date forms, or through a small set of safe deterministic derivations such as explicit label cardinality, header-adjusted row count, and an unambiguous documented train/test split. The validator also rejects a training sample that incorporates a separately stated held-out evaluation sample.

## Persistence and reanalysis

The project ID is stable for the canonical imported path. Each analysis receives a fresh audit ID. Records and registry updates use same-directory temporary files followed by atomic rename. Reanalysis replaces the current record for that project but never changes the source project.

Bundled historical audit payloads are copied into local storage byte-for-byte. Migration never invokes reconstruction and never overwrites a record already present for the same project. Re-importing an unchanged source snapshot reuses its audit; explicit reanalysis or a changed snapshot is required before a new audit is generated.

## Security boundary

- The API key exists only in the server/validation process environment.
- The OpenAI request is made by the local service, never the browser.
- Error responses redact strings shaped like credentials.
- Stored records contain provider/model/response metadata, not credentials.
- Source-project hashes are checked before and after analysis.

## Known limitations

- No OCR or semantic analysis of chart pixels/images.
- No execution of notebooks, pipelines, model artefacts, or SQL.
- No specialised MLflow database parser; History reads only bounded file-backed run metadata, tags, and last recorded metric values.
- PDF extraction depends on embedded text and may emit font-parser warnings for malformed fonts.
- Spreadsheet support is intentionally limited to shared textual cells; formulas and workbook semantics are not evaluated.
- History intentionally bounds Git recovery to the newest 300 commits across refs; older untagged activity remains unresolved for larger repositories.
- Evidence snippets are bounded and can omit low-priority material in very large repositories.
- The downloaded report is a self-contained traceable HTML document, not a PDF.
- The native directory picker is macOS-specific; manual absolute-path entry remains available.
