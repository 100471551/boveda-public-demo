import React from "react";

function EmptyEvidenceIcon() {
  return <svg className="empty-evidence-state__icon" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M6.75 3.75h6.5l4 4v12.5H6.75z" />
    <path d="M13.25 3.75v4h4" />
    <path d="M9.25 12h5.5M9.25 15.25h4" />
  </svg>;
}

export function EmptyEvidenceState({ title, children, className = "" }) {
  return <div className={`empty-evidence-state ${className}`.trim()}>
    <EmptyEvidenceIcon />
    <strong>{title}</strong>
    <p>{children}</p>
  </div>;
}
