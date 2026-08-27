function clamp(value) {
  return Math.max(0, Math.min(1, value));
}

export function relativeMagnitude(value, values) {
  const finite = (values || []).filter(Number.isFinite);
  if (!Number.isFinite(value) || !finite.length) return null;
  const minimum = Math.min(...finite);
  const maximum = Math.max(...finite);
  if (maximum === minimum) return 0.55;
  return clamp((value - minimum) / (maximum - minimum));
}

export function magnitudeHeat(value, values) {
  const strength = relativeMagnitude(value, values);
  if (strength === null) return null;
  const ranked = [...new Set((values || []).filter(Number.isFinite))].sort((a, b) => b - a);
  const rank = ranked.indexOf(value);
  const color = rank <= 1 ? "#65e99c" : rank <= 3 ? "#58ddd9" : "#ffc95a";
  return { strength, color, semantics: "relative_magnitude" };
}

export function metricHeat(value, values, direction) {
  if (!["higher", "lower"].includes(direction)) return null;
  const relative = relativeMagnitude(value, values);
  if (relative === null) return null;
  const strength = direction === "lower" ? 1 - relative : relative;
  const hue = 7 + (strength * 96);
  const lightness = 88 - (strength * 17);
  return { strength, color: `hsl(${hue.toFixed(1)} 67% ${lightness.toFixed(1)}%)`, semantics: "direction_of_better" };
}

export function matrixMagnitudeHeat(value, values) {
  const strength = relativeMagnitude(value, values);
  if (strength === null) return null;
  return { strength, color: `hsl(211 48% ${(96 - (strength * 29)).toFixed(1)}%)`, semantics: "raw_magnitude_only" };
}

