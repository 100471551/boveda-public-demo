# Bóveda Alpha 1.1.0

The `v1.1.0-gradient` branch is an alternative visual study. It restores the Figma 43:2454 aqua/cream/periwinkle page gradient, converts appropriate white cards and panels to borderless blurred glass, and renders alternating information bands as borderless 30% white washes. The production `main` visual system remains unchanged while this alternative is evaluated.

First coherent supervision-workspace release, based independently on the current v1.0.2 production checkpoint.

- Public Welcome and How it works remain available without signing in.
- One compact Bóveda-styled sign-in modal gates the workspace, Projects and project URLs.
- Browser-local demo sessions are explicitly passwordless and create no account or network identity.
- New general workspace dashboard uses the real demo snapshots for Active Projects, Signals to review, Evidence Gaps, projects requiring attention, reviewable Signals and recorded project activity.
- Signal rows open the exact canonical Finding, project Signal and Gap pills focus the corresponding Findings group, and activity rows open the relevant project History.
- A secondary Usage element totals the tokens recorded by the three stored audit diagnostics; no usage values are estimated.
- Signing in always enters the general workspace, regardless of which protected route prompted the sign-in.
- Review inbox items use a bounded `new` / `in_review` / `reviewed` status shape. Current immutable snapshots default to `new`; no unsupported resolution workflow is implied.
- The former Start exploring artwork has been removed, authenticated Demo badges use the platform red, and the workspace import icon remains white.
- Persistent navigation keeps Home mapped to the workspace, four squares mapped to Projects and `?` mapped to How it works.
- The top-right control now shows the current demo session and provides Log out.
- Existing project dashboards, Findings, History, evidence navigation and report downloads remain intact.
- Import, deletion, new analysis and reanalysis remain read-only demo actions.

The v1.0.2 sanitized data snapshot remains immutable and authoritative for this UI-only release. The analytical backend, local project storage, source-project directories and provider credentials are not part of the deployed runtime.
