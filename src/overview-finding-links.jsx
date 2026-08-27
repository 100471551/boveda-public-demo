import React from "react";
import { relatedFindingLabel } from "./overview-finding-associations.mjs";

export function OverviewFindingLinks({ association, onNavigate, className = "" }) {
  const signalCount = association?.signal_count || 0;
  const gapCount = association?.evidence_gap_count || 0;
  if (!signalCount && !gapCount) return null;
  return <div className={`overview-finding-links ${className}`} aria-label="Related Findings">
    {signalCount ? <button type="button" className="overview-finding-links__signal" onClick={() => onNavigate("signals")}><img src="/ui/Findings_Signals.svg" alt="" aria-hidden="true" /><span>{relatedFindingLabel(signalCount, "related signal", "related signals")}</span></button> : null}
    {gapCount ? <button type="button" className="overview-finding-links__gap" onClick={() => onNavigate("gaps")}><img src="/ui/Findings_Evidence_Gaps.svg" alt="" aria-hidden="true" /><span>{relatedFindingLabel(gapCount, "evidence gap", "evidence gaps")}</span></button> : null}
  </div>;
}
