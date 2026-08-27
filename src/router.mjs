const PROJECT_PATH = /^\/projects\/([^/]+)(?:\/(findings|history))?\/?$/;
export const ROUTE_CHANGE_EVENT = "boveda:route-change";

function notFoundRoute() {
  return { screen: "projects", projectId: null, activeView: "overview", notFound: true };
}

export function parseRoute(pathname = "/") {
  const path = pathname || "/";
  if (path === "/" || path === "/index.html") return { screen: "welcome", projectId: null, activeView: "overview" };
  if (path === "/how-it-works" || path === "/how-it-works/") return { screen: "how-it-works", projectId: null, activeView: "overview" };
  if (path === "/projects" || path === "/projects/") return { screen: "projects", projectId: null, activeView: "overview" };
  const match = path.match(PROJECT_PATH);
  if (!match) return notFoundRoute();
  try {
    const projectId = decodeURIComponent(match[1]);
    if (!projectId || projectId.includes("/")) return notFoundRoute();
    return { screen: "project", projectId, activeView: match[2] === "findings" ? "signals" : match[2] || "overview" };
  } catch {
    return notFoundRoute();
  }
}

export function routeFor(route) {
  if (route?.screen === "how-it-works") return "/how-it-works";
  if (route?.screen === "projects") return "/projects";
  if (route?.screen === "project" && route.projectId) {
    const suffix = route.activeView === "signals" ? "/findings" : route.activeView === "history" ? "/history" : "";
    return `/projects/${encodeURIComponent(route.projectId)}${suffix}`;
  }
  return "/";
}

export function navigateRoute(route, { replace = false } = {}) {
  const path = routeFor(route);
  const method = replace ? "replaceState" : "pushState";
  window.history[method]({}, "", path);
  window.dispatchEvent(new Event(ROUTE_CHANGE_EVENT));
  return path;
}
