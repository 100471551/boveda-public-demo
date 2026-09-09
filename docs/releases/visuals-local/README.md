# Visuals local workflow

The hosted release displays only the reviewed, immutable local snapshot. Generation remains a separate explicit local operation; opening a view or starting the hosted app never runs an LLM or analytical pipeline. New audit stays disabled online.

Local generation: `python3 -B -m apps.visual_evidence.run --output outputs/NEW_RUN --with-model --budget 5`. Use a new output directory to preserve earlier drafts. The generator extracts saved raster images without executing the project, screens at most six images per audit, and writes draft manifests. A valid hash-bound editorial review is required by `apps.visual_evidence.qualify`; only reviewed activation entries are exported. Unknown or stale bindings produce normal absence. This is a curated Alpha capability, not automatic semantic certification.

For the next local snapshot, run the normal `apps/primitive_probe/export_hosted_demo.py` exporter with the existing private key file. It revalidates approved audit/asset hashes, limits each hosted image to 4 MB and emits encrypted assets. Keys, raw manifests, drafts, audit findings and private absolute source paths are not release source.

These files preserve the generic local integration source; execute them within the Boveda_2.0 workspace, which supplies ProductLibrary and authorized credential loading.
