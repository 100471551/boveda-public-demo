function iconSource(reconstruction) {
  return [
    reconstruction?.identity?.name?.value,
    reconstruction?.identity?.description?.value,
    reconstruction?.purpose_scope?.task?.value,
    reconstruction?.purpose_scope?.target_outcome?.value,
    reconstruction?.purpose_scope?.population_scope?.value,
  ].filter(Boolean).join(" ").toLowerCase();
}

export function selectProjectIcon(reconstruction) {
  const source = iconSource(reconstruction);
  if (/housing|property|assessor|building|parcel|residential/.test(source)) return "housing";
  if (/road|crash|traffic|transport|street|highway/.test(source)) return "road";
  if (/\b311\b|service request|public service|municipal service|complaint resolution|call volume/.test(source)) return "public_service";
  if (/health|osha|ppe|disease|medical|hospital|clinical/.test(source)) return "health";
  if (/business|naics|establishment|company/.test(source)) return "business";
  return "analysis";
}

export const PROJECT_ICON_LABELS = Object.freeze({
  housing: "Housing and property project",
  road: "Road and transport project",
  public_service: "Public-service request project",
  health: "Health project",
  business: "Business classification project",
  analysis: "Analytics project",
});