export function conciseContextLabel(value) {
  let label = String(value || "Context not established").trim();
  const match = label.match(/^([^:]{1,90}):\s*(.+)$/);
  if (match && /\b(?:predictive\s+(?:model(?:l?ing)?|comparison)|model(?:l?ing)?|classification|forecast(?:ing)?|clustering|scenario\s+analysis|prediction)\b/i.test(match[1])) label = match[2].trim();
  label = label
    .replace(/^benchmark\s+model\s+for\s+(.+)$/i, (_whole, target) => `${target} benchmark`)
    .replace(/^(?:let['’]?s\s+)?predict\s+the\s+(.+?)\s+for\s+(.+?)\s+in\s+(.+?)(?:\s+given\s+.+)?$/i, (_whole, outcome, subject, place) => `${outcome} — ${subject}, ${place}`)
    .replace(/\s+given\s+(?:the\s+)?[^,;]+\s+data\s*$/i, "")
    .trim();
  label = label ? `${label[0].toUpperCase()}${label.slice(1)}` : "Analytical context";
  return label.length > 62 ? `${label.slice(0, 59).trimEnd()}…` : label;
}

export function featureContextLabel(feature) {
  const target = feature?.target_name || conciseContextLabel(feature?.workstream);
  const method = feature?.method || "Method unresolved";
  const variant = String(feature?.estimator_variant || "variant unresolved").replaceAll("_", " ");
  return `${target} · ${method} · ${variant}`;
}

function usableLabel(value) {
  const label = String(value || "").trim();
  return label && !/^(?:unknown|unresolved|not established|n\/?a)$/i.test(label) ? label : null;
}

function readableTarget(value) {
  return usableLabel(value?.target_name)
    || usableLabel(value?.display_label)
    || conciseContextLabel(value?.workstream || value?.target);
}

export function featureStandoutSummary(features) {
  const ranked = (features || [])
    .filter((item) => Number.isFinite(item?.value))
    .toSorted((left, right) => right.value - left.value);
  if (!ranked.length) {
    const used = [...new Set((features || []).filter((item) => item?.evidence_type === "feature_usage").map((item) => usableLabel(item.display_label || item.feature)).filter(Boolean))];
    if (used.length) {
      const listed = new Intl.ListFormat("en", { style: "long", type: "conjunction" }).format(used.slice(0, 4));
      const remainder = used.length > 4 ? ` and ${used.length - 4} additional recorded ${used.length - 4 === 1 ? "input" : "inputs"}` : "";
      return `The recorded model input contains ${listed}${remainder}. The evidence establishes that these fields were used, but it does not provide a relative-importance ranking or establish causality.`;
    }
    return "The displayed model does not contain enough recorded feature-importance information for a project-specific summary.";
  }
  const target = readableTarget(ranked[0]);
  const model = usableLabel(ranked[0].method) || "displayed";
  const labels = [...new Set(ranked.map((item) => usableLabel(item.display_label || item.feature)).filter(Boolean))];
  if (labels.length >= 2) return `For ${target}, the displayed ${model} model relies most on ${labels[0]} (${summaryValue(ranked[0].value)}) and ${labels[1]} (${summaryValue(ranked[1].value)}). These are the two highest recorded importance values in this displayed context; the ranking describes model reliance, not whether either input drives the outcome.`;
  if (labels.length === 1) return `For ${target}, ${labels[0]} (${summaryValue(ranked[0].value)}) is the strongest recorded feature-importance value for the displayed ${model} model. This describes the model's relative reliance within the displayed context, not whether the input drives the outcome.`;
  return "The displayed model shows a concentrated set of higher-importance inputs followed by a longer group of lower-importance features. The ordering describes relative model reliance within this context and does not establish how changing an input would change the outcome.";
}

function comparisonLeaders(set) {
  const methods = set?.methods || [];
  const results = set?.results || [];
  return (set?.metrics || []).flatMap((metric) => {
    const direction = metric.direction_of_better || metric.direction;
    if (!["higher", "lower"].includes(direction)) return [];
    const values = methods.map((method) => ({ method, value: results.find((item) => item.method === method && item.metric === metric.key)?.value })).filter((item) => Number.isFinite(item.value));
    if (!values.length) return [];
    const best = direction === "lower" ? Math.min(...values.map((item) => item.value)) : Math.max(...values.map((item) => item.value));
    const leaders = values.filter((item) => Math.abs(item.value - best) < 1e-12).map((item) => item.method);
    return [{ metric, best, leaders, comparableCount: values.length }];
  });
}

function summaryValue(value) {
  if (!Number.isFinite(value)) return "–";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 4, useGrouping: false }).format(value);
}

export function modelComparisonStandoutSummary(set, { focalMetric } = {}) {
  const target = readableTarget(set || {});
  const leaders = comparisonLeaders(set).filter((item) => item.comparableCount >= 2);
  if (!leaders.length) return `The available results for ${target} do not contain enough direction-resolved, comparable metrics for a model-level summary.`;
  const uniqueLeaders = leaders.filter((item) => item.leaders.length === 1);
  const tied = leaders.find((item) => item.leaders.length > 1);
  if (tied) {
    const joined = new Intl.ListFormat("en", { style: "long", type: "conjunction" }).format(tied.leaders);
    return `${joined} share the strongest recorded ${tied.metric.label} (${summaryValue(tied.best)}). No single model leads across every available metric for ${target}; each row must be read within its own metric because the scales and meanings differ.`;
  }
  const allLeader = uniqueLeaders[0]?.leaders[0];
  if (allLeader && uniqueLeaders.length === leaders.length && uniqueLeaders.every((item) => item.leaders[0] === allLeader)) {
    return `${allLeader} records the strongest value across all ${leaders.length} comparable metrics shown for ${target}. The comparison is still row-specific: the values describe different evaluation measures and should not be compared vertically as though they shared one scale.`;
  }
  const focal = uniqueLeaders.find((item) => item.metric.key === focalMetric || item.metric.label === focalMetric);
  if (focal) return `${focal.leaders[0]} has the strongest recorded ${focal.metric.label} (${summaryValue(focal.best)}) for ${target}. Performance differs across the other available metrics, so the displayed evidence does not support treating one model as the overall leader without choosing which evaluation measure matters.`;
  const first = uniqueLeaders[0];
  const second = uniqueLeaders.find((item) => item.leaders[0] !== first?.leaders[0]);
  if (first && second) return `${first.leaders[0]} records the strongest ${first.metric.label} (${summaryValue(first.best)}), while ${second.leaders[0]} leads on ${second.metric.label} (${summaryValue(second.best)}). No single model leads across every available metric, and the rows should be interpreted separately because they measure different aspects of performance.`;
  if (first) return `${first.leaders[0]} has the strongest recorded ${first.metric.label} (${summaryValue(first.best)}) for ${target}. Performance differs across the other available metrics, so the evidence does not identify one overall leader without first choosing a decision-relevant measure.`;
  return `No single model has the strongest recorded value across all available comparable metrics for ${target}. The rows measure different aspects of performance and should be interpreted separately rather than combined into an unstated overall ranking.`;
}

export function evaluationStandoutSummary(diagnostic) {
  const multiclass = diagnostic?.type === "confusion_matrix"
    && diagnostic.normalized
    && diagnostic.orientation?.rows === "actual"
    && diagnostic.orientation?.columns === "predicted"
    && diagnostic.values?.length > 2
    && diagnostic.values.every((row) => row.length === diagnostic.values.length && row.every(Number.isFinite));
  if (multiclass) {
    const labels = diagnostic.labels || diagnostic.orientation.class_labels || diagnostic.values.map((_row, index) => `class ${index + 1}`);
    const recall = diagnostic.values.map((row, index) => ({ label: labels[index] || `class ${index + 1}`, value: row[index], row, index })).sort((a, b) => a.value - b.value);
    const weakest = recall[0];
    const strongest = recall.at(-1);
    const mainConfusion = weakest.row.map((value, index) => ({ value, index })).filter((item) => item.index !== weakest.index).sort((a, b) => b.value - a.value)[0];
    return `${diagnostic.method || "The displayed model"} correctly classifies ${(weakest.value * 100).toFixed(1)}% of actual ${weakest.label} observations, compared with ${(strongest.value * 100).toFixed(1)}% for ${strongest.label}. Its most common error for ${weakest.label} is assignment to ${labels[mainConfusion.index] || `class ${mainConfusion.index + 1}`} (${(mainConfusion.value * 100).toFixed(1)}%).`;
  }
  const oriented = diagnostic?.type === "confusion_matrix"
    && diagnostic.orientation?.rows === "actual"
    && diagnostic.orientation?.columns === "predicted"
    && [diagnostic.tn, diagnostic.fp, diagnostic.fn, diagnostic.tp].every(Number.isFinite);
  if (!oriented) return null;
  const target = readableTarget(diagnostic);
  const model = usableLabel(diagnostic.method) || "The displayed model";
  const actualPositive = diagnostic.tp + diagnostic.fn;
  const actualNegative = diagnostic.tn + diagnostic.fp;
  if (diagnostic.tp === 0 && diagnostic.fp === 0) return `For ${target}, ${model} does not identify any of the ${actualPositive} positive cases in this evaluation. It classifies every case as negative, correctly excluding ${diagnostic.tn} of ${actualNegative} negative cases while missing all recorded positives in the displayed sample.`;
  return `For ${target}, ${model} correctly identifies ${diagnostic.tp} of ${actualPositive} positive cases and misses ${diagnostic.fn}. It also correctly excludes ${diagnostic.tn} of ${actualNegative} negative cases while flagging ${diagnostic.fp} negatives as positive, describing the full error balance in this displayed evaluation sample.`;
}

function edgePath(source, target, nodeWidth, nodeHeight) {
  if (Math.abs(target.y - source.y) > nodeHeight * 1.25) {
    const startX = source.x + nodeWidth / 2;
    const startY = source.y + nodeHeight;
    const endX = target.x + nodeWidth / 2;
    const endY = target.y;
    const middleY = (startY + endY) / 2;
    return { d: `M ${startX} ${startY} C ${startX} ${middleY}, ${endX} ${middleY}, ${endX} ${endY}`, labelX: (startX + endX) / 2, labelY: middleY - 5 };
  }
  const forward = target.x >= source.x;
  const startX = forward ? source.x + nodeWidth : source.x;
  const endX = forward ? target.x : target.x + nodeWidth;
  const startY = source.y + nodeHeight / 2;
  const endY = target.y + nodeHeight / 2;
  const middleX = (startX + endX) / 2;
  return { d: `M ${startX} ${startY} C ${middleX} ${startY}, ${middleX} ${endY}, ${endX} ${endY}`, labelX: middleX, labelY: (startY + endY) / 2 - 5 };
}

function verticalEdgePath(source, target, nodeWidth, nodeHeight, relation) {
  const startX = source.x + nodeWidth / 2;
  const startY = source.y + nodeHeight;
  const endX = target.x + nodeWidth / 2;
  const endY = target.y;
  const middleY = (startY + endY) / 2;
  const label = String(relation || "");
  const labelWidth = Math.max(62, Math.min(146, 25 + label.length * 5.6));
  const labelX = endX;
  const labelY = middleY;
  const chipTop = labelY - 11;
  const chipBottom = labelY + 11;
  return {
    d: `M ${startX} ${startY} C ${startX} ${middleY}, ${endX} ${middleY}, ${endX} ${endY}`,
    beforeD: `M ${startX} ${startY} C ${startX} ${chipTop - 8}, ${endX} ${chipTop - 8}, ${endX} ${chipTop}`,
    afterD: `M ${endX} ${chipBottom} L ${endX} ${endY}`,
    labelX,
    labelY,
    labelWidth,
  };
}

function verticalLineageLayout(nodes, edges) {
  const nodeWidth = 158;
  const nodeHeight = 76;
  const horizontalGap = 12;
  const verticalGap = 60;
  const padding = 18;
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const validEdges = edges.filter((edge) => byId.has(edge.from) && byId.has(edge.to));

  if (!validEdges.length && nodes.length) {
    const positionedNodes = nodes.map((node, index) => ({ ...node, depth: index, x: padding, y: padding + index * (nodeHeight + verticalGap) }));
    return {
      width: 539,
      height: Math.max(248, padding * 2 + nodes.length * nodeHeight + Math.max(0, nodes.length - 1) * verticalGap),
      nodeWidth,
      nodeHeight,
      nodes: positionedNodes,
      edges: [],
    };
  }

  const indegree = new Map(nodes.map((node) => [node.id, 0]));
  const outgoing = new Map(nodes.map((node) => [node.id, []]));
  for (const edge of validEdges) {
    indegree.set(edge.to, indegree.get(edge.to) + 1);
    outgoing.get(edge.from).push(edge);
  }
  const depth = new Map();
  const queue = nodes.filter((node) => indegree.get(node.id) === 0).map((node) => node.id);
  if (!queue.length && nodes.length) queue.push(nodes[0].id);
  for (const id of queue) depth.set(id, 0);
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    for (const edge of outgoing.get(current) || []) {
      depth.set(edge.to, Math.max(depth.get(edge.to) || 0, (depth.get(current) || 0) + 1));
      indegree.set(edge.to, indegree.get(edge.to) - 1);
      if (indegree.get(edge.to) === 0) queue.push(edge.to);
    }
  }
  for (const node of nodes) if (!depth.has(node.id)) depth.set(node.id, 0);

  const levels = new Map();
  for (const node of nodes) {
    const level = depth.get(node.id);
    if (!levels.has(level)) levels.set(level, []);
    levels.get(level).push(node);
  }
  const maximumDepth = Math.max(0, ...levels.keys());
  const maximumWidth = Math.max(1, ...[...levels.values()].map((items) => items.length));
  const graphWidth = Math.max(539, padding * 2 + maximumWidth * nodeWidth + Math.max(0, maximumWidth - 1) * horizontalGap);
  const positionedNodes = [];
  for (const [level, levelNodes] of [...levels.entries()].sort((a, b) => a[0] - b[0])) {
    const occupiedWidth = levelNodes.length * nodeWidth + Math.max(0, levelNodes.length - 1) * horizontalGap;
    const startX = (graphWidth - occupiedWidth) / 2;
    levelNodes.forEach((node, column) => positionedNodes.push({ ...node, depth: level, x: startX + column * (nodeWidth + horizontalGap), y: padding + level * (nodeHeight + verticalGap) }));
  }
  const positionedById = new Map(positionedNodes.map((node) => [node.id, node]));
  return {
    width: graphWidth,
    height: Math.max(248, padding * 2 + (maximumDepth + 1) * nodeHeight + maximumDepth * verticalGap),
    nodeWidth,
    nodeHeight,
    nodes: positionedNodes,
    edges: validEdges.map((edge) => ({ ...edge, ...verticalEdgePath(positionedById.get(edge.from), positionedById.get(edge.to), nodeWidth, nodeHeight, edge.relation) })),
  };
}

