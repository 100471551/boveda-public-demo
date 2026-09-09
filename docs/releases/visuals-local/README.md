# Visuals local workflow

The hosted release displays only the reviewed, immutable local snapshot. Generation remains a separate explicit local operation; opening a view or starting the hosted app never runs an LLM or analytical pipeline. New audit stays disabled online.

Local generation: `python3 -B -m apps.visual_evidence.run --output outputs/NEW_RUN --with-model --budget 5`. Use a new output directory to preserve earlier drafts. The generator extracts saved raster images without executing the project, screens at most six images per audit, and writes draft manifests. A valid hash-bound editorial review is required by `apps.visual_evidence.qualify`; only reviewed activation entries are exported. Unknown or stale bindings produce normal absence. This is a curated Alpha capability, not automatic semantic certification.

For the next local snapshot, run the normal `apps/primitive_probe/export_hosted_demo.py` exporter with the existing private key file. It revalidates approved audit/asset hashes, limits each hosted image to 4 MB and emits encrypted assets. Keys, raw manifests, drafts, audit findings and private absolute source paths are not release source.

These files preserve the generic local integration source; execute them within the Boveda_2.0 workspace, which supplies ProductLibrary and authorized credential loading.

## Source-image coverage (2026-09-09)

The contextual selection is now complemented by a deterministic source-only gallery. It inventories saved PNG/JPEG files, notebook outputs and embedded HTML raster images, deduplicates exact bytes, retains all discovered relative locators, and preserves the reviewed captions and values. Obvious decorative filenames are excluded; image/scan limits remain explicit. No LLM is used for the source-only gallery and no relationship to audit findings is claimed.

`qualify()` attaches the source catalog from the generation inventory. Existing reviewed supplements can be refreshed without a model call with `python -B -m apps.visual_evidence.catalog --output outputs/<new-directory>` from the full local Bóveda workspace. This produces new immutable manifests and `activation.json`; after validation, atomically replace `outputs/Primitive_Product_UX/visual_evidence_pilot.json` with that activation file. The prior manifests remain available. Serving the page only reads the bound supplement.

The UI shows 24 additional entries initially and exposes all remaining entries through Show more. Images load lazily. Originals remain unchanged; their bytes are authenticated, SHA-bound to the audit, and only served after login. Embedded and standalone copies of identical bytes share an entry; source locators for duplicates of contextual images are added to their Source disclosure.

Current supported image bounds: inventory 500 candidate records / 80 MiB retained bytes / 200 MiB read / 15 seconds, individual hosted image at most 4 MiB, source image at most 20 megapixels. GIF, SVG and PDF are not converted in this Alpha release. Unsupported formats and oversized images may remain in the repository; the gallery does not claim to be a complete file inventory. No notebook or source code is executed.

Verified release: 49 contextual items retained, 592 source-only entries added across the available audits, 574 distinct image assets globally. R1 includes all four `graphs/*.png` files. No canonical or C1 content changed. Source-only images remain labeled separately, including audit records without contextual figures.
