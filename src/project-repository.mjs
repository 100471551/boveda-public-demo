import { rootFolderName } from "./project-display.mjs";

// Repository destinations are keyed by the stable imported project identity,
// never by a machine-local path or generated project id.
const PROJECT_REPOSITORIES = new Map([
  ["R1_public-health_housing-chelsea", {
    href: "https://github.com/nsdiaz/chelsea-code-violations-and-public-health",
    label: "Open Chelsea public health project repository chelsea-code-violations-and-public-health on GitHub",
  }],
  ["R2_public-safety_road-crash-risk", {
    href: "https://github.com/insight-lane/crash-model",
    label: "Open road crash risk project repository crash-model on GitHub",
  }],
  ["R3_public-services_nyc-311-resolution", {
    href: "https://github.com/ayush159/NYC-311",
    label: "Open NYC 311 resolution project repository NYC-311 on GitHub",
  }],
]);

export function projectRepository(sourcePath) {
  return PROJECT_REPOSITORIES.get(rootFolderName(sourcePath)) || null;
}