export function layoutLineageGraph({ nodes = [], edges = [] } = {}, { orientation = "horizontal" } = {}) {
  if (orientation === "vertical") return verticalLineageLayout(nodes, edges);
  const nodeWidth = 126;
  const nodeHeight = 62;
  const horizontalGap = 34;
  const verticalGap = 22;
  const padding = 16;
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const validEdges = edges.filter((edge) => byId.has(edge.from) && byId.has(edge.to));
  if (!validEdges.length && nodes.length) {
    const columnCount = Math.min(4, nodes.length);
    const rowCount = Math.ceil(nodes.length / columnCount);
    const positionedNodes = nodes.map((node, index) => ({
      ...node,
      depth: 0,
      x: padding + (index % columnCount) * (nodeWidth + horizontalGap),
      y: padding + Math.floor(index / columnCount) * (nodeHeight + verticalGap),
    }));
    return {
      width: (padding * 2) + (columnCount * nodeWidth) + (Math.max(0, columnCount - 1) * horizontalGap),
      height: Math.max(128, (padding * 2) + (rowCount * nodeHeight) + (Math.max(0, rowCount - 1) * verticalGap)),
      nodeWidth,
      nodeHeight,
      nodes: positionedNodes,
      edges: [],
    };
  }
  const indegree = new Map(nodes.map((node) => [node.id, 0]));
  const outgoing = new Map(nodes.map((node) => [node.id, []]));
  for (const edge of validEdges) {
    indegree.set(edge.to, indegree.get(edge.to) + 1);
    outgoing.get(edge.from).push(edge);
  }

  const depth = new Map();
  const queue = nodes.filter((node) => indegree.get(node.id) === 0).map((node) => node.id);
  if (!queue.length && nodes.length) queue.push(nodes[0].id);
  for (const id of queue) depth.set(id, 0);
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    for (const edge of outgoing.get(current) || []) {
      depth.set(edge.to, Math.max(depth.get(edge.to) || 0, (depth.get(current) || 0) + 1));
      indegree.set(edge.to, indegree.get(edge.to) - 1);
      if (indegree.get(edge.to) === 0) queue.push(edge.to);
    }
  }
  for (const node of nodes) if (!depth.has(node.id)) depth.set(node.id, 0);

  const depths = new Map();
  for (const node of nodes) {
    const level = depth.get(node.id);
    if (!depths.has(level)) depths.set(level, []);
    depths.get(level).push(node);
  }
  const maximumDepth = Math.max(0, ...depths.keys());
  const columnCount = Math.min(4, maximumDepth + 1);
  const bandCount = Math.ceil((maximumDepth + 1) / columnCount);
  const bandOffsets = [];
  let offset = padding;
  for (let band = 0; band < bandCount; band += 1) {
    const firstDepth = band * columnCount;
    const rowCount = Math.max(1, ...Array.from({ length: columnCount }, (_, index) => depths.get(firstDepth + index)?.length || 0));
    bandOffsets.push({ offset, rowCount });
    offset += (rowCount * nodeHeight) + ((rowCount - 1) * verticalGap) + 62;
  }

  const positionedNodes = [];
  for (const [level, levelNodes] of [...depths.entries()].sort((a, b) => a[0] - b[0])) {
    const band = Math.floor(level / columnCount);
    const withinBand = level % columnCount;
    const column = band % 2 === 0 ? withinBand : columnCount - 1 - withinBand;
    const bandInfo = bandOffsets[band];
    const occupiedHeight = (levelNodes.length * nodeHeight) + ((levelNodes.length - 1) * verticalGap);
    const availableHeight = (bandInfo.rowCount * nodeHeight) + ((bandInfo.rowCount - 1) * verticalGap);
    const startY = bandInfo.offset + ((availableHeight - occupiedHeight) / 2);
    levelNodes.forEach((node, row) => positionedNodes.push({ ...node, depth: level, x: padding + column * (nodeWidth + horizontalGap), y: startY + row * (nodeHeight + verticalGap) }));
  }

  const positionedById = new Map(positionedNodes.map((node) => [node.id, node]));
  const positionedEdges = validEdges.map((edge) => ({ ...edge, ...edgePath(positionedById.get(edge.from), positionedById.get(edge.to), nodeWidth, nodeHeight) }));
  return {
    width: (padding * 2) + (columnCount * nodeWidth) + (Math.max(0, columnCount - 1) * horizontalGap),
    height: Math.max(128, offset - 38),
    nodeWidth,
    nodeHeight,
    nodes: positionedNodes,
    edges: positionedEdges,
  };
}
