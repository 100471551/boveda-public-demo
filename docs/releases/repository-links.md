# Repository attribution

Repository Link is available in the existing menu and above each audit title, with an underlined label and the exported Figma 88:16 external-link icon. Both controls share one URL and open a new tab. Missing provenance is explicitly unavailable.

The adapter reuses each audit’s retained run metadata to identify exactly one source directory, then reads that directory’s Git remote origin. It does not infer URLs from titles, scan README links, execute Git, follow config includes or discover parent repositories. Existing runtime snapshots retain Git metadata, so the same mechanism covers new audits. Only normalized GitHub repository URLs are exposed; credentials, query strings and fragments are never exported. Missing, conflicting, malformed or unsupported metadata fails closed. This is provenance presentation, not C1 or an analytical rerun.

All 23 available audits have established Git origins. Verified both access points on all 23 in desktop/light and mobile/dark layouts. Offline tests cover HTTPS/SSH origins, credential stripping, hostile URLs, mismatched audit identity, ambiguous source paths, missing metadata, includes and symlinks. The product tests also pass. The exported audit payloads differ only in repository_url; all existing content, 23 canonical reports and 5,304 evidence records are unchanged. Library entries receive the same URLs. Hosted New audit remains disabled.

Prior release f5cd206 remains in Git history. Local verification and provenance hashes are in outputs/UX_Repository_Links_2026-09-07. No API/model calls were needed.
