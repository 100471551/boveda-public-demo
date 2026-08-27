export function sourceMatchesAudit(record, currentSnapshot) {
  return Boolean(record?.source_project?.content_snapshot_after)
    && record.source_project.content_snapshot_after === currentSnapshot;
}
