import crypto from "node:crypto";

function stableId(prefix, value) {
  return `${prefix}-${crypto.createHash("sha256").update(String(value)).digest("hex").slice(0, 10).toUpperCase()}`;
}

function outputText(cell) {
  return (cell.outputs || []).filter((item) => item.type === "text").map((item) => item.text || "").join("\n");
}

function clean(value) {
  return String(value ?? "").replace(/^\s*#+\s*/, "").replace(/[*_`]/g, "").replace(/\s+/g, " ").trim();
}

function rawTrim(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function words(value) {
  return new Set(clean(value).toLowerCase().replace(/elevated/g, "high").replace(/violations/g, "violation").replace(/[^a-z0-9]+/g, " ").split(" ").filter((item) => item.length > 2));
}

function overlap(first, second) {
  const left = words(first);
  const right = words(second);
  if (!left.size || !right.size) return 0;
  return [...left].filter((item) => right.has(item)).length / Math.max(left.size, right.size);
}

function humanize(value) {
  const label = clean(value)
    .replace(/^(?:predictive\s+(?:model(?:l?ing)?|comparison)|model(?:l?ing)?|classification|prediction|forecasting)\s*:\s*/i, "")
    .replaceAll("_", " ")
    .trim();
  return label ? `${label[0].toUpperCase()}${label.slice(1)}` : "Analytical target";
}

function methodName(value) {
  const raw = clean(value).replace(/^.*\./, "");
  const key = raw.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (/randomforest|^rf/.test(key)) return "Random Forest";
  if (/xgboost|xgb|^xg/.test(key)) return "XGBoost";
  if (/lasso/.test(key)) return "Lasso regression";
  if (/logistic/.test(key)) return "Logistic Regression";
  if (/decisiontree/.test(key)) return "Decision Tree";
  return raw || "Method not established";
}

function numeric(value) {
  const parsed = Number(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function cellNumber(locator) {
  return numeric(String(locator || "").match(/#cell-(\d+)$/)?.[1]) ?? -1;
}

function streamIdentity(cell, source) {
  const name = clean(cell.workstream || source.path);
  return { id: stableId("AWS", `${source.path}|${name}`), name, display: humanize(name) };
}

function allCells(sources) {
  return sources.flatMap((source) => (source.cells || []).map((cell) => ({ source, cell })));
}

function quotedFields(value) {
  return [...String(value || "").matchAll(/["']([^"']+)["']/g)].map((match) => match[1]);
}

function parseLiteral(value) {
  const raw = String(value ?? "").trim();
  if (/^(?:True|False)$/i.test(raw)) return /^true$/i.test(raw);
  if (/^(?:None|null)$/i.test(raw)) return null;
  if (/^["'].*["']$/s.test(raw)) return raw.slice(1, -1);
  const number = numeric(raw);
  return number === null ? { expression: raw } : number;
}

function topLevelParts(value) {
  const parts = [];
  let start = 0;
  let depth = 0;
  let quote = null;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (quote) {
      if (character === quote && value[index - 1] !== "\\") quote = null;
      continue;
    }
    if (character === "'" || character === '"') { quote = character; continue; }
    if ("([{“".includes(character)) depth += 1;
    if (")]}”".includes(character)) depth -= 1;
    if (character === "," && depth === 0) { parts.push(value.slice(start, index).trim()); start = index + 1; }
  }
  parts.push(value.slice(start).trim());
  return parts.filter(Boolean);
}

function balancedCall(source, start) {
  const open = source.indexOf("(", start);
  if (open < 0) return null;
  let depth = 0;
  let quote = null;
  for (let index = open; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (character === quote && source[index - 1] !== "\\") quote = null;
      continue;
    }
    if (character === "'" || character === '"') { quote = character; continue; }
    if (character === "(") depth += 1;
    if (character === ")") depth -= 1;
    if (depth === 0) return { arguments: source.slice(open + 1, index), end: index + 1 };
  }
  return null;
}

function constructorCalls(source) {
  const calls = [];
  const pattern = /^\s*([A-Za-z_]\w*)\s*=\s*(?:[A-Za-z_]\w*\.)?((?:[A-Za-z_]\w*(?:Classifier|Regressor|Regression|Forest)|Lasso))\s*\(/gm;
  for (const match of source.matchAll(pattern)) {
    const call = balancedCall(source, match.index + match[0].lastIndexOf("("));
    if (!call) continue;
    const parameters = {};
    for (const part of topLevelParts(call.arguments)) {
      const assignment = part.match(/^([A-Za-z_]\w*)\s*=\s*([\s\S]+)$/);
      if (assignment) parameters[assignment[1]] = parseLiteral(assignment[2]);
    }
    calls.push({ variable: match[1], estimator_class: match[2], method: methodName(match[2]), parameters, raw_parameters: call.arguments.trim() });
  }
  return calls;
}

function targetBindings(sources) {
  const bindings = [];
  for (const source of sources) for (const cell of source.cells || []) {
    for (const line of String(cell.source || "").split(/\r?\n/).filter((value) => /\by_(?:train|test)\s*=/.test(value))) {
      const fields = quotedFields(line);
      const field = fields.at(-1);
      if (!field) continue;
      const stream = streamIdentity(cell, source);
      const key = `${source.path}|${field}`;
      if (!bindings.some((item) => item.key === key)) bindings.push({ key, source_path: source.path, field, stream, evidence_ids: [cell.evidence_id], locators: [cell.locator] });
      else {
        const item = bindings.find((entry) => entry.key === key);
        item.evidence_ids = [...new Set([...item.evidence_ids, cell.evidence_id])];
        item.locators.push(cell.locator);
      }
    }
  }
  return bindings;
}

function constructionOperation(expression, { componentGroup = false, mutation = null } = {}) {
  if (componentGroup) return "component_group";
  if (mutation === "fill" || /\.fillna\s*\(/i.test(expression)) return "fill";
  if (/\.map\s*\(/i.test(expression)) return "map";
  if (/\.astype\s*\(/i.test(expression)) return "cast";
  if (/(?:\.mask|\bwhere)\s*\(/i.test(expression) && /(?:>=|<=|>|<|==|!=)/.test(expression)) return "threshold_mask";
  if (/\.sum\s*\(/i.test(expression)) return "aggregation_sum";
  if (/\b(?:and|or)\b|[&|]/i.test(expression)) return "logical_combination";
  if (/(?:>=|<=|>|<|==|!=)/.test(expression)) return "boolean_comparison";
  if (/[+*/-]/.test(expression) && !/^\s*[A-Za-z_]\w*(?:\.[A-Za-z_]\w*|\[[^\]]+\])?\s*$/.test(expression)) return "arithmetic_transform";
  return "assignment";
}

function constructionParameters(expression, operationType, components = []) {
  const parameters = {};
  const comparison = expression.match(/(>=|<=|>|<|==|!=)\s*(-?\d+(?:\.\d+)?)/);
  if (comparison) { parameters.comparison_operator = comparison[1]; parameters.threshold = numeric(comparison[2]); }
  if (operationType === "component_group") parameters.components = components;
  if (operationType === "aggregation_sum") {
    parameters.aggregation = "sum";
    const axis = expression.match(/axis\s*=\s*(-?\d+)/)?.[1];
    if (axis !== undefined) parameters.axis = numeric(axis);
  }
  if (operationType === "fill") {
    const fill = expression.match(/\.fillna\s*\(\s*([^,)]+)/i)?.[1];
    if (fill !== undefined) parameters.fill_value = parseLiteral(fill);
    if (/inplace\s*=\s*True/i.test(expression)) parameters.inplace = true;
  }
  if (operationType === "map") {
    const mapping = expression.match(/\.map\s*\(\s*([^\n)]+)/i)?.[1];
    if (mapping) parameters.mapping = parseLiteral(mapping);
  }
  if (operationType === "cast") {
    const cast = expression.match(/\.astype\s*\(\s*([^\n)]+)/i)?.[1];
    if (cast) parameters.cast_type = parseLiteral(cast);
  }
  if (operationType === "threshold_mask") {
    const replacement = expression.match(/(?:\.mask|\bwhere)\s*\([^,]+,\s*([^,)]+)/i)?.[1];
    if (replacement !== undefined) parameters.replacement_value = parseLiteral(replacement);
  }
  return parameters;
}

function constructionInputs(expression, lists, output) {
  const referenced = [...expression.matchAll(/\[\s*["']([^"']+)["']\s*\]/g)].map((match) => match[1]);
  const listReference = expression.match(/\[\s*([A-Za-z_]\w*)\s*\]\s*\.(?:sum|any|all)\s*\(/)?.[1];
  const excludedAttributes = new Set(["all", "any", "astype", "fillna", "map", "mask", "sum", "where"]);
  const attributeReferences = [...expression.matchAll(/\.([A-Za-z_]\w*)\b/g)].map((match) => match[1]).filter((value) => !excludedAttributes.has(value));
  const withoutQuotedLiterals = expression.replace(/["'][^"']*["']/g, " ");
  const bareReferences = [...withoutQuotedLiterals.matchAll(/\b([A-Za-z_]\w*)\b/g)].map((match) => match[1]).filter((value) => {
    if (value === output || /^(?:True|False|None|and|or|not|axis|inplace|np|pd)$/i.test(value)) return false;
    if (new RegExp(`\\b${value}\\s*(?:\\[|\\.(?!fillna|map|astype|mask|sum|where))`).test(expression)) return false;
    if (new RegExp(`\\b${value}\\s*\\(`).test(expression)) return false;
    return !/^\d/.test(value);
  });
  return [...new Set([...(listReference ? [listReference] : []), ...referenced, ...attributeReferences, ...bareReferences])].filter((value) => value !== output);
}

function constructionInputTypes(expression, listReference, inputs) {
  const quoted = new Set([...expression.matchAll(/\[\s*["']([^"']+)["']\s*\]/g)].map((match) => match[1]));
  const attributes = new Set([...expression.matchAll(/\.([A-Za-z_]\w*)\b/g)].map((match) => match[1]));
  return Object.fromEntries(inputs.map((input) => [input, input === listReference ? "component_group_reference" : quoted.has(input) || attributes.has(input) ? "field_reference" : "variable_reference"]));
}

function constructionEvidence(sources) {
  const steps = [];
  for (const source of sources) {
    const lists = new Map();
    for (const cell of source.cells || []) {
      const lines = String(cell.source || "").split(/\r?\n/);
      for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
        const line = lines[lineIndex];
        const list = line.match(/^\s*([A-Za-z_]\w*)\s*=\s*\[([\s\S]*?)\]\s*$/);
        if (list) {
          const components = quotedFields(list[2]);
          lists.set(list[1], components);
          if (components.length) steps.push({
            id: stableId("ATCS", `${source.path}|${cell.locator}|${list[1]}|${line.trim()}`),
            operation_type: "component_group", operations: ["component_group"], inputs: components, input_reference_types: Object.fromEntries(components.map((component) => [component, "source_field_reference"])), output: list[1], expression: line.trim(), parameters: constructionParameters(line, "component_group", components),
            source_path: source.path, source_locator: cell.locator, source_line: lineIndex + 1, execution_count: cell.execution_count,
            epistemic: "OBSERVED", state: "established", evidence_ids: [cell.evidence_id],
          });
          continue;
        }
        const mutation = line.match(/^\s*(?:[A-Za-z_]\w*\[\s*["']([^"']+)["']\s*\]|[A-Za-z_]\w*\.([A-Za-z_]\w*))\.fillna\s*\(([\s\S]+)\)\s*$/);
        if (mutation) {
          const output = mutation[1] || mutation[2];
          const expression = `${output}.fillna(${mutation[3]})`;
          steps.push({
            id: stableId("ATCS", `${source.path}|${cell.locator}|${output}|${line.trim()}`),
            operation_type: "fill", operations: ["fill"], inputs: [output], input_reference_types: { [output]: "field_reference" }, output, expression, parameters: constructionParameters(expression, "fill"),
            source_path: source.path, source_locator: cell.locator, source_line: lineIndex + 1, execution_count: cell.execution_count,
            epistemic: "OBSERVED", state: "established", evidence_ids: [cell.evidence_id],
          });
          continue;
        }
        const fieldAssignment = line.match(/^\s*(?:[A-Za-z_]\w*\[\s*["']([^"']+)["']\s*\]|[A-Za-z_]\w*\.([A-Za-z_]\w*))\s*=\s*([\s\S]+)$/);
        const bareAssignment = !fieldAssignment && line.match(/^\s*([A-Za-z_]\w*)\s*=\s*([\s\S]+)$/);
        if (!fieldAssignment && !bareAssignment) continue;
        const output = fieldAssignment ? fieldAssignment[1] || fieldAssignment[2] : bareAssignment[1];
        const expression = (fieldAssignment ? fieldAssignment[3] : bareAssignment[2]).trim();
        if (!expression || /^\[.*\]$/.test(expression)) continue;
        const listReference = expression.match(/\[\s*([A-Za-z_]\w*)\s*\]\s*\.(?:sum|any|all)\s*\(/)?.[1];
        const inputs = [...new Set([...(listReference ? [listReference] : []), ...constructionInputs(expression, lists, output)])];
        const operationType = constructionOperation(expression);
        const operations = operationType === "threshold_mask" ? ["boolean_comparison", "threshold", "mask", "derived_binary_indicator"] : [operationType];
        steps.push({
          id: stableId("ATCS", `${source.path}|${cell.locator}|${output}|${expression}`),
          operation_type: operationType, operations, inputs, input_reference_types: constructionInputTypes(expression, listReference, inputs), output, expression, parameters: constructionParameters(expression, operationType),
          source_path: source.path, source_locator: cell.locator, source_line: lineIndex + 1, execution_count: cell.execution_count,
          epistemic: "OBSERVED", state: "established", evidence_ids: [cell.evidence_id],
        });
      }
    }
  }
  return steps.filter((step, index, all) => all.findIndex((other) => other.id === step.id) === index);
}

function compatibleProducer(producer, consumer) {
  if (producer.source_path !== consumer.source_path || producer.id === consumer.id) return false;
  if (producer.source_locator === consumer.source_locator) return producer.source_line < consumer.source_line;
  return Number.isInteger(producer.execution_count) && Number.isInteger(consumer.execution_count) && producer.execution_count < consumer.execution_count;
}

function selectProducer(input, consumer, steps) {
  const candidates = steps.filter((step) => step.output === input && compatibleProducer(step, consumer));
  if (!candidates.length) return { producer: null, ambiguous: false };
  const ordered = candidates.sort((a, b) => (b.execution_count ?? -1) - (a.execution_count ?? -1) || cellNumber(b.source_locator) - cellNumber(a.source_locator) || b.source_line - a.source_line);
  const first = ordered[0];
  const equallyCurrent = ordered.filter((item) => item.execution_count === first.execution_count && item.source_locator !== first.source_locator);
  return { producer: first, ambiguous: equallyCurrent.length > 0 };
}

function selectConstructionRoot(field, binding, steps) {
  const candidates = steps.filter((step) => step.output === field);
  const sameSource = candidates.filter((step) => step.source_path === binding.source_path);
  const pool = sameSource.length ? sameSource : candidates;
  if (!pool.length) return { root: null, ambiguous: false };
  const ordered = pool.sort((a, b) => (b.execution_count ?? -1) - (a.execution_count ?? -1) || cellNumber(b.source_locator) - cellNumber(a.source_locator) || b.source_line - a.source_line);
  if (sameSource.length || pool.length === 1) return { root: ordered[0], ambiguous: ordered.length > 1 && ordered[0].execution_count === ordered[1].execution_count };
  const sourceContexts = new Set(pool.map((step) => step.source_path));
  return sourceContexts.size === 1 ? { root: ordered[0], ambiguous: false } : { root: null, ambiguous: true };
}

function constructionGraph(targetId, field, rootSelection, steps, generatedNodes, generatedEdges) {
  const graphSteps = new Set();
  const graphEdges = new Set();
  const terminalFields = new Set();
  const issues = [];
  if (!rootSelection.root) return { id: stableId("ATCG", targetId), target_id: targetId, root_step_id: null, step_ids: [], edge_ids: [], terminal_source_fields: [], status: rootSelection.ambiguous ? "partial" : "unavailable", issues: rootSelection.ambiguous ? [{ kind: "ambiguous_construction_root", field }] : [], epistemic: "DERIVED", evidence_ids: [] };
  if (rootSelection.ambiguous) issues.push({ kind: "ambiguous_construction_root", field, selected_step_id: rootSelection.root.id });

  function generatedNode(operationType, input, consumer, state = "established") {
    const id = stableId(operationType === "source_field" ? "ATCSRC" : "ATCUNK", `${consumer.source_path}|${input}|${consumer.id}`);
    if (!generatedNodes.has(id)) generatedNodes.set(id, {
      id, operation_type: operationType, operations: [operationType], inputs: [], output: input, expression: null, parameters: {}, source_path: consumer.source_path,
      source_locator: consumer.source_locator, source_line: consumer.source_line, execution_count: consumer.execution_count,
      epistemic: operationType === "source_field" ? "OBSERVED" : "DERIVED", state, evidence_ids: [...consumer.evidence_ids],
    });
    return generatedNodes.get(id);
  }

  function visit(step, activeOutputs = new Set()) {
    if (graphSteps.has(step.id)) return;
    graphSteps.add(step.id);
    const nextActive = new Set([...activeOutputs, step.output]);
    for (const input of step.inputs || []) {
      const selected = selectProducer(input, step, steps);
      let parent = selected.producer;
      if (selected.ambiguous) {
        parent = generatedNode("unresolved_reference", input, step, "unresolved");
        issues.push({ kind: "ambiguous_execution_context", input, consumer_step_id: step.id });
      } else if (!parent && nextActive.has(input) && !(input === step.output && ["fill", "map", "cast"].includes(step.operation_type))) {
        parent = generatedNode("cycle_reference", input, step, "unresolved");
        issues.push({ kind: "cycle_detected", input, consumer_step_id: step.id });
      } else if (!parent && ["component_group_reference", "variable_reference"].includes(step.input_reference_types?.[input])) {
        parent = generatedNode("unresolved_reference", input, step, "unresolved");
        issues.push({ kind: "missing_dependency", input, consumer_step_id: step.id });
      } else if (!parent) {
        parent = generatedNode("source_field", input, step);
        terminalFields.add(input);
      }
      if (!selected.producer || selected.ambiguous) graphSteps.add(parent.id);
      const edge = { id: stableId("ATCE", `${parent.id}|${step.id}|${input}`), from_step_id: parent.id, to_step_id: step.id, input, relation: "dataflow_dependency", epistemic: "DERIVED", evidence_ids: [...new Set([...(parent.evidence_ids || []), ...(step.evidence_ids || [])])] };
      generatedEdges.set(edge.id, edge);
      graphEdges.add(edge.id);
      if (selected.producer && !selected.ambiguous) visit(selected.producer, nextActive);
    }
  }
  visit(rootSelection.root);
  const graphStepObjects = [...graphSteps].map((id) => steps.find((step) => step.id === id) || generatedNodes.get(id)).filter(Boolean);
  return {
    id: stableId("ATCG", targetId), target_id: targetId, root_step_id: rootSelection.root.id,
    step_ids: [...graphSteps], edge_ids: [...graphEdges], terminal_source_fields: [...terminalFields],
    status: rootSelection.ambiguous || issues.length ? "partial" : "complete", issues,
    epistemic: "DERIVED", evidence_ids: [...new Set(graphStepObjects.flatMap((step) => step.evidence_ids || []))],
  };
}

function explicitProxyEvidence(record, semanticName, sourceFields) {
  const targetTerms = words(semanticName);
  const genericTargetTerms = new Set(["any", "binary", "class", "condition", "flag", "high", "label", "outcome", "risk", "target", "violation", "violations"]);
  const distinctiveTargetTerms = [...targetTerms].filter((term) => !genericTargetTerms.has(term));
  const sourceTerms = new Set(sourceFields.flatMap((field) => [...words(field)]));
  if (!distinctiveTargetTerms.length || !sourceTerms.size) return null;
  const relation = /\b(?:proxy|surrogate|stand[ -]?in|indicator|associated with|represent(?:s|ed|ing)?|used to (?:indicate|represent|measure))\b/i;
  for (const evidence of record?.evidence || []) {
    for (const segment of String(evidence.excerpt || "").split(/(?:\r?\n|(?<=[.!?])\s+)/)) {
      const segmentTerms = words(segment);
      if (!relation.test(segment)) continue;
      if (distinctiveTargetTerms.some((term) => segmentTerms.has(term)) && [...sourceTerms].some((term) => segmentTerms.has(term))) return { evidence_id: evidence.id, excerpt: clean(segment) };
    }
  }
  return null;
}

function targetSemanticType(record, semanticName, field, leaves, construction) {
  if (leaves.length > 1) return { type: "composite_target", basis: "multiple_persisted_indicators_combined", proxy_evidence: null };
  const proxyEvidence = explicitProxyEvidence(record, semanticName, leaves);
  if (proxyEvidence) return { type: "proxy_target", basis: "explicit_persisted_semantic_relationship", proxy_evidence: proxyEvidence };
  const transformed = construction && leaves.length === 1 && clean(leaves[0]).toLowerCase() !== clean(field).toLowerCase();
  if (transformed) return { type: "derived_binary_target", basis: "single_recorded_outcome_transformed_to_binary", proxy_evidence: null };
  return { type: construction ? "derived_binary_target" : "binary_target", basis: construction ? "persisted_binary_construction" : "binary_target_binding", proxy_evidence: null };
}

function buildTargets(sources, record) {
  const bindings = targetBindings(sources);
  const constructionSteps = constructionEvidence(sources);
  const generatedNodes = new Map();
  const generatedEdges = new Map();
  const constructionGraphs = [];
  const targets = bindings.map((binding) => {
    const targetId = stableId("ATD", `${binding.source_path}|${binding.field}`);
    const rootSelection = selectConstructionRoot(binding.field, binding, constructionSteps);
    const ancestry = constructionGraph(targetId, binding.field, rootSelection, constructionSteps, generatedNodes, generatedEdges);
    constructionGraphs.push(ancestry);
    const construction = rootSelection.root;
    const leaves = ancestry.terminal_source_fields;
    const display = binding.stream.display || humanize(binding.field);
    const semantic = targetSemanticType(record, display, binding.field, leaves, construction);
    const graphStepObjects = ancestry.step_ids.map((id) => constructionSteps.find((step) => step.id === id) || generatedNodes.get(id)).filter(Boolean);
    const thresholdValue = construction?.parameters?.threshold;
    const threshold = construction?.parameters?.comparison_operator && Number.isFinite(thresholdValue) ? `${construction.parameters.comparison_operator} ${thresholdValue}` : null;
    const positiveClass = construction?.operation_type === "threshold_mask" && construction.parameters?.replacement_value === 1 ? 1 : null;
    return {
      id: targetId,
      workstream_id: binding.stream.id,
      workstream: binding.stream.name,
      semantic_name: display,
      source_field: binding.field,
      model_source_path: binding.source_path,
      source_fields: leaves,
      terminal_source_fields: leaves,
      construction_rule: construction?.expression || null,
      construction_root_step_id: ancestry.root_step_id,
      construction_graph_id: ancestry.id,
      construction_step_ids: ancestry.step_ids,
      construction_status: ancestry.status,
      construction_issues: ancestry.issues,
      positive_class: positiveClass,
      threshold,
      semantic_subtype: semantic.type,
      interpretation: semantic.type,
      semantic_basis: semantic.basis,
      semantic_construction_step_ids: ancestry.step_ids,
      semantic_evidence_ids: [...new Set([...ancestry.evidence_ids, semantic.proxy_evidence?.evidence_id].filter(Boolean))],
      proxy_evidence: semantic.proxy_evidence,
      population_ids: [], method_run_ids: [], search_ids: [], evaluation_attempt_ids: [], metric_ids: [], diagnostic_ids: [], prevalence_ids: [], feature_set_ids: [], output_ids: [], limitation_ids: [],
      epistemic: construction ? "OBSERVED" : "DERIVED",
      evidence_ids: [...new Set([...binding.evidence_ids, ...ancestry.evidence_ids, semantic.proxy_evidence?.evidence_id].filter(Boolean))],
      source_locators: [...new Set([...binding.locators, ...graphStepObjects.map((step) => step.source_locator)].filter(Boolean))],
    };
  });
  const dependencies = [];
  for (const child of targets) for (const composite of targets) {
    if (child.id === composite.id || !child.source_fields.length || child.source_fields.length >= composite.source_fields.length) continue;
    if (child.source_fields.every((field) => composite.source_fields.includes(field))) dependencies.push({
      id: stableId("ATREL", `${child.id}|${composite.id}|component`), from_target_id: child.id, to_target_id: composite.id,
      relation: "source_component_subset", epistemic: "DERIVED", evidence_ids: [...new Set([...child.evidence_ids, ...composite.evidence_ids])],
    });
  }
  const materialStepIds = new Set(constructionGraphs.flatMap((graph) => graph.step_ids));
  const materialSteps = [...constructionSteps, ...generatedNodes.values()].filter((step) => materialStepIds.has(step.id));
  const materialEdgeIds = new Set(constructionGraphs.flatMap((graph) => graph.edge_ids));
  const materialEdges = [...generatedEdges.values()].filter((edge) => materialEdgeIds.has(edge.id));
  return { targets, dependencies, constructionSteps: materialSteps, constructionEdges: materialEdges, constructionGraphs };
}

function targetForSource(targets, sourcePath) {
  return targets.find((item) => item.model_source_path === sourcePath) || null;
}

function predictionAssignments(source) {
  const assignments = [];
  const pattern = /^\s*([A-Za-z_]\w*)\s*=\s*([A-Za-z_]\w*)\.(predict_proba|predict)\s*\(([^\n]*)\)/gm;
  for (const match of source.matchAll(pattern)) assignments.push({ output: match[1], estimator: match[2], operation: match[3], input: rawTrim(match[4]), score_input: match[3] === "predict_proba" ? "probability" : "hard_label" });
  return assignments;
}

function buildModelRuns(sources, targets) {
  const runs = [];
  const predictionProducers = new Map();
  const latest = new Map();
  const firstSearchByPathMethod = new Map();
  for (const source of sources) {
    const preliminaryLatest = new Map();
    for (const cell of source.cells || []) {
      for (const constructor of constructorCalls(cell.source)) preliminaryLatest.set(constructor.variable, constructor.method);
      const search = cell.source.match(/GridSearchCV\s*\(\s*(?:estimator\s*=\s*)?([A-Za-z_]\w*)/);
      if (search) {
        const method = preliminaryLatest.get(search[1]);
        if (method) {
          const key = `${source.path}|${method}`;
          if (!firstSearchByPathMethod.has(key)) firstSearchByPathMethod.set(key, cell.index);
        }
      }
      if (/KFold\s*\(|cross_val_score\s*\(/i.test(cell.source)) {
        for (const constructor of constructorCalls(cell.source)) {
          const key = `${source.path}|${constructor.method}`;
          if (!firstSearchByPathMethod.has(key)) firstSearchByPathMethod.set(key, cell.index);
        }
      }
    }
  }
  for (const source of sources) {
    const target = targetForSource(targets, source.path);
    for (const cell of source.cells || []) {
      for (const constructor of constructorCalls(cell.source)) {
        const searchIndex = firstSearchByPathMethod.get(`${source.path}|${constructor.method}`);
        const beforeSearch = searchIndex === undefined || cell.index < searchIndex;
        const roles = [beforeSearch ? "untuned" : "candidate_final"];
        const run = {
          id: stableId("AMR", `${cell.locator}|${constructor.variable}|${constructor.estimator_class}|${JSON.stringify(constructor.parameters)}`),
          target_id: target?.id || null, workstream_id: target?.workstream_id || streamIdentity(cell, source).id,
          method: constructor.method, estimator_class: constructor.estimator_class, estimator_variable: constructor.variable,
          parameters: constructor.parameters, raw_parameters: constructor.raw_parameters, roles,
          fit_inputs: [], prediction_ids: [], execution_count: cell.execution_count, source_path: source.path,
          source_locator: cell.locator, epistemic: "OBSERVED", evidence_ids: [cell.evidence_id],
        };
        runs.push(run);
        latest.set(`${source.path}|${constructor.variable}`, run);
      }
      for (const match of cell.source.matchAll(/([A-Za-z_]\w*)\.fit\s*\(\s*([^,\n)]+)/g)) {
        const run = latest.get(`${source.path}|${match[1]}`);
        if (run) run.fit_inputs.push(clean(match[2]));
      }
      for (const prediction of predictionAssignments(cell.source)) {
        const run = latest.get(`${source.path}|${prediction.estimator}`);
        if (!run) continue;
        const id = stableId("APR", `${cell.locator}|${prediction.output}|${run.id}`);
        const item = { id, variable: prediction.output, model_run_id: run.id, operation: prediction.operation, input: prediction.input, score_input: prediction.score_input, threshold: prediction.operation === "predict" ? "estimator_default_decision_rule" : null, source_locator: cell.locator, evidence_ids: [cell.evidence_id] };
        const predictionKey = `${source.path}|${prediction.output}`;
        if (!predictionProducers.has(predictionKey)) predictionProducers.set(predictionKey, []);
        predictionProducers.get(predictionKey).push(item);
        run.prediction_ids.push(id);
        if (/\b(?:X_test|test_x|X2)\b/i.test(prediction.input)) run.roles.push(run.roles.includes("untuned") ? "held_out_untuned" : "final_evaluated");
        else if (!/\b(?:X_train|train_x|X1)\b/i.test(prediction.input)) run.roles.push("whole_population_scoring");
      }
      for (const threshold of cell.source.matchAll(/([A-Za-z_]\w*)\s*=\s*np\.where\(\s*\1\s*([<>]=?)\s*(-?\d+(?:\.\d+)?)/g)) {
        const prediction = predictionProducerFor(predictionProducers, source.path, threshold[1], cell.index);
        if (prediction) { prediction.score_input = "hard_label"; prediction.threshold = `${threshold[2]} ${threshold[3]}`; }
      }
      for (const feature of cell.source.matchAll(/([A-Za-z_]\w*)\.feature_importances_/g)) {
        const run = latest.get(`${source.path}|${feature[1]}`);
        if (run) run.roles.push("feature_producing");
      }
    }
  }
  for (const run of runs) run.roles = [...new Set(run.roles.map((role) => role === "candidate_final" && run.roles.includes("final_evaluated") ? "final_evaluated" : role).filter((role, index, all) => role !== "candidate_final" || !all.includes("final_evaluated")))];
  return { runs, predictionProducers };
}

function predictionProducerFor(producers, sourcePath, variable, beforeCell = Infinity) {
  return (producers.get(`${sourcePath}|${variable}`) || []).filter((item) => cellNumber(item.source_locator) <= beforeCell).sort((a, b) => cellNumber(b.source_locator) - cellNumber(a.source_locator))[0] || null;
}

function dictionaryAssignments(source) {
  const values = [];
  const pattern = /^\s*([A-Za-z_]\w*)\s*=\s*\{/gm;
  for (const match of source.matchAll(pattern)) {
    const start = source.indexOf("{", match.index);
    let depth = 0;
    let quote = null;
    let end = -1;
    for (let index = start; index < source.length; index += 1) {
      const character = source[index];
      if (quote) { if (character === quote && source[index - 1] !== "\\") quote = null; continue; }
      if (character === "'" || character === '"') { quote = character; continue; }
      if (character === "{") depth += 1;
      if (character === "}") depth -= 1;
      if (depth === 0) { end = index + 1; break; }
    }
    if (end > start) values.push({ variable: match[1], raw: source.slice(start, end) });
  }
  return values;
}

function dictPairs(value) {
  const result = {};
  for (const part of topLevelParts(String(value || "").replace(/^\{/, "").replace(/\}\s*$/, ""))) {
    const pair = part.match(/^\s*["']?([^"':]+)["']?\s*:\s*([\s\S]+)$/);
    if (!pair) continue;
    result[rawTrim(pair[1])] = parseLiteral(pair[2]);
  }
  return result;
}

function bestParametersFromOutput(value) {
  const match = String(value || "").match(/\{[\s\S]*?\}/);
  return match ? dictPairs(match[0]) : null;
}

function firstStandaloneNumbers(value) {
  return String(value || "").split(/\r?\n/).map((line) => line.trim()).filter((line) => /^-?\d+(?:\.\d+)?(?:e[-+]?\d+)?$/i.test(line)).map(numeric).filter(Number.isFinite);
}

function buildSearches(sources, targets, runs) {
  const searches = [];
  const stagesByVariable = new Map();
  const parameterSpaces = new Map();
  for (const source of sources) {
    const target = targetForSource(targets, source.path);
    let priorByMethod = new Map();
    for (const cell of source.cells || []) {
      for (const dictionary of dictionaryAssignments(cell.source)) parameterSpaces.set(`${source.path}|${dictionary.variable}`, { raw: dictionary.raw, parsed: dictPairs(dictionary.raw), locator: cell.locator, evidence_id: cell.evidence_id });
      const pattern = /^\s*([A-Za-z_]\w*)\s*=\s*GridSearchCV\s*\(/gm;
      for (const match of cell.source.matchAll(pattern)) {
        const call = balancedCall(cell.source, match.index + match[0].lastIndexOf("("));
        if (!call) continue;
        const parts = topLevelParts(call.arguments);
        const keyword = Object.fromEntries(parts.map((part) => part.match(/^([A-Za-z_]\w*)\s*=\s*([\s\S]+)$/)).filter(Boolean).map((entry) => [entry[1], entry[2]]));
        const estimatorVariable = rawTrim(keyword.estimator || parts.find((part) => !part.includes("=")) || "");
        const parameterVariable = rawTrim(keyword.param_grid || parts.filter((part) => !part.includes("="))[1] || "");
        const run = [...runs].reverse().find((item) => item.source_path === source.path && item.estimator_variable === estimatorVariable && cellNumber(item.source_locator) <= cell.index);
        const method = run?.method || methodName(estimatorVariable);
        const predecessor = priorByMethod.get(method) || null;
        const parameterSpace = parameterSpaces.get(`${source.path}|${parameterVariable}`);
        const stage = {
          id: stableId("AHS", `${cell.locator}|${match[1]}|${method}|${searches.length}`),
          target_id: target?.id || null, workstream_id: target?.workstream_id || streamIdentity(cell, source).id,
          model_run_id: run?.id || null, method, estimator_variable: estimatorVariable, search_variable: match[1],
          search_type: "GridSearchCV", stage_index: predecessor ? predecessor.stage_index + 1 : 1,
          predecessor_id: predecessor?.id || null, parameter_space: parameterSpace?.parsed || {}, parameter_space_expression: parameterSpace?.raw || parameterVariable || null,
          candidate_count: null, cv_folds: numeric(keyword.cv), scoring_metric: clean(keyword.scoring || "").replace(/^['"]|['"]$/g, "") || null,
          scoring_computation: /average_precision/i.test(keyword.scoring || "") ? "average_precision_ranking" : null,
          score_input: /average_precision/i.test(keyword.scoring || "") ? "probability_or_continuous_score" : "unresolved",
          best_score: null, best_parameters: null, final_relationship: "unresolved",
          execution_count: cell.execution_count, source_path: source.path, source_locator: cell.locator,
          epistemic: "OBSERVED", evidence_ids: [...new Set([cell.evidence_id, parameterSpace?.evidence_id].filter(Boolean))],
        };
        searches.push(stage);
        priorByMethod.set(method, stage);
        stagesByVariable.set(`${source.path}|${match[1]}`, stage);
      }
      const fit = cell.source.match(/([A-Za-z_]\w*)\.fit\s*\(/);
      const active = fit ? stagesByVariable.get(`${source.path}|${fit[1]}`) : null;
      if (active) {
        const fitting = outputText(cell).match(/Fitting\s+(\d+)\s+folds\s+for\s+each\s+of\s+(\d+)\s+candidates/i);
        if (fitting) { active.cv_folds = numeric(fitting[1]); active.candidate_count = numeric(fitting[2]); }
        active.evidence_ids = [...new Set([...active.evidence_ids, cell.evidence_id])];
      }
      for (const reference of cell.source.matchAll(/([A-Za-z_]\w*)\.best_(params|score)_/g)) {
        const stage = stagesByVariable.get(`${source.path}|${reference[1]}`);
        if (!stage) continue;
        if (reference[2] === "params") stage.best_parameters = bestParametersFromOutput(outputText(cell));
        if (reference[2] === "score") stage.best_score = firstStandaloneNumbers(outputText(cell)).at(-1) ?? null;
        if (/best_params_[\s\S]*best_score_/m.test(cell.source)) {
          stage.best_parameters = bestParametersFromOutput(outputText(cell));
          stage.best_score = firstStandaloneNumbers(outputText(cell)).at(-1) ?? stage.best_score;
        }
        stage.evidence_ids = [...new Set([...stage.evidence_ids, cell.evidence_id])];
      }
      if (/KFold\s*\(\s*n_splits\s*=|cross_val_score\s*\(/i.test(cell.source) && /for\s+\w+\s+in\s+/i.test(cell.source)) {
        const constructor = constructorCalls(cell.source).find((item) => /lasso/i.test(item.method)) || constructorCalls(cell.source)[0];
        if (!constructor) continue;
        const method = constructor.method;
        const predecessor = priorByMethod.get(method) || null;
        const parameter = cell.source.match(/([A-Za-z_]\w*)\s*=\s*np\.(?:linspace|arange)\s*\(([^\n]+)\)/);
        const folds = numeric(cell.source.match(/KFold\s*\(\s*n_splits\s*=\s*(\d+)/)?.[1]);
        const rows = outputText(cell).split(/\r?\n/).map((line) => line.match(/^\s*(-?\d+(?:\.\d+)?(?:e[-+]?\d+)?)\s*(?:-|\s)\s*(-?\d+(?:\.\d+)?(?:e[-+]?\d+)?)\s*$/i)).filter(Boolean);
        const bestLine = rows.map((row) => ({ parameter: numeric(row[1]), score: numeric(row[2]) })).filter((row) => Number.isFinite(row.score)).sort((a, b) => b.score - a.score)[0] || null;
        const printedBest = numeric(outputText(cell).match(/best possible (?:lambda|parameter)[^:]*:\s*(-?\d+(?:\.\d+)?(?:e[-+]?\d+)?)/i)?.[1]);
        const stage = {
          id: stableId("AHS", `${cell.locator}|manual_cv|${method}`), target_id: target?.id || null,
          workstream_id: target?.workstream_id || streamIdentity(cell, source).id, model_run_id: null, method,
          estimator_variable: constructor.variable, search_variable: parameter?.[1] || "parameter_search", search_type: "manual_cross_validation",
          stage_index: predecessor ? predecessor.stage_index + 1 : 1, predecessor_id: predecessor?.id || null,
          parameter_space: parameter ? { [parameter[1]]: { expression: parameter[2] } } : {}, parameter_space_expression: parameter?.[0] || null,
          candidate_count: rows.length || null, cv_folds: folds, scoring_metric: /average_precision_score/i.test(cell.source) ? "average_precision" : null,
          scoring_computation: /average_precision_score/i.test(cell.source) ? "average_precision_hard_label" : null,
          score_input: /np\.where\([^\n]+[<>]=?\s*[-\d.]+/i.test(cell.source) ? "hard_label" : "unresolved",
          threshold: cell.source.match(/np\.where\([^\n]+?([<>]=?\s*-?\d+(?:\.\d+)?)/)?.[1] || null,
          best_score: bestLine?.score ?? null, score_scale: /\*\s*100/.test(cell.source) ? "percent" : "proportion",
          best_parameters: printedBest === null ? (bestLine ? { [parameter?.[1] || "parameter"]: bestLine.parameter } : null) : { [parameter?.[1] || "parameter"]: printedBest },
          final_relationship: "unresolved", execution_count: cell.execution_count, source_path: source.path, source_locator: cell.locator,
          epistemic: "OBSERVED", evidence_ids: [cell.evidence_id],
        };
        searches.push(stage);
        priorByMethod.set(method, stage);
      }
    }
  }
  const aliases = (value) => value === "reg_lambda" ? "lambda" : value.replace(/^reg_/, "");
  for (const run of runs.filter((item) => item.roles.includes("final_evaluated"))) {
    const prior = searches.filter((item) => item.target_id === run.target_id && item.method === run.method && cellNumber(item.source_locator) < cellNumber(run.source_locator));
    for (const stage of prior) {
      const best = stage.best_parameters || {};
      const runParams = Object.fromEntries(Object.entries(run.parameters || {}).map(([key, value]) => [aliases(key), value]));
      const comparisons = Object.entries(best).filter(([key]) => Object.hasOwn(runParams, aliases(key))).map(([key, value]) => {
        const actual = runParams[aliases(key)];
        return typeof actual === "object" ? null : Object.is(actual, value);
      }).filter((value) => value !== null);
      stage.final_model_run_id = run.id;
      if (comparisons.length && comparisons.every(Boolean)) stage.final_relationship = "parameters_match_shared_best";
      else if (comparisons.some((value) => !value)) stage.final_relationship = "parameter_mismatch";
      else if (Object.values(run.parameters).some((value) => value?.expression && /best/i.test(value.expression))) stage.final_relationship = "linked_by_search_variable";
    }
  }
  return searches;
}

function sourceCellMap(sources) {
  return new Map(allCells(sources).map(({ cell }) => [cell.locator, cell]));
}

function methodRunFor({ target, method, locator, runs, role = null }) {
  const normalized = methodName(method);
  const number = cellNumber(locator);
  const candidates = runs.filter((run) => run.target_id === target?.id && methodName(run.method) === normalized && cellNumber(run.source_locator) <= number && (!role || run.roles.includes(role)));
  return candidates.sort((a, b) => cellNumber(b.source_locator) - cellNumber(a.source_locator))[0] || null;
}

function metricComputation(metric, cell, method, source) {
  const code = cell?.source || "";
  if (metric === "average_precision") {
    const definitions = (source.cells || []).filter((item) => item.index < (cell?.index ?? Infinity) && /def\s+\w+\([^)]*y_pred[^)]*\)[\s\S]*average_precision_score\([^,]+,\s*y_pred\)/i.test(item.source));
    const hard = /average_precision_score\([^,]+,\s*(?:y_?pred\w*|lasso_pred|predicted|yhat)\s*\)/i.test(code) || definitions.length;
    return { computation: "average_precision_score", score_input: hard ? "hard_label" : "probability_or_continuous_score", threshold: hard ? "estimator_or_persisted_threshold" : null };
  }
  if (metric === "pr_auc") {
    const curveInputs = [...code.matchAll(/precision_recall_curve\s*\(\s*[^,]+,\s*([A-Za-z_]\w*)/gi)].map((match) => match[1]);
    const probabilityInput = curveInputs.some((variable) => new RegExp(`\\b${variable}\\s*=\\s*[A-Za-z_]\\w*\\.predict_proba\\s*\\(`).test(code));
    const scoreInput = probabilityInput || new RegExp(`${String(method || "").split(/\s/)[0]}[^\n]*predict_proba`, "i").test(code) || /(?:rf|xgb)_probs\s*=\s*\w+\.predict_proba/i.test(code) && !/lasso/i.test(method) ? "probability" : "continuous_score";
    return { computation: /precision_recall_curve[\s\S]*\bauc\s*\(/i.test(code) ? "trapezoidal_auc_over_precision_recall_curve" : "pr_auc", score_input: scoreInput, threshold: null };
  }
  if (metric === "roc_auc") return { computation: "roc_auc_score", score_input: /lasso/i.test(method) ? "continuous_score" : /no skill/i.test(method) ? "constant_score" : "probability", threshold: null };
  if (["accuracy", "recall", "precision", "f1"].includes(metric)) return { computation: `sklearn_${metric}`, score_input: "hard_label", threshold: "estimator_or_persisted_threshold" };
  return { computation: metric, score_input: "unresolved", threshold: null };
}

function finalBoundary(source) {
  return (source.cells || []).find((cell) => /compar(?:ing|ison).*models|final.*compar/i.test(`${cell.heading?.label || ""}\n${cell.source}`))?.index ?? Infinity;
}

function exactAveragePrecision(sources, targets, runs, predictionProducers) {
  const observations = [];
  for (const source of sources) {
    const target = targetForSource(targets, source.path);
    if (!target) continue;
    const boundary = finalBoundary(source);
    for (const cell of source.cells || []) {
      if (!/average_precision_score\s*\(\s*[^,]+,\s*([A-Za-z_]\w*)\s*\)/i.test(cell.source)) continue;
      const predictionVariable = cell.source.match(/average_precision_score\s*\(\s*[^,]+,\s*([A-Za-z_]\w*)\s*\)/i)?.[1];
      const producer = predictionProducerFor(predictionProducers, source.path, predictionVariable, cell.index);
      const run = runs.find((item) => item.id === producer?.model_run_id) || null;
      const values = firstStandaloneNumbers(outputText(cell));
      if (!run || !values.length) continue;
      const value = values[0];
      const phase = /\by_test\b/i.test(cell.source) ? "test" : /\by_train\b/i.test(cell.source) ? "train" : "unspecified";
      const final = cell.index > boundary || run.roles.includes("final_evaluated") && !run.roles.includes("held_out_untuned");
      observations.push({
        id: stableId("AMO", `${cell.locator}|${run.id}|average_precision|${value}`), target_id: target.id,
        workstream_id: target.workstream_id, method: run.method, model_run_id: run.id, evaluation_attempt_id: stableId("AEA", `${source.path}|${target.id}|${final ? "final" : "untuned"}|${run.id}`),
        metric: "average_precision", metric_label: "Average precision", exact_value: value, value, persisted_precision: String(value).split(".")[1]?.length || 0,
        direction_of_better: "higher", dimension: "rate", computation: "average_precision_score", score_input: producer?.score_input || "hard_label", threshold: producer?.threshold,
        evaluation_phase: phase, estimator_variant: final ? "final" : "untuned", final, population_id: null,
        execution_count: cell.execution_count, epistemic: "OBSERVED", evidence_ids: [cell.evidence_id], source_locator: cell.locator,
      });
    }
  }
  return observations;
}

function buildMetricObservations(sources, targets, runs, predictionProducers, legacyResults) {
  const cellMap = sourceCellMap(sources);
  const sourceMap = new Map(sources.map((source) => [source.path, source]));
  const observations = [];
  for (const result of legacyResults) {
    const sourcePath = String(result.source_locator || "").split("#cell-")[0];
    const target = targets.find((item) => item.workstream_id === result.workstream_id) || targetForSource(targets, sourcePath);
    if (!target) continue;
    const source = sourceMap.get(sourcePath);
    const cell = cellMap.get(result.source_locator);
    const final = (cell?.index ?? -1) > finalBoundary(source);
    const run = methodRunFor({ target, method: result.method, locator: result.source_locator, runs, role: final ? "final_evaluated" : null }) || methodRunFor({ target, method: result.method, locator: result.source_locator, runs });
    const semantics = metricComputation(result.metric, cell, result.method, source);
    observations.push({
      id: stableId("AMO", `${result.id}|typed`), legacy_result_id: result.id, target_id: target.id, workstream_id: target.workstream_id,
      method: methodName(result.method), model_run_id: run?.id || null,
      evaluation_attempt_id: stableId("AEA", `${sourcePath}|${target.id}|${final ? "final" : result.evaluation_phase}|${final ? "comparison" : result.evaluation_attempt_id}`),
      metric: result.metric, metric_label: result.metric_label, exact_value: result.value, value: result.value,
      persisted_precision: String(result.value).split(".")[1]?.length || 0, direction_of_better: result.direction || "unresolved", dimension: "rate",
      ...semantics, evaluation_phase: result.evaluation_phase, estimator_variant: final ? "final" : run?.roles.includes("held_out_untuned") ? "untuned" : "unresolved", final,
      population_id: null, execution_count: cell?.execution_count ?? null, epistemic: result.epistemic, evidence_ids: result.evidence_ids, source_locator: result.source_locator,
    });
  }
  const exact = exactAveragePrecision(sources, targets, runs, predictionProducers);
  for (const observation of exact) if (!observations.some((item) => item.source_locator === observation.source_locator && item.model_run_id === observation.model_run_id && item.metric === observation.metric && item.value === observation.value)) observations.push(observation);
  return observations;
}

function buildEvaluationAttempts(targets, metrics, diagnostics = []) {
  const groups = new Map();
  for (const object of [...metrics, ...diagnostics]) {
    if (!object.evaluation_attempt_id) continue;
    if (!groups.has(object.evaluation_attempt_id)) groups.set(object.evaluation_attempt_id, []);
    groups.get(object.evaluation_attempt_id).push(object);
  }
  return [...groups.entries()].map(([attemptId, objects]) => ({
    id: attemptId, target_id: objects[0].target_id || null, model_run_ids: [...new Set(objects.map((item) => item.model_run_id).filter(Boolean))],
    evaluation_phase: objects[0].evaluation_phase || "unspecified", estimator_variant: objects[0].estimator_variant || "unresolved",
    population_id: objects[0].population_id || null, metric_ids: objects.filter((item) => item.metric).map((item) => item.id), diagnostic_ids: objects.filter((item) => item.type).map((item) => item.id),
    status: "persisted", epistemic: "DERIVED", evidence_ids: [...new Set(objects.flatMap((item) => item.evidence_ids || []))], source_locators: [...new Set(objects.map((item) => item.source_locator).filter(Boolean))],
  }));
}

function typedComparisons(legacySets, metricObservations, targets) {
  const metricByLegacy = new Map(metricObservations.filter((item) => item.legacy_result_id).map((item) => [item.legacy_result_id, item]));
  const exactFinal = metricObservations.filter((item) => item.final && item.metric === "average_precision" && !item.legacy_result_id);
  const sets = [];
  for (const set of legacySets) {
    const target = targets.find((item) => item.workstream_id === set.workstream_id);
    if (!target) continue;
    const items = set.results.map((result) => metricByLegacy.get(result.id)).filter(Boolean);
    if (!items.length) continue;
    const results = items.map((item) => {
      if (item.metric !== "average_precision") return item;
      return exactFinal.filter((exact) => exact.target_id === target.id && methodName(exact.method) === methodName(item.method)).sort((a, b) => cellNumber(b.source_locator) - cellNumber(a.source_locator))[0] || item;
    });
    const unique = results.filter((item, index, all) => all.findIndex((other) => other.method === item.method && other.metric === item.metric) === index);
    const methods = [...new Set(unique.map((item) => item.method))];
    const metricKeys = [...new Set(unique.map((item) => item.metric))];
    if (methods.length < 2) continue;
    const final = unique.every((item) => item.final);
    const estimatorVariants = [...new Set(unique.map((item) => item.estimator_variant).filter(Boolean))];
    sets.push({
      id: stableId("AFC", `${target.id}|${set.id}|${final ? "final" : "compatible"}`), target_id: target.id, workstream_id: target.workstream_id,
      workstream: target.workstream, display_label: target.semantic_name, evaluation_phase: set.evaluation_phase || "test", estimator_variant: final ? "final" : estimatorVariants.length === 1 ? estimatorVariants[0] : "evaluated",
      evaluation_attempt_id: set.evaluation_attempt_id,
      comparability: final ? "same_target_final_held_out_context" : "same_target_shared_evaluation_context", methods,
      metrics: metricKeys.map((key) => { const item = unique.find((value) => value.metric === key); return { key, label: item.metric_label, direction: item.direction_of_better, direction_of_better: item.direction_of_better, computation: item.computation, score_input: item.score_input }; }),
      results: unique, evidence_ids: [...new Set(unique.flatMap((item) => item.evidence_ids))], epistemic: "DERIVED",
    });
  }
  return sets;
}

function buildDiagnostics(sources, targets, runs, predictionProducers, legacyDiagnostics) {
  const cellMap = sourceCellMap(sources);
  const diagnostics = [];
  for (const diagnostic of legacyDiagnostics) {
    const sourcePath = String(diagnostic.source_locator || "").split("#cell-")[0];
    const target = targets.find((item) => item.workstream_id === diagnostic.workstream_id) || targetForSource(targets, sourcePath);
    if (!target) continue;
    const cell = cellMap.get(diagnostic.source_locator);
    let method = diagnostic.method;
    if (method === "Method not established" && cell) {
      const prediction = cell.source.match(/confusion_matrix\s*\(\s*[^,]+,\s*([A-Za-z_]\w*)/)?.[1];
      const producer = predictionProducerFor(predictionProducers, sourcePath, prediction, cell?.index ?? Infinity);
      const producerRun = runs.find((item) => item.id === producer?.model_run_id);
      if (producerRun) method = producerRun.method;
    }
    const source = sources.find((item) => item.path === sourcePath);
    const final = (cell?.index ?? -1) > finalBoundary(source);
    const run = methodRunFor({ target, method, locator: diagnostic.source_locator, runs, role: final ? "final_evaluated" : null }) || methodRunFor({ target, method, locator: diagnostic.source_locator, runs });
    const squareMatrix = diagnostic.type === "confusion_matrix" && diagnostic.values?.length >= 2
      && diagnostic.values.every((row) => row.length === diagnostic.values.length) ? diagnostic.values : null;
    const matrix = squareMatrix?.length === 2 ? squareMatrix : null;
    diagnostics.push({
      ...diagnostic, id: stableId("ADO", `${diagnostic.id}|typed`), target_id: target.id, method: methodName(method), model_run_id: run?.id || null,
      evaluation_attempt_id: stableId("AEA", `${sourcePath}|${target.id}|${final ? "final" : "untuned"}|${final ? "comparison" : run?.id || diagnostic.id}`),
      estimator_variant: final ? "final" : run?.roles.includes("held_out_untuned") ? "untuned" : "unresolved", final,
      dimension: diagnostic.normalized ? "normalized_rate_matrix" : "count_matrix",
      orientation: squareMatrix ? { rows: "actual", columns: "predicted", class_labels: diagnostic.labels || [],
        ...(matrix ? { negative_class: diagnostic.labels?.[0] || "0", positive_class: diagnostic.labels?.[1] || "1" } : {}) } : null,
      tn: matrix?.[0]?.[0] ?? null, fp: matrix?.[0]?.[1] ?? null, fn: matrix?.[1]?.[0] ?? null, tp: matrix?.[1]?.[1] ?? null,
      predicted_positive_count: matrix ? matrix[0][1] + matrix[1][1] : null,
      derived_rates: matrix ? { recall: matrix[1][1] / (matrix[1][1] + matrix[1][0]), precision: matrix[1][1] / (matrix[1][1] + matrix[0][1]), accuracy: (matrix[0][0] + matrix[1][1]) / matrix.flat().reduce((sum, value) => sum + value, 0) } : null,
      execution_count: cell?.execution_count ?? null,
    });
  }
  for (const source of sources) {
    const target = targetForSource(targets, source.path);
    if (!target) continue;
    for (const cell of source.cells || []) {
      const count = outputText(cell).match(/number predicted\s*:\s*(?:\d+\s+)?([\d.]+)/i);
      if (!count) continue;
      const prediction = cell.source.match(/average_precision_score\s*\(\s*[^,]+,\s*([A-Za-z_]\w*)/)?.[1];
      const producer = predictionProducerFor(predictionProducers, source.path, prediction, cell.index);
      const run = runs.find((item) => item.id === producer?.model_run_id);
      if (!run) continue;
      const final = run.roles.includes("final_evaluated") && !run.roles.includes("held_out_untuned");
      diagnostics.push({ id: stableId("ADO", `${cell.locator}|prediction_count|${run.id}`), type: "predicted_positive_count", target_id: target.id, workstream_id: target.workstream_id,
        method: run.method, model_run_id: run.id, evaluation_attempt_id: stableId("AEA", `${source.path}|${target.id}|${final ? "final" : "untuned"}|${run.id}`),
        evaluation_phase: "test", estimator_variant: final ? "final" : "untuned", final, value: numeric(count[1]), dimension: "count", population_id: null,
        execution_count: cell.execution_count, epistemic: "OBSERVED", evidence_ids: [cell.evidence_id], source_locator: cell.locator });
    }
  }
  return diagnostics;
}

function shapeObservations(sources) {
  const observations = [];
  for (const source of sources) for (const cell of source.cells || []) {
    const shape = outputText(cell).match(/^\s*\(\s*([\d,]+)\s*,\s*([\d,]+)\s*\)/m);
    const variable = cell.source.match(/([A-Za-z_]\w*)\.shape/)?.[1]
      || cell.source.match(/([A-Za-z_]\w*)\.describe\(\)/)?.[1]
      || cell.source.match(/(?:getDfSummary|describe)\s*\(\s*([A-Za-z_]\w*)/)?.[1]
      || null;
    if (shape) observations.push({ source, cell, variable, count: numeric(shape[1]), columns: numeric(shape[2]), recognition: "persisted_shape" });

    if (variable && !shape && /^\s*count\s+[\d,.]+/m.test(outputText(cell))) {
      const count = numeric(outputText(cell).match(/^\s*count\s+([\d,.]+)/m)?.[1]);
      if (Number.isFinite(count)) observations.push({ source, cell, variable, count, columns: null, recognition: "persisted_describe_count" });
    }

    if (variable && /number_distinct\s+number_nan/i.test(outputText(cell))) {
      const rows = outputText(cell).split(/\r?\n/).map((line) => line.match(/^\s*(.+?)\s+([\d,]+)\s+([\d,]+)\s*$/)).filter(Boolean)
        .map((match) => ({ field: clean(match[1]), distinct: numeric(match[2]), missing: numeric(match[3]) }));
      const completeMissing = rows.filter((row) => row.distinct === 0 && Number.isFinite(row.missing) && row.missing > 0);
      const count = completeMissing.length ? Math.max(...completeMissing.map((row) => row.missing)) : null;
      if (Number.isFinite(count)) observations.push({ source, cell, variable, count, columns: rows.length, recognition: "complete_missing_column_denominator" });
    }
  }
  return observations.filter((item, index, all) => Number.isFinite(item.count)
    && all.findIndex((other) => other.source.path === item.source.path && other.cell.index === item.cell.index && other.variable === item.variable && other.count === item.count) === index);
}

function populationNode({ role, label, count, predicate = null, observation = null, evidenceIds = [], epistemic = "OBSERVED", derivation = null, targetIds = [] }) {
  const locator = observation?.cell?.locator || derivation?.operands?.join("|") || label;
  return {
    id: stableId("APN", `${role}|${count}|${locator}`), role, label, count, unit: "observations", predicate,
    geography: null, period: null, target_ids: [...new Set(targetIds)], source_identities: observation?.variable ? [observation.variable] : [],
    derivation, epistemic, evidence_ids: [...new Set([...evidenceIds, observation?.cell?.evidence_id].filter(Boolean))], source_locator: observation?.cell?.locator || null,
  };
}

function recordNumbers(value) {
  return [...String(value || "").matchAll(/\b\d{1,3}(?:,\d{3})+|\b\d{3,}\b/g)].map((match) => numeric(match[0])).filter(Number.isFinite);
}

function persistedSplitCounts(sources) {
  const observations = [];
  for (const { source, cell } of allCells(sources)) {
    const persisted = outputText(cell);
    const patterns = [
      { role: "training", pattern: /(?:number of\s+)?train(?:ing)?(?:\s+\w+){0,3}\s*(?:is|:|=)\s*([\d,]+)/gi },
      { role: "evaluation", pattern: /(?:number of\s+)?(?:test|evaluation|held[ -]?out)(?:\s+\w+){0,3}\s*(?:is|:|=)\s*([\d,]+)/gi },
    ];
    for (const { role, pattern } of patterns) for (const match of persisted.matchAll(pattern)) {
      const neighbourhood = persisted.slice(Math.max(0, match.index - 48), Math.min(persisted.length, match.index + match[0].length + 24));
      if (/%|accuracy|auc|precision|recall|f1|score|loss|error/i.test(neighbourhood)) continue;
      const count = numeric(match[1]);
      if (Number.isFinite(count)) observations.push({ role, count, source, cell, variable: role === "training" ? "persisted_training_branch" : "persisted_evaluation_branch" });
    }
  }
  return observations;
}

function dataframeRelations(source) {
  const relations = [];
  for (const cell of source.cells || []) {
    const code = String(cell.source || "");
    for (const match of code.matchAll(/^\s*([A-Za-z_]\w*)\s*=\s*([A-Za-z_]\w*)\s*\[/gm)) {
      if (match[1] !== match[2]) relations.push({ child: match[1], parent: match[2], relation: "filter_or_projection", cell });
    }
    for (const match of code.matchAll(/^\s*([A-Za-z_]\w*)\s*=\s*[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)?\s*\(\s*([A-Za-z_]\w*)/gm)) {
      if (match[1] !== match[2]) relations.push({ child: match[1], parent: match[2], relation: "preparation", cell });
    }
    for (const match of code.matchAll(/^\s*([A-Za-z_]\w*)\s*,\s*([A-Za-z_]\w*)\s*,\s*([A-Za-z_]\w*)\s*,\s*([A-Za-z_]\w*)\s*=\s*[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)?\s*\(([^\n]+)/gm)) {
      const input = topLevelParts(match[5])[0]?.match(/^([A-Za-z_]\w*)/)?.[1];
      if (!input) continue;
      for (const child of match.slice(1, 5)) relations.push({ child, parent: input, relation: "split_projection", cell });
    }
  }
  return relations;
}

function splitSpecifications(sources, observations) {
  const specifications = [];
  for (const source of sources) {
    const wrappers = new Map();
    for (const cell of source.cells || []) for (const match of String(cell.source || "").matchAll(/def\s+([A-Za-z_]\w*)\s*\([^)]*\)\s*:[\s\S]*?train_test_split\s*\(([^)]*)\)/g)) {
      const parts = topLevelParts(match[2]);
      const keywords = Object.fromEntries(parts.map((part) => part.match(/^([A-Za-z_]\w*)\s*=\s*([^,]+)$/)).filter(Boolean).map((item) => [item[1], item[2]]));
      wrappers.set(match[1], {
        test_size: keywords.test_size === undefined ? null : numeric(keywords.test_size),
        train_size: keywords.train_size === undefined ? null : numeric(keywords.train_size),
        cell,
      });
    }
    for (const cell of source.cells || []) for (const match of String(cell.source || "").matchAll(/^\s*([A-Za-z_]\w*)\s*,\s*([A-Za-z_]\w*)\s*,\s*([A-Za-z_]\w*)\s*,\s*([A-Za-z_]\w*)\s*=\s*([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)?)\s*\(([^\n]+)/gm)) {
      const roles = match.slice(1, 5).map((variable) => /train/i.test(variable) ? "training" : /test|eval|valid/i.test(variable) ? "evaluation" : null);
      if (!roles.includes("training") || !roles.includes("evaluation")) continue;
      const parts = topLevelParts(match[6]);
      const input = parts[0]?.match(/^([A-Za-z_]\w*)/)?.[1];
      if (!input) continue;
      const keywords = Object.fromEntries(parts.map((part) => part.match(/^([A-Za-z_]\w*)\s*=\s*([^,]+)$/)).filter(Boolean).map((item) => [item[1], item[2]]));
      const wrapper = wrappers.get(match[5]);
      const directTestSize = keywords.test_size === undefined ? null : numeric(keywords.test_size);
      const directTrainSize = keywords.train_size === undefined ? null : numeric(keywords.train_size);
      const testSize = directTestSize ?? wrapper?.test_size ?? null;
      const trainSize = directTrainSize ?? wrapper?.train_size ?? null;
      const inputObservation = observations.filter((item) => item.source.path === source.path && item.variable === input && item.cell.index <= cell.index).sort((a, b) => b.cell.index - a.cell.index)[0] || null;
      if (!inputObservation || (!Number.isFinite(testSize) && !Number.isFinite(trainSize))) continue;
      let evaluationCount = null;
      let trainingCount = null;
      if (Number.isFinite(testSize)) evaluationCount = testSize > 0 && testSize < 1 ? Math.ceil(inputObservation.count * testSize) : Math.trunc(testSize);
      if (Number.isFinite(trainSize)) trainingCount = trainSize > 0 && trainSize < 1 ? Math.floor(inputObservation.count * trainSize) : Math.trunc(trainSize);
      if (!Number.isFinite(evaluationCount) && Number.isFinite(trainingCount)) evaluationCount = inputObservation.count - trainingCount;
      if (!Number.isFinite(trainingCount) && Number.isFinite(evaluationCount)) trainingCount = inputObservation.count - evaluationCount;
      if (![trainingCount, evaluationCount].every((value) => Number.isSafeInteger(value) && value >= 0) || trainingCount + evaluationCount > inputObservation.count) continue;
      specifications.push({ source, cell, input, input_observation: inputObservation, training_count: trainingCount, evaluation_count: evaluationCount,
        test_size: testSize, train_size: trainSize, wrapper_cell: wrapper?.cell || null, evidence_ids: [...new Set([cell.evidence_id, wrapper?.cell?.evidence_id, inputObservation.cell.evidence_id].filter(Boolean))] });
    }
  }
  return specifications;
}

function stageLabel(observation, relation = null) {
  const identity = `${observation.variable || ""} ${observation.cell.source || ""}`;
  if (/borough|county|district|region|city|state/i.test(identity)) return "Geographic subset";
  if (/complaint|cohort|segment|target|outcome|class/i.test(identity) && /==|isin|query|filter|getDfSummary/i.test(identity)) return "Target population";
  if (/model|feature|train|test/i.test(identity)) return relation === "filter" ? "Filtered model population" : "Model population";
  return "Prepared population";
}

function inferredPopulationGraph(record, sources, targets, observations, splits) {
  const canonical = record?.reconstruction || {};
  const nodes = [];
  const relations = [];
  const contexts = [];
  const add = (node) => {
    const existing = nodes.find((item) => item.id === node.id);
    if (existing) return existing;
    nodes.push(node);
    return node;
  };
  const relate = (from, to, relation, predicate, evidenceIds) => {
    if (!from || !to || from.id === to.id || relations.some((item) => item.from === from.id && item.to === to.id && item.relation === relation)) return;
    relations.push({ id: stableId("APR", `${from.id}|${to.id}|${relation}`), from: from.id, to: to.id, relation, predicate: predicate || null,
      epistemic: "DERIVED", evidence_ids: [...new Set(evidenceIds || [])] });
  };
  const sourceCount = canonical.samples?.source_data?.count;
  const sourceNode = Number.isFinite(sourceCount) ? add(populationNode({ role: "source", label: "Source rows", count: sourceCount,
    evidenceIds: canonical.samples.source_data.evidence_ids, epistemic: canonical.samples.source_data.epistemic || "OBSERVED", targetIds: targets.map((item) => item.id) })) : null;

  for (const split of splits) {
    const target = targetForSource(targets, split.source.path) || targets[0] || null;
    const assignments = dataframeRelations(split.source);
    const selected = [];
    const visited = new Set();
    function collect(variable, beforeIndex) {
      const key = `${variable}|${beforeIndex}`;
      if (visited.has(key)) return;
      visited.add(key);
      const own = observations.filter((item) => item.source.path === split.source.path && item.variable === variable && item.cell.index <= beforeIndex)
        .sort((a, b) => a.cell.index - b.cell.index);
      for (const observation of own) if (!selected.some((item) => item.variable === observation.variable && item.count === observation.count)) selected.push(observation);
      const boundary = own[0]?.cell.index ?? beforeIndex;
      const parent = assignments.filter((item) => item.child === variable && item.cell.index <= boundary).sort((a, b) => b.cell.index - a.cell.index)[0]
        || assignments.filter((item) => item.child === variable && item.cell.index <= beforeIndex).sort((a, b) => b.cell.index - a.cell.index)[0];
      if (parent && parent.parent !== variable) collect(parent.parent, parent.cell.index);
    }
    collect(split.input, split.cell.index);
    selected.sort((a, b) => a.cell.index - b.cell.index);
    const contextNodes = [];
    const contextEdges = [];
    if (sourceNode) contextNodes.push(sourceNode);
    let previous = sourceNode;
    for (const observation of selected) {
      if (previous?.count === observation.count && previous.role !== "source") continue;
      const node = add(populationNode({ role: "population_stage", label: stageLabel(observation, previous?.count > observation.count ? "filter" : "preparation"), count: observation.count,
        predicate: clean(observation.cell.source), observation, evidenceIds: [observation.cell.evidence_id], targetIds: target ? [target.id] : [] }));
      contextNodes.push(node);
      if (previous && previous.count >= node.count) {
        const relation = previous.role === "source" || previous.count > node.count ? "filter" : "preparation";
        relate(previous, node, relation, node.predicate, [...previous.evidence_ids, ...node.evidence_ids]);
        const edge = relations.at(-1);
        if (edge && edge.from === previous.id && edge.to === node.id) contextEdges.push(edge);
      }
      previous = node;
    }
    const parent = contextNodes.find((item) => item.id === stableId("APN", `population_stage|${split.input_observation.count}|${split.input_observation.cell.locator}`))
      || [...contextNodes].reverse().find((item) => item.count === split.input_observation.count)
      || previous;
    const splitDescription = Number.isFinite(split.test_size) && split.test_size > 0 && split.test_size < 1
      ? `${Math.round((1 - split.test_size) * 100)}/${Math.round(split.test_size * 100)} train/test split`
      : "Recorded train/test split";
    const training = add(populationNode({ role: "training", label: "Training population", count: split.training_count, predicate: splitDescription,
      evidenceIds: split.evidence_ids, epistemic: "DERIVED", derivation: { operation: "train_test_split", operands: [parent?.id], test_size: split.test_size }, targetIds: target ? [target.id] : [] }));
    const evaluation = add(populationNode({ role: "evaluation", label: "Held-out evaluation population", count: split.evaluation_count, predicate: splitDescription,
      evidenceIds: split.evidence_ids, epistemic: "DERIVED", derivation: { operation: "train_test_split", operands: [parent?.id], test_size: split.test_size }, targetIds: target ? [target.id] : [] }));
    for (const branch of [training, evaluation]) {
      contextNodes.push(branch);
      relate(parent, branch, "split", splitDescription, split.evidence_ids);
      const edge = relations.at(-1);
      if (edge && edge.from === parent?.id && edge.to === branch.id) contextEdges.push(edge);
    }
    const evidenceIds = [...new Set(contextNodes.flatMap((node) => node.evidence_ids || []))];
    contexts.push({ id: stableId("APC", `${target?.id || split.source.path}|${split.cell.locator}`), target_id: target?.id || null,
      workstream_id: target?.workstream_id || streamIdentity(split.cell, split.source).id, workstream: target?.workstream || split.cell.workstream,
      display_label: target?.semantic_name || humanize(split.cell.workstream), nodes: contextNodes, edges: contextEdges,
      training_count: training.count, evaluation_count: evaluation.count, test_fraction: split.test_size > 0 && split.test_size < 1 ? split.test_size : null,
      split_source_locator: split.cell.locator, lineage_mode: "explicit_stages", evidence_ids: evidenceIds });
  }
  for (const target of targets) target.population_ids = nodes.filter((node) => !node.target_ids.length || node.target_ids.includes(target.id)).map((node) => node.id);
  const first = contexts[0];
  return { nodes, edges: relations, relations, contexts, status: nodes.length ? "partial_or_complete" : "unavailable",
    roles: { source: sourceNode?.id || null, training: first?.nodes.find((item) => item.role === "training")?.id || null, evaluation: first?.nodes.find((item) => item.role === "evaluation")?.id || null } };
}

function buildPopulationGraph(record, sources, targets) {
  const observations = shapeObservations(sources);
  const splitCounts = persistedSplitCounts(sources);
  const canonical = record?.reconstruction || {};
  const inferredSplits = splitSpecifications(sources, observations);
  const canonicalTraining = canonical.samples?.model_sample?.count;
  const canonicalEvaluation = canonical.samples?.evaluation_sample?.count;
  if ((!Number.isFinite(canonicalTraining) || !Number.isFinite(canonicalEvaluation)) && inferredSplits.length) {
    return inferredPopulationGraph(record, sources, targets, observations, inferredSplits);
  }
  const sourceShapeCandidates = observations.filter((item) => item.variable && observations.some((later) =>
    later.source.path === item.source.path
    && later.variable === item.variable
    && later.cell.index > item.cell.index
    && later.count < item.count));
  const sourceCount = canonical.samples?.source_data?.count ?? (Math.max(...sourceShapeCandidates.map((item) => item.count), 0) || null);
  const trainingObservation = splitCounts.find((item) => item.role === "training") || null;
  const evaluationObservation = splitCounts.find((item) => item.role === "evaluation") || null;
  const trainingCount = canonical.samples?.model_sample?.count ?? trainingObservation?.count ?? null;
  const evaluationCount = canonical.samples?.evaluation_sample?.count ?? evaluationObservation?.count ?? null;
  const inspectedCount = Number.isFinite(trainingCount) && Number.isFinite(evaluationCount) ? trainingCount + evaluationCount : null;
  const summaryNumbers = recordNumbers(`${canonical.data?.summary?.value || ""} ${canonical.data?.population_filters?.value || ""}`);
  const residentialCount = summaryNumbers.filter((value) => value < sourceCount && (!inspectedCount || value > inspectedCount)).sort((a, b) => b - a)[0]
    ?? observations.map((item) => item.count).filter((value) => value < sourceCount && (!inspectedCount || value > inspectedCount)).sort((a, b) => b - a)[0] ?? null;
  const pick = (count, condition = () => true) => observations.find((item) => item.count === count && condition(item)) || observations.find((item) => item.count === count) || null;
  const nodes = [];
  const relations = [];
  const add = (node) => { if (node && !nodes.some((item) => item.id === node.id)) nodes.push(node); return node; };
  const relate = (from, to, relation, predicate, evidenceIds, epistemic = "DERIVED") => {
    if (!from || !to || relations.some((item) => item.from === from.id && item.to === to.id && item.relation === relation)) return;
    relations.push({ id: stableId("APR", `${from.id}|${to.id}|${relation}`), from: from.id, to: to.id, relation, predicate, epistemic, evidence_ids: [...new Set(evidenceIds || [])] });
  };
  const sourceNode = Number.isFinite(sourceCount) ? add(populationNode({ role: "source", label: "Source rows", count: sourceCount, observation: pick(sourceCount), evidenceIds: canonical.samples?.source_data?.evidence_ids })) : null;
  const residentialNode = Number.isFinite(residentialCount) ? add(populationNode({ role: "eligible_population", label: /residential/i.test(canonical.data?.summary?.value || "") ? "Residential population" : "Eligible population", count: residentialCount, predicate: canonical.data?.population_filters?.value || null, observation: pick(residentialCount), evidenceIds: canonical.data?.summary?.evidence_ids })) : null;
  const inspectedObservation = Number.isFinite(inspectedCount) ? pick(inspectedCount, (item) => targets.some((target) => target.source_locators.some((locator) => locator.startsWith(`${item.source.path}#`)))) : null;
  const inspectedNode = Number.isFinite(inspectedCount) ? add(populationNode({ role: "labelled_population", label: /inspect/i.test(canonical.data?.summary?.value || "") ? "Inspected / labelled population" : "Labelled population", count: inspectedCount, predicate: canonical.data?.population_filters?.value || null, observation: inspectedObservation, evidenceIds: [...(canonical.samples?.model_sample?.evidence_ids || []), ...(canonical.samples?.evaluation_sample?.evidence_ids || [])], epistemic: inspectedObservation ? "OBSERVED" : "DERIVED", derivation: inspectedObservation ? null : { operation: "sum", operands: [trainingCount, evaluationCount] } })) : null;
  const splitEvidence = allCells(sources).filter(({ cell }) => /number of train|Train obs:/i.test(outputText(cell))).map(({ cell }) => cell.evidence_id);
  const trainingNode = Number.isFinite(trainingCount) ? add(populationNode({ role: "training", label: "Training population", count: trainingCount, predicate: canonical.results_evaluation?.evaluation_design?.value || null, observation: pick(trainingCount) || trainingObservation, evidenceIds: [...(canonical.samples?.model_sample?.evidence_ids || []), ...splitEvidence], targetIds: targets.map((item) => item.id) })) : null;
  const evaluationNode = Number.isFinite(evaluationCount) ? add(populationNode({ role: "evaluation", label: "Held-out evaluation population", count: evaluationCount, predicate: canonical.results_evaluation?.evaluation_design?.value || null, observation: pick(evaluationCount) || evaluationObservation, evidenceIds: [...(canonical.samples?.evaluation_sample?.evidence_ids || []), ...splitEvidence], targetIds: targets.map((item) => item.id) })) : null;
  relate(sourceNode, residentialNode, "filter", residentialNode?.predicate, residentialNode?.evidence_ids);
  relate(residentialNode, inspectedNode, "label_availability_filter", inspectedNode?.predicate, inspectedNode?.evidence_ids);
  relate(inspectedNode, trainingNode, "split", trainingNode?.predicate, trainingNode?.evidence_ids);
  relate(inspectedNode, evaluationNode, "split", evaluationNode?.predicate, evaluationNode?.evidence_ids);

  let intendedNode = null;
  const intendedText = `${canonical.purpose_scope?.population_scope?.value || ""} ${canonical.data?.population_limitation?.value || ""}`;
  if (residentialNode && inspectedNode && residentialNode.count >= inspectedNode.count && /remainder|uninspected|lacking observed/i.test(intendedText)) {
    intendedNode = add(populationNode({ role: "intended_prediction", label: "Intended unlabelled prediction population", count: residentialNode.count - inspectedNode.count,
      predicate: intendedText, evidenceIds: [...residentialNode.evidence_ids, ...inspectedNode.evidence_ids, ...(canonical.purpose_scope?.population_scope?.evidence_ids || [])], epistemic: "DERIVED",
      derivation: { operation: "difference", operands: [residentialNode.id, inspectedNode.id], expression: `${residentialNode.count} - ${inspectedNode.count}` }, targetIds: targets.map((item) => item.id) }));
    relate(residentialNode, intendedNode, "derived_remainder", "eligible minus labelled", intendedNode.evidence_ids);
  }

  const scoringReferences = [];
  for (const { source, cell } of allCells(sources)) for (const match of cell.source.matchAll(/\.predict_proba\s*\(\s*([A-Za-z_]\w*)/g)) if (!/test|train|valid/i.test(match[1])) scoringReferences.push({ source, cell, variable: match[1] });
  let scoringNode = null;
  if (scoringReferences.length) {
    const roots = scoringReferences.map((item) => item.variable.replace(/_predict.*$/i, ""));
    const scoringObservation = observations.find((item) => roots.includes(item.variable)) || observations.find((item) => item.count === residentialCount && /all/i.test(item.variable || ""));
    const scoringCount = scoringObservation?.count ?? residentialCount;
    if (Number.isFinite(scoringCount)) {
      scoringNode = add(populationNode({ role: "actual_scoring", label: "Actual scoring population in export code", count: scoringCount,
        predicate: "Rows supplied to a persisted prediction/export statement", observation: scoringObservation,
        evidenceIds: scoringReferences.map((item) => item.cell.evidence_id), targetIds: targets.map((item) => item.id) }));
      relate(residentialNode, scoringNode, "scoring_scope", "persisted scoring statement", scoringNode.evidence_ids, "OBSERVED");
    }
  }
  for (const target of targets) target.population_ids = nodes.filter((node) => !node.target_ids.length || node.target_ids.includes(target.id)).map((node) => node.id);
  const contexts = targets.map((target) => ({ id: stableId("APC", target.id), target_id: target.id, workstream_id: target.workstream_id, workstream: target.workstream, display_label: target.semantic_name, nodes, edges: relations, training_count: trainingNode?.count ?? null, evaluation_count: evaluationNode?.count ?? null, evidence_ids: [...new Set(nodes.flatMap((node) => node.evidence_ids))] }));
  return { nodes, edges: relations, relations, contexts, status: nodes.length ? "partial_or_complete" : "unavailable", roles: { source: sourceNode?.id, residential: residentialNode?.id, inspected: inspectedNode?.id, training: trainingNode?.id, evaluation: evaluationNode?.id, intended_prediction: intendedNode?.id, actual_scoring: scoringNode?.id } };
}

function buildPrevalence(sources, targets, populationGraph, diagnostics) {
  const observations = [];
  const byRole = (role) => populationGraph.nodes.find((node) => node.role === role);
  const add = ({ target, population, value, positiveCount = null, sourceLocator, evidenceIds, epistemic = "OBSERVED", derivation = null, role = "descriptive_prevalence" }) => {
    if (!target || !population || !Number.isFinite(value)) return;
    const item = { id: stableId("APV", `${target.id}|${population.id}|${value}|${sourceLocator}`), target_id: target.id, population_id: population.id,
      positive_count: Number.isFinite(positiveCount) ? positiveCount : null, denominator: population.count, value, role, derivation,
      epistemic, evidence_ids: [...new Set(evidenceIds || [])], source_locator: sourceLocator };
    if (!observations.some((existing) => existing.target_id === item.target_id && existing.population_id === item.population_id && Math.abs(existing.value - item.value) < 1e-12)) observations.push(item);
  };
  for (const source of sources) {
    const target = targetForSource(targets, source.path);
    if (!target) continue;
    for (const cell of source.cells || []) {
      const train = /y_train[^\n]*\.sum\s*\(/i.test(cell.source);
      const evaluation = /y_test[^\n]*\.sum\s*\(/i.test(cell.source);
      if (!train && !evaluation) continue;
      const values = firstStandaloneNumbers(outputText(cell));
      const tabular = numeric(outputText(cell).match(/^[A-Za-z_][\w ]+\s+([\d.]+)\s*$/m)?.[1]);
      const positiveCount = values[0] ?? tabular;
      const population = byRole(train ? "training" : "evaluation");
      if (population && Number.isFinite(positiveCount)) add({ target, population, value: positiveCount / population.count, positiveCount, sourceLocator: cell.locator, evidenceIds: [cell.evidence_id], role: train ? "training_prevalence" : "evaluation_prevalence" });
    }
  }
  for (const { cell } of allCells(sources)) {
    const formulas = [...cell.source.matchAll(/print\(\s*([A-Za-z_]\w*)\.([A-Za-z_][\w]*)\.sum\(\)\s*\/\s*\1\.shape\[0\]\s*\)/g)];
    if (!formulas.length) continue;
    const values = firstStandaloneNumbers(outputText(cell));
    formulas.forEach((formula, index) => {
      const target = targets.find((item) => item.source_field === formula[2]);
      const population = byRole("labelled_population");
      const value = values[index];
      if (target && population && Number.isFinite(value)) {
        const exactCount = value * population.count;
        const positiveCount = Math.abs(exactCount - Math.round(exactCount)) < 1e-7 ? Math.round(exactCount) : null;
        add({ target, population, value, positiveCount, sourceLocator: cell.locator, evidenceIds: [cell.evidence_id], role: "labelled_population_prevalence" });
      }
    });
  }
  for (const diagnostic of diagnostics.filter((item) => item.type === "confusion_matrix" && item.final && Number.isFinite(item.tp) && Number.isFinite(item.fn))) {
    const target = targets.find((item) => item.id === diagnostic.target_id);
    const population = byRole("evaluation");
    const positiveCount = diagnostic.tp + diagnostic.fn;
    if (population) add({ target, population, value: positiveCount / population.count, positiveCount, sourceLocator: diagnostic.source_locator, evidenceIds: diagnostic.evidence_ids, epistemic: "DERIVED", derivation: { operation: "confusion_matrix_positive_class", operands: [diagnostic.id] }, role: "evaluation_prevalence" });
  }
  for (const target of targets) {
    const full = observations.find((item) => item.target_id === target.id && item.role === "labelled_population_prevalence" && Number.isFinite(item.positive_count));
    const evaluation = observations.find((item) => item.target_id === target.id && item.role === "evaluation_prevalence" && Number.isFinite(item.positive_count));
    const trainingPopulation = byRole("training");
    if (full && evaluation && trainingPopulation && !observations.some((item) => item.target_id === target.id && item.role === "training_prevalence")) {
      const positiveCount = full.positive_count - evaluation.positive_count;
      add({ target, population: trainingPopulation, value: positiveCount / trainingPopulation.count, positiveCount,
        sourceLocator: full.source_locator, evidenceIds: [...full.evidence_ids, ...evaluation.evidence_ids], epistemic: "DERIVED",
        derivation: { operation: "positive_count_difference", operands: [full.id, evaluation.id] }, role: "training_prevalence" });
    }
  }
  return observations;
}

function buildBaselineRelations(prevalence, metrics) {
  const relations = [];
  for (const item of prevalence.filter((value) => value.role === "evaluation_prevalence")) for (const metric of metrics.filter((value) => value.target_id === item.target_id && value.population_id === item.population_id && value.evaluation_phase === "test" && ["average_precision", "pr_auc"].includes(value.metric))) relations.push({
    id: stableId("ABR", `${item.id}|${metric.id}`), prevalence_id: item.id, metric_id: metric.id, relation: "compatible_class_prevalence_comparator",
    qualification: metric.metric === "average_precision" ? "Positive-class prevalence is the no-ranking average-precision reference for the same evaluation population." : "Positive-class prevalence is a random-ranking precision-recall reference; trapezoidal PR AUC is not identical to average precision.",
    epistemic: "DERIVED", evidence_ids: [...new Set([...item.evidence_ids, ...metric.evidence_ids])],
  });
  return relations;
}

function affectedFields(expression) {
  const fields = [...String(expression || "").matchAll(/\[\s*["']([^"']+)["']\s*\]/g)].map((match) => match[1]);
  for (const match of String(expression || "").matchAll(/\b(?:on|subset)\s*=\s*["']([^"']+)["']/g)) fields.push(match[1]);
  for (const match of String(expression || "").matchAll(/\bcolumns\s*=\s*\[([^\]]+)\]/g)) fields.push(...quotedFields(match[1]));
  return [...new Set(fields.filter((value) => value.length < 180))];
}

function dataFormationStages(sources, targets) {
  const stages = [];
  const add = (cell, source, operationType, description, expression, extra = {}) => stages.push({
    id: stableId("ADF", `${cell.locator}|${operationType}|${expression}`), operation_type: operationType, description,
    affected_fields: affectedFields(expression), input_stage: extra.input_stage || null, output_stage: extra.output_stage || null,
    fit_scope: extra.fit_scope || null, value: extra.value ?? null, denominator_expression: extra.denominator_expression || null,
    order: cell.index, execution_count: cell.execution_count, workstream_id: streamIdentity(cell, source).id,
    epistemic: "OBSERVED", evidence_ids: [cell.evidence_id], source_locator: cell.locator, expression: clean(expression),
  });
  for (const source of sources) for (const cell of source.cells || []) {
    const code = cell.source || "";
    for (const match of code.matchAll(/([A-Za-z_]\w*(?:\[[^\n]+?\])?)\.fillna\s*\(\s*([^,\n)]+)/g)) {
      const value = clean(match[2]);
      add(cell, source, /median\s*\(/i.test(value) ? "median_imputation" : /^0(?:\.0)?$/.test(value) ? "zero_fill" : "categorical_or_fixed_fill", `Fill missing values in ${clean(match[1])}`, match[0], { value });
    }
    for (const match of code.matchAll(/([A-Za-z_]\w*(?:\[[^\n]+?\])?)\.map\s*\(\s*([^\n)]+)/g)) add(cell, source, "value_mapping", `Map values in ${clean(match[1])}`, match[0], { value: clean(match[2]) });
    for (const match of code.matchAll(/([A-Za-z_]\w*)\s*=\s*\1\s*\[[^\n]+\]/g)) add(cell, source, "filter", `Filter ${match[1]} using a persisted predicate`, match[0], { input_stage: match[1], output_stage: match[1] });
    for (const match of code.matchAll(/([A-Za-z_]\w*)\s*=\s*([A-Za-z_]\w*)\s*\[[^\n]+\]/g)) if (match[1] !== match[2]) add(cell, source, "filter_or_projection", `Form ${match[1]} from ${match[2]} using a persisted predicate or projection`, match[0], { input_stage: match[2], output_stage: match[1] });
    for (const match of code.matchAll(/([A-Za-z_]\w*)\s*=\s*(?:pd\.)?merge\s*\(([^\n]+)|([A-Za-z_]\w*)\.merge\s*\(([^\n]+)/g)) add(cell, source, "join", "Join persisted analytical sources", match[0], { output_stage: match[1] || null });
    for (const match of code.matchAll(/(?:np\.)?(log10|log)\s*\(([^)]+)\)/g)) add(cell, source, "log_transformation", `Apply ${match[1]} transformation`, match[0], { input_stage: clean(match[2]) });
    for (const match of code.matchAll(/([A-Za-z_]\w*(?:\.[A-Za-z_]\w*|\[[^\n]+?\])?)\s*\[([^\]]*[<>]=?[^\]]*)\]\s*=\s*(-?\d+(?:\.\d+)?)/g)) add(cell, source, "invalid_or_range_replacement", `Replace values meeting ${clean(match[2])}`, match[0], { value: numeric(match[3]) });
    for (const match of code.matchAll(/pd\.get_dummies\s*\(([^)]+)\)/g)) add(cell, source, "categorical_encoding", `One-hot encode ${clean(match[1])}`, match[0]);
    for (const match of code.matchAll(/([A-Za-z_]\w*(?:\[[^\n]+?\])?)\s*(?:\/=|=\s*[^\n]+?\/)\s*2(?:\.0)?\b/g)) add(cell, source, "duplicate_correction", `Correct a duplicated persisted count in ${clean(match[1])}`, match[0], { value: 2 });
    for (const match of code.matchAll(/([A-Za-z_]\w*)\.drop\s*\(([^\n]+)\)/g)) add(cell, source, "field_or_row_removal", `Remove persisted rows or fields from ${match[1]}`, match[0]);
    for (const match of code.matchAll(/([A-Za-z_]\w*)\.fit\s*\(\s*([A-Za-z_]\w*)/g)) {
      const fitScope = /train/i.test(match[2]) ? "training" : /test|eval|valid/i.test(match[2]) ? "evaluation" : "unresolved";
      const estimatorDefined = (source.cells || []).slice(0, cell.index + 1).reverse().find((item) => new RegExp(`\\b${match[1]}\\s*=\\s*(?:StandardScaler|[^\\n]*Scaler)`).test(item.source));
      if (estimatorDefined) add(cell, source, "preprocessor_fit", `Fit ${match[1]} on ${match[2]}`, match[0], { fit_scope: fitScope, input_stage: match[2] });
    }
    for (const target of targets.filter((item) => item.source_locators.includes(cell.locator))) add(cell, source, "target_construction", `Construct target ${target.semantic_name}`, target.construction_rule || target.source_field, { output_stage: target.source_field });
  }
  return stages.filter((item, index, all) => all.findIndex((other) => other.id === item.id) === index).sort((a, b) => a.source_locator.localeCompare(b.source_locator) || a.order - b.order);
}

function buildMissingness(sources, populationGraph) {
  const items = [];
  const shapes = shapeObservations(sources);
  for (const source of sources) for (const cell of source.cells || []) {
    const context = (populationGraph.contexts || []).find((item) => String(item.split_source_locator || "").split("#cell-")[0] === source.path)
      || (populationGraph.contexts || []).find((item) => item.workstream_id === streamIdentity(cell, source).id)
      || null;
    const workstreamId = context?.workstream_id || streamIdentity(cell, source).id;
    if (/number_distinct\s+number_nan/i.test(outputText(cell))) {
      const variable = cell.source.match(/(?:getDfSummary|describe)\s*\(\s*([A-Za-z_]\w*)/)?.[1] || null;
      const rows = outputText(cell).split(/\r?\n/).map((line) => line.match(/^\s*(.+?)\s+([\d,]+)\s+([\d,]+)\s*$/)).filter(Boolean)
        .map((match) => ({ field: clean(match[1]), distinct: numeric(match[2]), missing: numeric(match[3]) }));
      const completeMissing = rows.filter((row) => row.distinct === 0 && Number.isFinite(row.missing) && row.missing > 0);
      const denominator = completeMissing.length ? Math.max(...completeMissing.map((row) => row.missing)) : null;
      const population = Number.isFinite(denominator) ? populationGraph.nodes.find((node) => node.count === denominator) : null;
      if (Number.isFinite(denominator) && denominator > 0) for (const row of rows.filter((item) => Number.isFinite(item.missing) && item.missing >= 0 && item.missing <= denominator)) {
        items.push({ id: stableId("AMO", `${cell.locator}|${row.field}|${row.missing}|${denominator}`), target_id: context?.target_id || null, workstream_id: workstreamId,
          field: row.field, value: row.missing / denominator * 100, unit: "percent", numerator: row.missing, denominator,
          denominator_expression: variable ? `${variable} persisted summary` : "persisted summary denominator",
          population_id: population?.id || null, pipeline_stage: { after_locator: cell.locator, population_count: denominator },
          denominator_consistency: population ? "compatible_or_not_applicable" : "denominator_observed_population_unlinked",
          epistemic: "DERIVED", evidence_ids: [cell.evidence_id], source_locator: cell.locator });
      }
    }
    const expressions = [...cell.source.matchAll(/(?:[A-Za-z_]\w*\[\s*["']([^"']+)["']\s*\]|[A-Za-z_]\w*\.([A-Za-z_]\w*))\.(?:isna|isnull)\(\)\.sum\(\)([^\n]*)/g)];
    if (!expressions.length) continue;
    const outputNumbers = outputText(cell).split(/\r?\n/).map((line) => numeric(line.trim().match(/(-?\d+(?:\.\d+)?(?:e[-+]?\d+)?)\s*$/i)?.[1])).filter(Number.isFinite);
    const priorShape = shapes.filter((item) => item.source.path === source.path && item.cell.index < cell.index).sort((a, b) => b.cell.index - a.cell.index)[0] || null;
    expressions.forEach((expression, index) => {
      const suffix = expression[3] || "";
      const denominatorExpression = suffix.match(/\/\s*([^*+\-\n]+)/)?.[1]?.trim() || null;
      const dynamicDenominator = denominatorExpression?.match(/^([A-Za-z_]\w*)\.shape\[0\]$/)?.[1];
      const denominator = dynamicDenominator && priorShape?.variable === dynamicDenominator ? priorShape.count : denominatorExpression ? numeric(denominatorExpression) : null;
      const unit = /\*\s*100|percent|percentage/i.test(`${suffix}\n${cell.source}`) ? "percent" : "count";
      const value = outputNumbers[index];
      if (!Number.isFinite(value)) return;
      const compatiblePopulation = Number.isFinite(denominator) ? populationGraph.nodes.find((node) => node.count === denominator) : priorShape ? populationGraph.nodes.find((node) => node.count === priorShape.count) : null;
      items.push({ id: stableId("AMO", `${cell.locator}|${expression[1] || expression[2]}|${value}`), field: expression[1] || expression[2], value, unit,
        numerator: unit === "count" ? value : null, denominator, denominator_expression: denominatorExpression, population_id: compatiblePopulation?.id || null,
        pipeline_stage: priorShape ? { after_locator: priorShape.cell.locator, population_count: priorShape.count } : { after_locator: null, population_count: null },
        denominator_consistency: denominatorExpression && !compatiblePopulation ? "unresolved_or_inconsistent" : "compatible_or_not_applicable",
        epistemic: "OBSERVED", evidence_ids: [cell.evidence_id], source_locator: cell.locator });
    });
  }
  return items.filter((item, index, all) => all.findIndex((other) => other.field === item.field && other.value === item.value && other.source_locator === item.source_locator) === index);
}

function featureEncodingFamily(raw, formationStages) {
  return formationStages.filter((item) => item.operation_type === "categorical_encoding")
    .flatMap((stage) => (stage.affected_fields || []).map((field) => ({ field, stage, score: overlap(raw, field) })))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)[0] || null;
}

function malformedFeatureCategory(value) {
  const label = clean(value);
  return !label || label.length < 3 || /^[A-Za-z]\s+\S/.test(label) || /^(?:nan|null|undefined)$/i.test(label);
}

function displayFeatureLabel(raw, formationStages = []) {
  const match = String(raw || "").match(/^([A-Za-z][A-Za-z0-9 _-]*?)__+(.+)$/);
  if (match) return malformedFeatureCategory(match[2]) ? `${humanize(match[1])} category · unresolved label` : `${humanize(match[1])}: ${clean(match[2])}`;
  const singleEncoded = String(raw || "").match(/^([A-Za-z][A-Za-z0-9 ]*?)_([A-Z][A-Z0-9 _-]+)$/);
  if (singleEncoded) return `${humanize(singleEncoded[1])}: ${clean(singleEncoded[2]).toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase())}`;
  const family = featureEncodingFamily(raw, formationStages);
  return malformedFeatureCategory(raw) && family ? `${humanize(family.field)} category · unresolved label` : clean(raw);
}

function resolvedColumnsBefore(source, variable, beforeIndex, visited = new Set()) {
  const key = `${variable}|${beforeIndex}`;
  if (!variable || visited.has(key)) return null;
  visited.add(key);
  const cells = (source.cells || []).filter((cell) => cell.index <= beforeIndex).sort((a, b) => b.index - a.index);
  const escaped = variable.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  for (const cell of cells) {
    const code = String(cell.source || "");
    const projection = code.match(new RegExp(`\\b${escaped}\\s*=\\s*([A-Za-z_]\\w*)\\s*\\[\\s*\\[([\\s\\S]*?)\\]\\s*\\]`));
    if (projection) {
      const columns = quotedFields(projection[2]);
      if (columns.length) return { columns, evidence_ids: [cell.evidence_id], locators: [cell.locator] };
    }
    const dataframe = code.match(new RegExp(`\\b${escaped}\\s*=\\s*pd\\.DataFrame\\s*\\([\\s\\S]*?columns\\s*=\\s*\\[([\\s\\S]*?)\\]`));
    if (dataframe) {
      const columns = quotedFields(dataframe[1]);
      if (columns.length) return { columns, evidence_ids: [cell.evidence_id], locators: [cell.locator] };
    }
    const dropped = code.match(new RegExp(`\\b${escaped}\\s*=\\s*([A-Za-z_]\\w*)\\.drop\\s*\\(([\\s\\S]*?)\\)`));
    if (dropped) {
      const parent = resolvedColumnsBefore(source, dropped[1], cell.index, visited);
      if (!parent) continue;
      const removed = new Set(quotedFields(dropped[2]));
      return { columns: parent.columns.filter((column) => !removed.has(column)), evidence_ids: [...new Set([...parent.evidence_ids, cell.evidence_id])], locators: [...new Set([...parent.locators, cell.locator])] };
    }
    for (const split of code.matchAll(/^\s*([A-Za-z_]\w*)\s*,\s*([A-Za-z_]\w*)\s*,\s*([A-Za-z_]\w*)\s*,\s*([A-Za-z_]\w*)\s*=\s*[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)?\s*\(([^\n]+)/gm)) {
      if (!split.slice(1, 5).includes(variable)) continue;
      const parentVariable = topLevelParts(split[5])[0]?.match(/^([A-Za-z_]\w*)/)?.[1];
      const parent = resolvedColumnsBefore(source, parentVariable, cell.index, visited);
      if (parent) return { ...parent, evidence_ids: [...new Set([...parent.evidence_ids, cell.evidence_id])], locators: [...new Set([...parent.locators, cell.locator])] };
    }
  }
  return null;
}

function modelInputFeatureUsage(sources, targets, runs, formationStages = []) {
  const values = [];
  for (const run of runs) {
    const source = sources.find((item) => item.path === run.source_path);
    const target = targets.find((item) => item.id === run.target_id);
    const input = run.fit_inputs?.[0];
    if (!source || !target || !input) continue;
    const resolved = resolvedColumnsBefore(source, input, cellNumber(run.source_locator));
    if (!resolved?.columns?.length) continue;
    resolved.columns.forEach((feature, index) => {
      const encoded = String(feature).match(/^([A-Za-z][A-Za-z0-9 ]*?)_(?:[A-Z][A-Z0-9 _-]+)$/);
      values.push({ id: stableId("AFE", `${run.id}|feature_usage|${feature}`), target_id: target.id, workstream_id: target.workstream_id,
        workstream: target.workstream, target_name: target.semantic_name, model_run_id: run.id, method: run.method,
        estimator_variant: run.roles.includes("final_evaluated") ? "final" : run.roles.includes("held_out_untuned") ? "untuned" : "unresolved",
        feature, raw_feature: feature, source_feature: encoded?.[1] || feature, display_label: displayFeatureLabel(feature, formationStages),
        evidence_type: "feature_usage", value: null, rank: index + 1, direction: null,
        interpretation_boundary: "The feature is present in the recorded model input. Relative importance and causal influence are not established.",
        epistemic: "DERIVED", evidence_ids: [...new Set([...run.evidence_ids, ...resolved.evidence_ids])], source_locator: run.source_locator });
    });
  }
  return values;
}

function buildFeatureEvidence(targets, runs, legacyFeatures, artefacts = [], formationStages = [], sources = []) {
  const importanceValues = legacyFeatures.map((feature) => {
    const target = targets.find((item) => item.workstream_id === feature.workstream_id);
    const run = target ? methodRunFor({ target, method: feature.method, locator: feature.source_locator, runs, role: "feature_producing" }) || methodRunFor({ target, method: feature.method, locator: feature.source_locator, runs }) : null;
    const family = featureEncodingFamily(feature.feature, formationStages);
    const displayLabel = displayFeatureLabel(feature.feature, formationStages);
    return { ...feature, id: stableId("AFE", `${feature.id}|typed`), target_id: target?.id || null, model_run_id: run?.id || null,
      estimator_variant: run?.roles.includes("final_evaluated") ? "final" : run?.roles.includes("held_out_untuned") ? "untuned" : "unresolved",
      target_name: target?.semantic_name || null, raw_feature: feature.feature, display_label: displayLabel,
      provenance: { raw_identity_preserved: true, causal_interpretation: false, source_family: family?.field || null, source_family_stage_id: family?.stage?.id || null,
        label_resolution: displayLabel === clean(feature.feature) ? "raw_label_retained" : displayLabel.includes("unresolved label") ? "bounded_family_fallback" : "encoded_category_humanised" } };
  });
  const importanceRunIds = new Set(importanceValues.map((item) => item.model_run_id).filter(Boolean));
  const usageValues = modelInputFeatureUsage(sources, targets, runs, formationStages).filter((item) => !importanceRunIds.has(item.model_run_id));
  const values = [...importanceValues, ...usageValues];
  const groups = new Map();
  for (const value of values) {
    const key = `${value.target_id}|${value.model_run_id}|${value.evidence_type}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(value);
  }
  const sets = [...groups.entries()].map(([key, features]) => {
    const relatedArtefacts = artefacts.filter((item) => overlap(item.path, `${features[0].workstream} feature importance`) >= 0.2).map((item) => item.id);
    return { id: stableId("AFS", key), target_id: features[0].target_id, target_name: features[0].target_name, model_run_id: features[0].model_run_id, method: features[0].method,
      estimator_variant: features[0].estimator_variant, evidence_type: features[0].evidence_type, feature_ids: features.map((item) => item.id), artefact_ids: relatedArtefacts,
      interpretation_boundary: features[0].evidence_type === "feature_usage"
        ? "The recorded input fields establish feature use, not relative importance or causality."
        : "Model feature importance describes fitted model reliance and does not establish causality.", epistemic: features[0].evidence_type === "feature_usage" ? "DERIVED" : "OBSERVED",
      evidence_ids: [...new Set(features.flatMap((item) => item.evidence_ids))] };
  });
  return { values, sets };
}

function buildOutputs(sources, targets, runs, artefacts = []) {
  const statements = [];
  for (const source of sources) {
    const target = targetForSource(targets, source.path);
    const producers = new Map();
    const assignedColumns = new Map();
    for (const cell of source.cells || []) {
      for (const match of cell.source.matchAll(/^\s*([A-Za-z_]\w*)\s*=\s*(?:pd\.DataFrame\s*\()?([A-Za-z_]\w*)\.predict(?:_proba)?\s*\(\s*([A-Za-z_]\w*)/gm)) {
        if (/test|train|valid|eval/i.test(match[3])) continue;
        const run = [...runs].reverse().find((item) => item.source_path === source.path && item.estimator_variable === match[2] && cellNumber(item.source_locator) <= cell.index);
        if (run) { producers.set(match[1], { run, scoring_variable: match[3], locator: cell.locator, evidence_id: cell.evidence_id }); run.roles = [...new Set([...run.roles, "export_producing"])]; }
      }
      for (const match of cell.source.matchAll(/([A-Za-z_]\w*)\[\s*["']([^"']+)["']\s*\]\s*=\s*([A-Za-z_]\w*)\s*\[/g)) assignedColumns.set(match[1], { column: match[2], producer_variable: match[3], locator: cell.locator, evidence_id: cell.evidence_id });
      for (const match of cell.source.matchAll(/(?:([A-Za-z_]\w*)\s*\[\s*\[([^\]]+)\]\s*\]|([A-Za-z_]\w*))\.to_csv\s*\(\s*[rRuUbBfF]*["']([^"']+)["']/g)) {
        const dataframe = match[1] || match[3];
        const selectedColumns = match[2] ? quotedFields(match[2]) : [];
        const assignment = assignedColumns.get(dataframe);
        const producer = assignment ? producers.get(assignment.producer_variable) : [...producers.values()].at(-1) || null;
        const persisted = artefacts.find((item) => item.path === match[4] || item.path.endsWith(`/${match[4]}`)) || null;
        const consistency = assignment && selectedColumns.length && !selectedColumns.includes(assignment.column) ? "assigned_column_not_selected" : "no_structural_mismatch_detected";
        statements.push({ id: stableId("AOS", `${cell.locator}|${match[4]}`), target_id: target?.id || null, output_type: target ? "prediction_export" : "analytical_data_export",
          producer_model_run_id: producer?.run?.id || null, producer_method: producer?.run?.method || null, scoring_variable: producer?.scoring_variable || null,
          assigned_prediction_column: assignment?.column || null, selected_export_columns: selectedColumns, target_path: match[4], persisted_artefact_id: persisted?.id || null,
          artefact_existence: persisted ? "persisted" : "referenced_not_persisted", execution_state: Number.isInteger(cell.execution_count) ? "persisted_execution_count" : "not_established",
          consistency, execution_count: cell.execution_count, epistemic: "OBSERVED", evidence_ids: [...new Set([cell.evidence_id, assignment?.evidence_id, producer?.evidence_id].filter(Boolean))], source_locator: cell.locator });
      }
    }
  }
  return statements;
}

function metricKey(value) {
  const label = clean(value).toLowerCase();
  if (/precision.?recall|\bpr\s*auc/.test(label)) return "pr_auc";
  if (/average precision/.test(label)) return "average_precision";
  if (/roc/.test(label) && /auc|area/.test(label)) return "roc_auc";
  if (/accuracy/.test(label)) return "accuracy";
  if (/recall/.test(label)) return "recall";
  if (/precision/.test(label)) return "precision";
  if (/f1|f score/.test(label)) return "f1";
  return null;
}

function persistedPrecision(value) {
  return String(value?.display_value ?? "").match(/\.(\d+)/)?.[1]?.length ?? 0;
}

function roundedMatch(expected, actual, precision) {
  if (!Number.isFinite(expected) || !Number.isFinite(actual)) return false;
  if (precision >= 8) return Math.abs(expected - actual) <= 1e-12;
  return Number(actual.toFixed(precision)) === Number(expected.toFixed(precision));
}

function canonicalTarget(canonical, targets) {
  return targets.map((target) => ({ target, score: overlap(canonical?.task_target || "", `${target.semantic_name} ${target.workstream} ${target.source_field}`) })).sort((a, b) => b.score - a.score)[0]?.target || null;
}

function strictEvidenceBindings(record, targets, metrics, diagnostics) {
  const reconstruction = record?.reconstruction?.results_evaluation;
  if (!reconstruction || !targets.length) return [];
  const fields = [{ field: "primary_result", role: "primary", value: reconstruction.primary_result }, ...(reconstruction.material_results || []).map((value, index) => ({ field: `material_results.${index}`, role: "material", value }))];
  const bindings = [];
  for (const field of fields) {
    const canonical = field.value;
    const target = canonicalTarget(canonical, targets);
    const method = methodName(canonical?.method);
    const key = metricKey(canonical?.metric);
    const displayed = String(canonical?.display_value || "");
    const displayedNumber = numeric(displayed.match(/-?\d+(?:\.\d+)?/)?.[0]);
    const expected = Number.isFinite(displayedNumber) && /%/.test(displayed) ? displayedNumber / 100 : displayedNumber;
    const countComponent = /true positives?/i.test(canonical?.metric || "") ? "tp" : /false negatives?/i.test(canonical?.metric || "") ? "fn" : /true negatives?/i.test(canonical?.metric || "") ? "tn" : /false positives?/i.test(canonical?.metric || "") ? "fp" : null;
    if (countComponent) {
      const candidate = diagnostics.filter((item) => item.target_id === target?.id && methodName(item.method) === method && !item.final && item.dimension === "count_matrix" && item[countComponent] === expected)
        .sort((a, b) => Number(Boolean(canonical.evidence_ids?.some((id) => a.evidence_ids.includes(id)))) - Number(Boolean(canonical.evidence_ids?.some((id) => b.evidence_ids.includes(id))))).at(-1) || null;
      bindings.push({ id: stableId("AEB", field.field), canonical_field: field.field, canonical_role: field.role, status: candidate ? "bound" : "rejected", object_type: "DiagnosticObservation", object_id: candidate?.id || null,
        component: countComponent, dimension: "count", rejection: candidate ? null : "compatible_diagnostic_identity_not_established", compatibility: candidate ? ["target", "method", "variant", "dimension", "exact_count", "evidence"] : [], evidence_ids: [...new Set([...(canonical?.evidence_ids || []), ...(candidate?.evidence_ids || [])])] });
      continue;
    }
    const precision = persistedPrecision(canonical);
    const candidate = metrics.filter((item) => item.target_id === target?.id && methodName(item.method) === method && item.metric === key && item.dimension === "rate" && roundedMatch(expected, item.value, precision)
      && (!/held.?out|test/i.test(canonical?.evaluation_context || "") || item.evaluation_phase === "test"))
      .sort((a, b) => Number(Boolean(canonical.evidence_ids?.some((id) => a.evidence_ids.includes(id)))) - Number(Boolean(canonical.evidence_ids?.some((id) => b.evidence_ids.includes(id))) ) || Number(a.final) - Number(b.final)).at(-1) || null;
    bindings.push({ id: stableId("AEB", field.field), canonical_field: field.field, canonical_role: field.role, status: candidate ? "bound" : "rejected", object_type: "MetricObservation", object_id: candidate?.id || null,
      dimension: "rate", rejection: candidate ? null : "strict_analytical_identity_not_established", compatibility: candidate ? ["target", "method", "metric", "dimension", "phase", precision >= 8 ? "exact_value" : "persisted_precision", "evidence"] : [], evidence_ids: [...new Set([...(canonical?.evidence_ids || []), ...(candidate?.evidence_ids || [])])] });
  }
  return bindings;
}

function metricPriority(record) {
  for (const evidence of record?.evidence || []) {
    const text = evidence.excerpt || "";
    if (/area under (?:the )?precision.?recall curve|precision.?recall (?:curve )?(?:area|auc)/i.test(text)) return { metric: "pr_auc", direction_of_better: "higher", evidence_ids: [evidence.id], source: "persisted_project_documentation" };
    if (/optim(?:ize|ise|ized|ised)[\s\S]{0,160}average precision|primary metric[\s\S]{0,80}average precision/i.test(text)) return { metric: "average_precision", direction_of_better: "higher", evidence_ids: [evidence.id], source: "persisted_project_documentation" };
    if (/primary metric[\s\S]{0,80}roc.?auc/i.test(text)) return { metric: "roc_auc", direction_of_better: "higher", evidence_ids: [evidence.id], source: "persisted_project_documentation" };
  }
  return null;
}

function bestFinalResult(record, targets, comparisons, bindings, populationGraph) {
  const canonical = record?.reconstruction?.results_evaluation?.primary_result;
  const primaryBinding = bindings.find((item) => item.canonical_role === "primary" && item.status === "bound");
  const boundObservation = comparisons.flatMap((set) => set.results).find((item) => item.id === primaryBinding?.object_id) || null;
  const boundTargetId = boundObservation?.target_id;
  const focalTarget = targets.find((item) => item.id === boundTargetId) || canonicalTarget(canonical, targets);
  const priority = metricPriority(record);
  const sets = comparisons.filter((set) => set.target_id === focalTarget?.id && set.estimator_variant === "final" && set.evaluation_phase === "test");
  const candidates = priority ? sets.flatMap((set) => set.results).filter((item) => item.metric === priority.metric && item.final && item.evaluation_phase === "test" && !/no skill|baseline/i.test(item.method)) : [];
  const direction = priority?.direction_of_better;
  const selected = candidates.sort((a, b) => direction === "lower" ? a.value - b.value : b.value - a.value)[0] || null;
  if (selected && focalTarget) {
    const evaluation = populationGraph.nodes.find((item) => item.role === "evaluation");
    return { state: "established", selection_mode: "best_final_result", metric_priority: priority, analytical_result_id: selected.id, target_id: focalTarget.id,
      raw_value: selected.value, display_value: String(selected.value), display_precision: selected.persisted_precision || 3, metric: selected.metric_label, metric_key: selected.metric,
      method: selected.method, task_target: focalTarget.semantic_name, evaluation_context: `held-out evaluation${evaluation ? ` · ${evaluation.count} ${evaluation.unit}` : ""}`,
      evaluation_population_id: evaluation?.id || null, evaluation_attempt_id: selected.evaluation_attempt_id || null, model_run_id: selected.model_run_id,
      estimator_variant: selected.estimator_variant, score_input: selected.score_input, computation: selected.computation, direction_of_better: selected.direction_of_better,
      epistemic: "DERIVED", evidence_ids: [...new Set([...selected.evidence_ids, ...priority.evidence_ids])], source_locator: selected.source_locator };
  }
  if (canonical?.state !== "established") return null;
  return {
    ...canonical,
    selection_mode: "canonical_primary_fallback",
    analytical_result_id: boundObservation?.id || null,
    target_id: boundObservation?.target_id || focalTarget?.id || null,
    model_run_id: boundObservation?.model_run_id || null,
    evaluation_attempt_id: boundObservation?.evaluation_attempt_id || null,
    raw_value: boundObservation?.value ?? numeric(canonical.display_value),
    display_precision: boundObservation?.persisted_precision || Math.min(6, persistedPrecision(canonical)),
    metric_key: boundObservation?.metric || metricKey(canonical.metric),
    estimator_variant: boundObservation?.estimator_variant || null,
    score_input: boundObservation?.score_input || null,
    computation: boundObservation?.computation || null,
    direction_of_better: boundObservation?.direction_of_better || null,
    source_locator: boundObservation?.source_locator || null,
    evidence_ids: [...new Set([...(canonical.evidence_ids || []), ...(boundObservation?.evidence_ids || [])])],
    metric_priority: null,
  };
}

function focalLimitation(best, limitations) {
  if (!best || best.selection_mode !== "best_final_result") return null;
  const precedence = [
    (item) => item.subject_type === "MetricObservation" && item.subject_id === best.analytical_result_id,
    (item) => item.subject_type === "EvaluationAttempt" && item.subject_id === best.evaluation_attempt_id,
    (item) => item.subject_type === "PopulationNode" && item.subject_id === best.evaluation_population_id,
    (item) => item.subject_type === "TargetDefinition" && item.subject_id === best.target_id,
    (item) => ["IntendedUse", "Project", "Claim"].includes(item.subject_type),
  ];
  for (let rank = 0; rank < precedence.length; rank += 1) {
    const limitation = limitations.find(precedence[rank]);
    if (limitation) return { ...limitation, applicability_rank: rank + 1 };
  }
  return null;
}

function focalField(value, evidenceIds, extra = {}) {
  return { state: value ? "established" : "not_established", value: value || "Not established from compatible focal evidence.", epistemic: value ? "DERIVED" : "UNRESOLVED", evidence_ids: [...new Set(evidenceIds || [])], ...extra };
}

export function buildFocalResultsEvaluation(best, { targets = [], runs = [], attempts = [], populationGraph = { nodes: [] }, limitations = [] } = {}) {
  if (!best || best.selection_mode !== "best_final_result") return null;
  const target = targets.find((item) => item.id === best.target_id) || null;
  const run = runs.find((item) => item.id === best.model_run_id) || null;
  const attempt = attempts.find((item) => item.id === best.evaluation_attempt_id) || null;
  const evaluation = populationGraph.nodes.find((item) => item.id === best.evaluation_population_id) || null;
  const training = populationGraph.nodes.find((item) => item.role === "training") || null;
  const limitation = focalLimitation(best, limitations);
  const evidenceIds = [...new Set([...(best.evidence_ids || []), ...(target?.evidence_ids || []), ...(run?.evidence_ids || []), ...(attempt?.evidence_ids || []), ...(evaluation?.evidence_ids || [])])];
  const evaluationDescription = target && evaluation
    ? `${best.method} was evaluated for ${target.semantic_name} on a held-out sample of ${evaluation.count} ${evaluation.unit}${training ? ` after fitting on ${training.count} training ${training.unit}` : ""}.`
    : null;
  const establishes = target && evaluation
    ? `${best.method} achieved ${best.display_value} ${best.metric} for ${target.semantic_name} on the held-out evaluation sample of ${evaluation.count} ${evaluation.unit}.`
    : null;
  const limitationEvidence = limitation?.evidence_ids || [];
  return {
    state: "established", focal_result_id: best.analytical_result_id, best_final_result: best,
    target_id: target?.id || null, model_run_id: run?.id || null, evaluation_attempt_id: attempt?.id || best.evaluation_attempt_id || null,
    evaluation_population_id: evaluation?.id || null, applicable_limitation_id: limitation?.id || null,
    evaluation_design: focalField(evaluationDescription, evidenceIds, { object_ids: [run?.id, attempt?.id, target?.id, evaluation?.id].filter(Boolean) }),
    evaluation_sample: evaluation ? focalField(`${evaluation.count} held-out ${evaluation.unit}`, evaluation.evidence_ids, { count: evaluation.count, unit: evaluation.unit, population_id: evaluation.id }) : focalField(null, []),
    result: best,
    method: focalField(best.method, [...(run?.evidence_ids || []), ...(best.evidence_ids || [])], { model_run_id: run?.id || null }),
    target: focalField(target?.semantic_name, target?.evidence_ids || [], { target_id: target?.id || null }),
    known_limitation: focalField(limitation?.observed_fact || null, limitationEvidence, { limitation_id: limitation?.id || null, limitation_kind: limitation?.kind || null, subject_type: limitation?.subject_type || null, applicability_rank: limitation?.applicability_rank || null }),
    establishes: focalField(establishes, evidenceIds),
    does_not_establish: focalField(limitation?.bounded_interpretation || limitation?.derived_relationship || null, limitationEvidence, { limitation_id: limitation?.id || null }),
    epistemic: "DERIVED", evidence_ids: [...new Set([...evidenceIds, ...limitationEvidence])],
  };
}

function buildSelectionStatements(sources, targets, comparisons, featureSets, outputs) {
  const statements = [];
  for (const set of comparisons) for (const metric of set.metrics) {
    const candidates = set.results.filter((item) => item.metric === metric.key && !/no skill|baseline/i.test(item.method));
    const best = candidates.sort((a, b) => metric.direction_of_better === "lower" ? a.value - b.value : b.value - a.value)[0];
    if (best) statements.push({ id: stableId("ASS", `${set.id}|${metric.key}`), type: "best_final_on_metric", status: "established", target_id: set.target_id, metric: metric.key, model_run_id: best.model_run_id, method: best.method, value: best.value, evidence_ids: best.evidence_ids, epistemic: "DERIVED" });
  }
  for (const source of sources) for (const cell of source.cells || []) if (/best model/i.test(`${cell.heading?.label || ""}\n${cell.source}`)) {
    const target = targetForSource(targets, source.path);
    const feature = featureSets.find((item) => item.target_id === target?.id);
    statements.push({ id: stableId("ASS", `${cell.locator}|best-label`), type: "explicit_best_label", status: feature ? "established" : "unresolved", target_id: target?.id || null, model_run_id: feature?.model_run_id || null,
      scope: "feature_output_heading", claim: clean(cell.heading?.label || cell.source), epistemic: "OBSERVED", evidence_ids: [cell.evidence_id], source_locator: cell.locator });
  }
  for (const output of outputs.filter((item) => item.output_type === "prediction_export")) statements.push({ id: stableId("ASS", `${output.id}|export`), type: "export_producing_model", status: output.producer_model_run_id ? "established" : "unresolved", target_id: output.target_id, model_run_id: output.producer_model_run_id, method: output.producer_method, output_id: output.id, epistemic: "OBSERVED", evidence_ids: output.evidence_ids });
  statements.push({ id: stableId("ASS", "project-selected-model"), type: "project_selected_model", status: "unresolved", reason: "No explicit persisted final model-selection decision was reconstructed." });
  return statements;
}

function scopedLimitations(record, targets, populationGraph, stages, searches, metrics, outputs) {
  const limitations = [];
  const add = (subjectType, subjectId, kind, observed, derived, interpreted, evidenceIds) => limitations.push({ id: stableId("ASL", `${subjectType}|${subjectId}|${kind}|${observed}`), subject_type: subjectType, subject_id: subjectId, kind,
    observed_fact: observed, derived_relationship: derived || null, bounded_interpretation: interpreted || null, epistemic_chain: ["OBSERVED", ...(derived ? ["DERIVED"] : []), ...(interpreted ? ["INTERPRETED"] : [])], evidence_ids: [...new Set(evidenceIds || [])] });
  const fits = stages.filter((item) => item.operation_type === "preprocessor_fit");
  for (const group of new Set(fits.map((item) => item.expression.match(/^([A-Za-z_]\w*)/)?.[1]).filter(Boolean))) {
    const scoped = fits.filter((item) => item.expression.startsWith(`${group}.`) || item.description.includes(group));
    if (scoped.some((item) => item.fit_scope === "training") && scoped.some((item) => item.fit_scope === "evaluation")) add("DataFormationStage", scoped[0].id, "preprocessing_fit_scope", `${group} is fitted separately on training and evaluation inputs.`, "One fitted preprocessing state is not shared across the split.", "Evaluation inputs are transformed with parameters learned from the evaluation population.", scoped.flatMap((item) => item.evidence_ids));
  }
  for (const metric of metrics.filter((item) => item.metric === "average_precision" && item.score_input === "hard_label")) add("MetricObservation", metric.id, "hard_label_average_precision", "average_precision_score receives hard class predictions.", "The observation is threshold-dependent rather than a ranking summary.", "It does not by itself establish prioritisation quality across ranked properties.", metric.evidence_ids);
  for (const search of searches.filter((item) => item.final_relationship === "parameter_mismatch")) add("HyperparameterSearch", search.id, "search_final_parameter_mismatch", "Persisted best parameters and the related final estimator parameters differ.", "The evaluated final estimator is not an exact instantiation of this search stage's best parameters.", "A model-selection rationale cannot be inferred from notebook order.", search.evidence_ids);
  for (const output of outputs.filter((item) => item.consistency !== "no_structural_mismatch_detected")) add("OutputProductionStatement", output.id, "output_column_inconsistency", `Assigned prediction column and selected export columns are inconsistent (${output.consistency}).`, "The persisted export statement does not select the assigned prediction column.", "Successful creation of the intended target output is not established.", output.evidence_ids);
  const intended = populationGraph.nodes.find((item) => item.role === "intended_prediction");
  const evaluation = populationGraph.nodes.find((item) => item.role === "evaluation");
  if (intended && evaluation) add("PopulationNode", evaluation.id, "evaluation_population_disconnect", "Evaluation uses labelled held-out observations while intended prediction concerns an unlabelled remainder.", "Evaluation and intended-decision populations are distinct nodes.", "Generalisation to the intended prediction population is not directly observed.", [...evaluation.evidence_ids, ...intended.evidence_ids]);
  for (const target of targets.filter((item) => item.semantic_subtype === "proxy_target")) add("TargetDefinition", target.id, "proxy_target", `Persisted project evidence relates ${target.semantic_name} to a broader construct represented by its recorded source indicator.`, null, "The prediction target should be presented as an indicator or proxy rather than a direct measurement of the broader construct.", target.evidence_ids);
  return limitations;
}

function notebookExecutionContexts(sources) {
  return allCells(sources).map(({ source, cell }) => ({
    id: stableId("ANEC", cell.locator), source_path: source.path, cell_index: cell.index, execution_count: cell.execution_count,
    workstream_id: streamIdentity(cell, source).id, section_path: cell.section_path || [], persisted_output: Boolean((cell.outputs || []).length),
    source_locator: cell.locator, epistemic: "OBSERVED", evidence_ids: [cell.evidence_id],
  }));
}

function environmentConfigurations(record) {
  const manifestPattern = /(?:^|\/)(?:requirements(?:[-_.].*)?\.txt|environment(?:[-_.].*)?\.ya?ml|conda(?:[-_.].*)?\.lock|pipfile(?:\.lock)?|poetry\.lock|pyproject\.toml|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|renv\.lock|dockerfile)$/i;
  return (record?.evidence || []).filter((item) => item?.id && item?.path && (item.kind === "environment_or_dependency_manifest" || manifestPattern.test(item.path))).map((item) => {
    const name = item.path.split("/").at(-1);
    const type = /dockerfile/i.test(name) ? "container_definition"
      : /\.lock$|lock\./i.test(name) ? "dependency_lock"
        : /environment.*\.ya?ml|conda/i.test(name) ? "environment_manifest"
          : "dependency_manifest";
    return {
      id: stableId("AEC", item.path),
      label: name,
      configuration_type: type,
      source_path: item.path,
      content_sha256: item.sha256 || null,
      epistemic: "OBSERVED",
      evidence_ids: [item.id],
    };
  });
}

function attachObjectLinks(targets, { runs, searches, attempts, metrics, diagnostics, prevalence, featureSets, outputs, limitations }) {
  for (const target of targets) {
    target.method_run_ids = runs.filter((item) => item.target_id === target.id).map((item) => item.id);
    target.search_ids = searches.filter((item) => item.target_id === target.id).map((item) => item.id);
    target.evaluation_attempt_ids = attempts.filter((item) => item.target_id === target.id).map((item) => item.id);
    target.metric_ids = metrics.filter((item) => item.target_id === target.id).map((item) => item.id);
    target.diagnostic_ids = diagnostics.filter((item) => item.target_id === target.id).map((item) => item.id);
    target.prevalence_ids = prevalence.filter((item) => item.target_id === target.id).map((item) => item.id);
    target.feature_set_ids = featureSets.filter((item) => item.target_id === target.id).map((item) => item.id);
    target.output_ids = outputs.filter((item) => item.target_id === target.id).map((item) => item.id);
    target.limitation_ids = limitations.filter((item) => item.subject_id === target.id || metrics.some((metric) => metric.target_id === target.id && metric.id === item.subject_id) || runs.some((run) => run.target_id === target.id && run.id === item.subject_id) || outputs.some((output) => output.target_id === target.id && output.id === item.subject_id)).map((item) => item.id);
  }
}

export function selectBestFinalResult(record, targets, comparisons, bindings, populationGraph) {
  return bestFinalResult(record, targets, comparisons, bindings, populationGraph);
}

function scopedPopulationForObject(populationGraph, object, role) {
  const objectPath = String(object?.source_locator || "").split("#cell-")[0];
  const objectCell = cellNumber(object?.source_locator);
  const context = (populationGraph.contexts || []).filter((item) => (!object?.target_id || !item.target_id || item.target_id === object.target_id)
    && (!item.split_source_locator || String(item.split_source_locator).split("#cell-")[0] === objectPath)
    && (!item.split_source_locator || cellNumber(item.split_source_locator) <= objectCell))
    .sort((a, b) => cellNumber(b.split_source_locator) - cellNumber(a.split_source_locator))[0] || null;
  return (context?.nodes || []).find((item) => item.role === role)
    || populationGraph.nodes.find((item) => item.role === role && (!object?.target_id || !item.target_ids?.length || item.target_ids.includes(object.target_id)))
    || null;
}

export function buildReconstructionGraph(record, { sources = [], legacy = {} } = {}) {
  const { targets, dependencies, constructionSteps, constructionEdges, constructionGraphs } = buildTargets(sources, record);
  const { runs, predictionProducers } = buildModelRuns(sources, targets);
  const searches = buildSearches(sources, targets, runs);
  const populationGraph = buildPopulationGraph(record, sources, targets);
  const metrics = buildMetricObservations(sources, targets, runs, predictionProducers, legacy.results || []);
  for (const metric of metrics) metric.population_id = metric.evaluation_phase === "test"
    ? scopedPopulationForObject(populationGraph, metric, "evaluation")?.id || null
    : metric.evaluation_phase === "train" || metric.evaluation_phase === "validation"
      ? scopedPopulationForObject(populationGraph, metric, "training")?.id || null
      : null;
  const diagnostics = buildDiagnostics(sources, targets, runs, predictionProducers, legacy.diagnostics || []);
  for (const diagnostic of diagnostics) diagnostic.population_id = diagnostic.evaluation_phase === "test"
    ? scopedPopulationForObject(populationGraph, diagnostic, "evaluation")?.id || null
    : diagnostic.evaluation_phase === "train" || diagnostic.evaluation_phase === "validation"
      ? scopedPopulationForObject(populationGraph, diagnostic, "training")?.id || null
      : null;
  const comparisons = typedComparisons(legacy.comparison_sets || [], metrics, targets);
  const attempts = buildEvaluationAttempts(targets, metrics, diagnostics);
  const prevalence = buildPrevalence(sources, targets, populationGraph, diagnostics);
  const baselines = buildBaselineRelations(prevalence, metrics);
  const formationStages = dataFormationStages(sources, targets);
  const missingness = buildMissingness(sources, populationGraph);
  const artefacts = [...(sources.persisted_artefacts || [])];
  const feature = buildFeatureEvidence(targets, runs, legacy.feature_evidence || [], artefacts, formationStages, sources);
  const outputs = buildOutputs(sources, targets, runs, artefacts);
  const selections = buildSelectionStatements(sources, targets, comparisons, feature.sets, outputs);
  const limitations = scopedLimitations(record, targets, populationGraph, formationStages, searches, metrics, outputs);
  const bindings = strictEvidenceBindings(record, targets, metrics, diagnostics);
  const bestFinal = bestFinalResult(record, targets, comparisons, bindings, populationGraph);
  const focalResultsEvaluation = buildFocalResultsEvaluation(bestFinal, { targets, runs, attempts, populationGraph, limitations });
  const contexts = notebookExecutionContexts(sources);
  const environments = environmentConfigurations(record);
  attachObjectLinks(targets, { runs, searches, attempts, metrics, diagnostics, prevalence, featureSets: feature.sets, outputs, limitations });
  const historicalPrimaryBinding = bindings.find((item) => item.canonical_role === "primary");
  return {
    schema_version: "boveda-analytical-object-graph-0.13.2", derivation: "deterministic_persisted_evidence_v0.13.2", provider_calls: 0,
    target_definitions: targets, target_relations: dependencies,
    target_construction_steps: constructionSteps, target_construction_edges: constructionEdges, target_construction_graphs: constructionGraphs,
    population_nodes: populationGraph.nodes, population_relations: populationGraph.relations,
    population_graph: populationGraph, data_formation_stages: formationStages, missingness_observations: missingness,
    model_runs: runs, hyperparameter_searches: searches, search_stages: searches, evaluation_attempts: attempts,
    metric_observations: metrics, final_comparison_sets: comparisons, diagnostic_observations: diagnostics, prevalence_observations: prevalence, baseline_relations: baselines,
    feature_evidence_sets: feature.sets, feature_evidence: feature.values, selection_statements: selections,
    output_production_statements: outputs, persisted_artefacts: artefacts, scoped_limitations: limitations,
    evidence_bindings: bindings, notebook_execution_contexts: contexts,
    ...(environments.length ? { environment_configurations: environments } : {}),
    best_final_result: bestFinal,
    focal_results_evaluation: focalResultsEvaluation,
    selected_model: selections.find((item) => item.type === "project_selected_model") || { type: "project_selected_model", status: "unresolved" },
    canonical_primary_context: { status: historicalPrimaryBinding?.status || "unresolved", binding_id: historicalPrimaryBinding?.id || null, metric_observation_id: historicalPrimaryBinding?.object_type === "MetricObservation" ? historicalPrimaryBinding.object_id : null },
    completeness: {
      targets: targets.length ? "available" : "unavailable", populations: populationGraph.nodes.length ? "available" : "unavailable",
      model_runs: runs.length ? "available" : "unavailable", searches: searches.length ? "available" : "unavailable",
      metrics: metrics.length ? "available" : "unavailable", diagnostics: diagnostics.length ? "available" : "unavailable",
      prevalence: prevalence.length ? "available" : "unavailable", outputs: outputs.length ? "available" : "unavailable",
      ...(environments.length ? { environments: "available" } : {}),
      evidence_termination: [...targets, ...populationGraph.nodes, ...runs, ...searches, ...metrics, ...diagnostics, ...prevalence, ...feature.values, ...outputs, ...limitations].every((item) => item.evidence_ids?.length) ? "complete" : "partial",
    },
  };
}
