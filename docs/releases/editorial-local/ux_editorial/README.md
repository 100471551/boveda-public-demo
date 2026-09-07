# Final UX Editorial Layer

This module composes English display content after the verified canonical audit is complete. It never writes to the canonical package or supplies an input to an analytical stage.

- `prompts.py`: the field-specific content contracts and production qualification switch.
- `editor.py` / `provider.py`: KEEP, REWRITE and canonical FALLBACK; structured responses and a separate bounded API usage ledger.
- `presentation.py`: the temporary editorial/product inspection surface reused by `primitive_probe` and preserved previews. It is not the final Figma design.
- `content_contract.py`: generates the complete field map and exact prompt book, including NO EDITORIAL PROMPT surfaces.

The probe invokes this module automatically only after a verified publishable result. Opening the inspection surface does not call the model. The current audit's canonical Markdown and raw artifacts remain available in the probe.

For explicitly authorized preserved final outputs:

```sh
python3 -B -m apps.ux_editorial.run --manifest <authorization.json> --out <new-editorial-directory> --budget 0.75
```

The manifest must contain `editorial_execution_authorized: true` and a `packages` list with `label` and workspace-relative `root`. Authorization is supplied by the caller; the tool does not discover or authorize projects. The output directory must be new and outside every canonical package.

Each result contains `fields.json` (canonical/display decisions), `content.json` (component content), `display.md`, `preview.html`, and usage/comparison summaries. Canonical epistemic states, item labels, evidence identities and Q1/Q2/S5/S6 records do not receive editorial prompts.

Structural checks, numeric checks, control-token rejection and canonical fallback are deterministic. They do not prove semantic equivalence. The qualification evidence uses the Alpha product criterion: would the display materially mislead a supervisor?

```sh
python3 -B -m unittest discover -s apps/ux_editorial/tests
```

All tests use offline transports. The regular provider makes real paid requests using the already configured local credential.
