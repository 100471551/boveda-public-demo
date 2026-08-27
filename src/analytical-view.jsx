import React, { useEffect, useMemo, useRef, useState } from "react";
import { conciseContextLabel, evaluationStandoutSummary, featureStandoutSummary, layoutLineageGraph, magnitudeHeat, matrixMagnitudeHeat, metricHeat, modelComparisonStandoutSummary } from "./analytical-presentation.mjs";
import { formatAnalyticalMetric } from "./format-display.mjs";
import { HELP_COPY } from "./communication-copy.mjs";
import { HelpPopover } from "./help-popover.jsx";
import { OverviewFindingLinks } from "./overview-finding-links.jsx";
import { populationLineageContexts } from "./population-context.mjs";
import { analyticalAvailabilityMessage } from "./sparse-communication.mjs";
import { EmptyEvidenceState } from "./empty-evidence-state.jsx";
import { sectionDefaultModelKey } from "./overview-model-context.mjs";

function formatValue(value, precision = 3) {
  if (!Number.isFinite(value)) return "–";
  if (Math.abs(value) >= 1000) return value.toLocaleString("en-US");
  if (Number.isInteger(value)) return String(value);
  return formatAnalyticalMetric(value, Math.abs(value) < 0.01 ? Math.max(4, precision) : precision);
}

function EmptyAnalyticalState({ title, children }) {
  return <EmptyEvidenceState title={title} className="analytical-empty">{children}</EmptyEvidenceState>;
}

function ReadingGuideIcon({ variant }) {
  return <img className={`what-stands-out__icon what-stands-out__icon--${variant}`} src="/ui/What_Stands_Out.svg" alt="" aria-hidden="true" />;
}

function TrailButton({ object, onTrail, children, className = "", style, title }) {
  const enabled = Boolean(object?.evidence_ids?.length);
  const tooltip = title || object?.name || object?.description || object?.metric_label || object?.feature || object?.label;
  return <button type="button" className={`analytical-trail ${className}`} style={style} disabled={!enabled} onClick={() => enabled && onTrail({
    value: object.name || object.description || object.metric_label || object.feature || object.label || "Analytical evidence",
    epistemic: object.epistemic || "DERIVED",
    evidence_ids: object.evidence_ids,
  })} title={tooltip || undefined}>{children}</button>;
}

export function AnalyticalSelector({ options, selected, onSelect, label, ariaLabel = "Model context", groupLabel = "Model", className = "" }) {
  const [open, setOpen] = useState(false);
  const selectorRef = useRef(null);
  const current = Math.min(Math.max(selected, 0), Math.max(0, options.length - 1));
  const labels = options.map((option) => label(option));
  const enabled = options.length > 1;

  useEffect(() => {
    if (!open) return undefined;
    const closeOutside = (event) => {
      if (!selectorRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  useEffect(() => setOpen(false), [current, options.length]);

  return <div className={`analytical-selector ${className} ${open ? "is-open" : ""}`} ref={selectorRef}>
    <button type="button" className="analytical-selector__trigger" aria-label={ariaLabel} aria-haspopup="listbox" aria-expanded={open} disabled={!enabled} onClick={() => enabled && setOpen((value) => !value)}>
      <span>{groupLabel} {enabled ? <img src="/ui/Dropdown_Chevron.svg" alt="" aria-hidden="true" /> : null}</span>
      <strong title={labels[current]}>{labels[current] || "Model information unavailable"}</strong>
    </button>
    {open ? <div className="analytical-selector__menu" role="listbox" aria-label={ariaLabel}>{options.map((option, index) => <button type="button" role="option" className={index === current ? "is-selected" : ""} aria-selected={index === current} title={labels[index]} onClick={() => { onSelect(index); setOpen(false); }} key={option.id || option.key || index}>{labels[index]}</button>)}</div> : null}
  </div>;
}

function ContextSwitcher({ contexts, selected, onSelect, label }) {
  return <AnalyticalSelector options={contexts} selected={selected} onSelect={onSelect} label={label} />;
}

function sectionModelOptions(modelPresentation) {
  return modelPresentation?.contexts || [];
}

function qualifiedContextLabel(context, contexts) {
  const base = context.display_label || conciseContextLabel(context.workstream);
  const matching = contexts.filter((item) => (item.display_label || conciseContextLabel(item.workstream)) === base);
  if (matching.length < 2) return base;
  const details = [];
  if (matching.some((item) => item.evaluation_phase !== context.evaluation_phase) && context.evaluation_phase && context.evaluation_phase !== "unspecified") details.push(context.evaluation_phase.replaceAll("_", " "));
  if (matching.some((item) => (item.evaluation_variant || "base") !== (context.evaluation_variant || "base"))) details.push(context.evaluation_variant === "scaled" ? "Scaled" : "Base");
  if (!details.length) details.push(`Recorded evaluation ${matching.indexOf(context) + 1}`);
  return details.length ? `${base} · ${details.join(" · ")}` : base;
}

function Comparison({ sets, modelPresentation, globalModelKey, onTrail, findingAssociation, onFindingNavigate, emptyMessage }) {
  const [selected, setSelected] = useState(0);
  const [selectedModelKey, setSelectedModelKey] = useState(globalModelKey);
  useEffect(() => setSelected(0), [sets?.[0]?.id]);
  useEffect(() => setSelectedModelKey(globalModelKey), [globalModelKey]);
  if (!sets?.length) return <section className="analytical-component comparison-component analytical-frame analytical-frame--empty"><div className="analytical-heading"><div className="analytical-heading__title"><h3>Model comparison</h3><HelpPopover label="Model comparison">{HELP_COPY.modelComparison}</HelpPopover></div><p>Compares methods evaluated on the same target and evaluation context.</p></div><EmptyAnalyticalState title="Model comparison unavailable">{emptyMessage}</EmptyAnalyticalState><OverviewFindingLinks association={findingAssociation} onNavigate={onFindingNavigate} /></section>;
  const current = Math.min(selected, sets.length - 1);
  const set = sets[current];
  const modelOptions = sectionModelOptions(modelPresentation).filter((context) => !context.comparison_set_id || context.comparison_set_id === set.id);
  const selectedModel = modelOptions.find((context) => context.id === selectedModelKey)
    || modelOptions.find((context) => context.id === globalModelKey)
    || modelOptions[0]
    || null;
  const selectedModelIndex = Math.max(0, modelOptions.findIndex((context) => context.id === selectedModel?.id));
  const selectedMethod = selectedModel?.method;
  const valueFor = (method, metric) => set.results.find((item) => item.method === method && item.metric === metric);
  return <section className="analytical-component comparison-component analytical-frame" style={{
    "--comparison-card-width": `${Math.min(1120, 370 + (set.methods.length * 150))}px`,
    "--comparison-card-min-height": `${250 + (set.metrics.length * 52)}px`,
  }}>
    <div className="analytical-heading"><div className="analytical-heading__title"><h3>Model comparison</h3><HelpPopover label="Model comparison">{HELP_COPY.modelComparison}</HelpPopover></div><p>Compares methods evaluated on the same target and evaluation context.</p></div>
    <div className="analytical-body analytical-body--comparison">
      <div className="analytical-visual"><div className="comparison-controls">{sets.length > 1 ? <ContextSwitcher contexts={sets} selected={current} onSelect={setSelected} label={(item) => qualifiedContextLabel(item, sets)} /> : null}{modelOptions.length > 1 ? <AnalyticalSelector options={modelOptions} selected={selectedModelIndex} onSelect={(index) => setSelectedModelKey(modelOptions[index]?.id)} label={(context) => context.label} ariaLabel="Model Comparison highlighted model" groupLabel="Inspect model" /> : null}</div>
      <div className="comparison-table" style={{ "--method-count": set.methods.length }}>
        <span></span>{set.methods.map((method) => <strong className={method === selectedMethod ? "is-selected-model" : ""} key={method}>{method}</strong>)}
        {set.metrics.map((metric) => {
          const rowValues = set.methods.map((method) => valueFor(method, metric.key)?.value).filter(Number.isFinite);
          const direction = metric.direction_of_better || metric.direction;
          return <React.Fragment key={metric.key}>
            <span className="comparison-metric">{metric.label}{metric.score_input === "hard_label" ? <small>hard-label computation</small> : direction === "lower" ? <small>lower is better</small> : direction === "higher" ? <small>higher is better</small> : <small>direction unresolved</small>}</span>
            {set.methods.map((method) => {
              const result = valueFor(method, metric.key);
              const heat = result ? metricHeat(result.value, rowValues, direction) : null;
              return result ? <TrailButton key={method} object={result} onTrail={onTrail} className={`comparison-value ${method === selectedMethod ? "is-selected-model " : ""}${heat ? "has-heat" : "is-neutral"}`} style={heat ? { backgroundColor: heat.color } : undefined}>{formatValue(result.value, result.display_precision ?? 3)}</TrailButton> : <span className={`comparison-value is-missing ${method === selectedMethod ? "is-selected-model" : ""}`} key={method}>–</span>;
            })}
          </React.Fragment>;
        })}
      </div></div>
      <aside className="analytical-standout"><ReadingGuideIcon variant="comparison" /><h4>What stands out</h4><p>{modelComparisonStandoutSummary(set)}</p><OverviewFindingLinks association={findingAssociation} onNavigate={onFindingNavigate} /></aside>
    </div>
  </section>;
}

function FeatureEvidence({ modelPresentation, globalModelKey, onTrail, findingAssociation, onFindingNavigate, emptyMessage }) {
  const options = sectionModelOptions(modelPresentation);
  const defaultModelKey = sectionDefaultModelKey(modelPresentation, globalModelKey, "features");
  const [selectedModelKey, setSelectedModelKey] = useState(defaultModelKey);
  useEffect(() => setSelectedModelKey(defaultModelKey), [globalModelKey, defaultModelKey]);
  const selectedModel = options.find((context) => context.id === selectedModelKey)
    || options.find((context) => context.id === globalModelKey)
    || options[0]
    || null;
  const selectedModelIndex = Math.max(0, options.findIndex((context) => context.id === selectedModel?.id));
  const items = selectedModel?.features || [];
  const selector = options.length > 1 ? <AnalyticalSelector options={options} selected={selectedModelIndex} onSelect={(index) => setSelectedModelKey(options[index]?.id)} label={(context) => context.label} ariaLabel="Feature evidence model" groupLabel="Model" /> : null;
  if (!items.length) return <section className="analytical-component feature-component analytical-frame analytical-frame--empty"><div className="analytical-heading"><div className="analytical-heading__title"><h3>Feature / Driver Evidence</h3><HelpPopover label="Feature / Driver Evidence">{HELP_COPY.featureEvidence}</HelpPopover></div><p>Shows which inputs the displayed model relied on most. Importance does not imply causality.</p></div>{selector}<EmptyAnalyticalState title="Feature evidence unavailable">{selectedModel ? `Bóveda did not find recorded numerical feature contribution or importance evidence compatible with ${selectedModel.label}.` : emptyMessage}</EmptyAnalyticalState><OverviewFindingLinks association={findingAssociation} onNavigate={onFindingNavigate} /></section>;
  const displayed = items.slice(0, 8);
  const values = displayed.map((item) => item.value).filter(Number.isFinite);
  const maximum = Math.max(...values, 0);
  return <section className="analytical-component feature-component analytical-frame">
    <div className="analytical-heading"><div className="analytical-heading__title"><h3>Feature / Driver Evidence</h3><HelpPopover label="Feature / Driver Evidence">{HELP_COPY.featureEvidence}</HelpPopover></div><p>Shows which inputs the displayed model relied on most. Importance does not imply causality.</p></div>
    <div className="analytical-body analytical-body--feature"><div className="analytical-visual">
      {selector}
      <div className="feature-bars">{displayed.map((item) => {
        const heat = magnitudeHeat(item.value, values);
        return <TrailButton key={item.id} object={item} onTrail={onTrail} className="feature-row">
          <span title={item.raw_feature || item.feature}>{item.display_label || item.feature}</span><i><b style={{ width: `${maximum ? (item.value / maximum) * 100 : 0}%`, backgroundColor: heat?.color }} /></i><strong>{formatValue(item.value)}</strong>
        </TrailButton>;
      })}</div></div>
      <aside className="analytical-standout"><ReadingGuideIcon variant="feature" /><h4>What stands out</h4><p>{featureStandoutSummary(displayed)}</p><OverviewFindingLinks association={findingAssociation} onNavigate={onFindingNavigate} /></aside>
    </div>
  </section>;
}

function ConfusionMatrix({ diagnostic, onTrail }) {
  const values = diagnostic.values.flat().filter(Number.isFinite);
  return <TrailButton object={diagnostic} onTrail={onTrail} className="diagnostic-item">
    <strong>{diagnostic.method}</strong><small>{diagnostic.normalized ? "Normalized confusion matrix" : "Confusion matrix"}</small>
    <small className="matrix-orientation">Rows: actual · columns: predicted</small><div className="confusion-matrix" style={{ "--matrix-size": diagnostic.values.length }}>
      <span></span>{diagnostic.labels.map((label) => <b key={`column-${label}`}>{label}</b>)}
      {diagnostic.values.map((row, rowIndex) => <React.Fragment key={`row-${diagnostic.labels[rowIndex]}`}><b>{diagnostic.labels[rowIndex]}</b>{row.map((value, columnIndex) => {
        const heat = matrixMagnitudeHeat(value, values);
        return <i key={`${rowIndex}-${columnIndex}`} style={{ backgroundColor: heat?.color }}>{formatValue(value)}</i>;
      })}</React.Fragment>)}
    </div>
  </TrailButton>;
}

function TrainValidation({ diagnostic, onTrail }) {
  const values = [diagnostic.train_value, diagnostic.validation_value];
  return <TrailButton object={diagnostic} onTrail={onTrail} className="diagnostic-item train-validation">
    <strong>{diagnostic.method}</strong><small>Train versus test · {diagnostic.metric}</small>
    {[["Train", diagnostic.train_value], ["Test", diagnostic.validation_value]].map(([label, value]) => {
      const heat = magnitudeHeat(value, values);
      return <div className="diagnostic-bar" key={label}><span>{label}</span><i><b style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%`, backgroundColor: heat?.color }} /></i><strong>{formatValue(value)}</strong></div>;
    })}
  </TrailButton>;
}

function diagnosticContexts(diagnostics) {
  const result = new Map();
  for (const diagnostic of diagnostics || []) {
    const key = `${diagnostic.workstream_id}|${diagnostic.evaluation_phase || "unspecified"}|${diagnostic.evaluation_variant || "base"}`;
    if (!result.has(key)) result.set(key, { key, id: key, workstream: diagnostic.workstream, display_label: diagnostic.display_label, evaluation_phase: diagnostic.evaluation_phase, evaluation_variant: diagnostic.evaluation_variant, diagnostics: [] });
    result.get(key).diagnostics.push(diagnostic);
  }
  return [...result.values()];
}

function distinctDiagnosticMethods(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = `${item.type}|${item.method || "method-unresolved"}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function EvaluationBehaviour({ modelPresentation, globalModelKey, onTrail, findingAssociation, onFindingNavigate, emptyMessage }) {
  const options = sectionModelOptions(modelPresentation);
  const defaultModelKey = sectionDefaultModelKey(modelPresentation, globalModelKey, "diagnostics");
  const [selectedModelKey, setSelectedModelKey] = useState(defaultModelKey);
  useEffect(() => setSelectedModelKey(defaultModelKey), [globalModelKey, defaultModelKey]);
  const selectedModel = options.find((context) => context.id === selectedModelKey)
    || options.find((context) => context.id === globalModelKey)
    || options[0]
    || null;
  const selectedModelIndex = Math.max(0, options.findIndex((context) => context.id === selectedModel?.id));
  const diagnostics = selectedModel?.diagnostics || [];
  const contexts = useMemo(() => diagnosticContexts(diagnostics), [diagnostics]);
  const [selected, setSelected] = useState(0);
  const [familySelected, setFamilySelected] = useState(0);
  useEffect(() => { setSelected(0); setFamilySelected(0); }, [selectedModel?.id, contexts[0]?.id]);
  const modelSelector = options.length > 1 ? <AnalyticalSelector options={options} selected={selectedModelIndex} onSelect={(index) => setSelectedModelKey(options[index]?.id)} label={(context) => context.label} ariaLabel="Evaluation Behaviour model" groupLabel="Model" /> : null;
  if (!contexts.length) return <section className="evaluation-behaviour analytical-frame analytical-frame--empty"><div className="analytical-heading evaluation-heading"><div><div className="analytical-heading__title"><h3>Evaluation behaviour</h3><HelpPopover label="Evaluation behaviour">{HELP_COPY.evaluationBehaviour}</HelpPopover></div><p>Shows performance patterns that are hidden by the headline metric.</p></div><div className="evaluation-context-controls">{modelSelector}</div></div><EmptyAnalyticalState title="Evaluation behaviour unavailable">{selectedModel ? `Bóveda did not find compatible diagnostic evidence showing evaluation behaviour for ${selectedModel.label}.` : emptyMessage}</EmptyAnalyticalState><OverviewFindingLinks association={findingAssociation} onNavigate={onFindingNavigate} /></section>;
  const current = Math.min(selected, contexts.length - 1);
  const context = contexts[current];
  const familyOrder = ["confusion_matrix", "train_validation", "ranking_lift", "threshold_behaviour", "prediction_distribution"];
  const families = familyOrder.map((type) => ({ type, items: distinctDiagnosticMethods(context.diagnostics.filter((item) => item.type === type)) })).filter((family) => family.items.length);
  const selectedFamily = families[Math.min(familySelected, families.length - 1)];
  const familyLabel = (type) => type === "confusion_matrix" ? "Class behaviour" : type === "train_validation" ? "Train / validation" : type.replaceAll("_", " ");
  const standout = selectedFamily?.items.map(evaluationStandoutSummary).find(Boolean);
  const contextSelector = contexts.length > 1 ? <ContextSwitcher contexts={contexts} selected={current} onSelect={(index) => { setSelected(index); setFamilySelected(0); }} label={(item) => qualifiedContextLabel(item, contexts)} /> : null;
  return <section className="evaluation-behaviour analytical-frame"><div className="analytical-heading evaluation-heading"><div><div className="analytical-heading__title"><h3>Evaluation behaviour</h3><HelpPopover label="Evaluation behaviour">{HELP_COPY.evaluationBehaviour}</HelpPopover></div><p>Shows performance patterns that are hidden by the headline metric.</p></div><div className="evaluation-context-controls">{modelSelector}{contextSelector}</div></div>
    <div className="analytical-body analytical-body--evaluation"><div className="analytical-visual">
      {families.length > 1 ? <div className="diagnostic-family-switcher">{families.map((family, index) => <button type="button" className={index === Math.min(familySelected, families.length - 1) ? "is-active" : ""} onClick={() => setFamilySelected(index)} key={family.type}>{familyLabel(family.type)}</button>)}</div> : null}
      <div className="diagnostic-grid">{selectedFamily?.items.slice(0, 4).map((item) => item.type === "confusion_matrix" ? <ConfusionMatrix diagnostic={item} onTrail={onTrail} key={item.id} /> : <TrainValidation diagnostic={item} onTrail={onTrail} key={item.id} />)}</div></div>
      <aside className="analytical-standout"><ReadingGuideIcon variant="evaluation" /><h4>What stands out</h4><p>{standout || "The displayed diagnostic does not contain enough orientation-resolved information for a supported case-level summary."}</p><OverviewFindingLinks association={findingAssociation} onNavigate={onFindingNavigate} /></aside>
    </div>
  </section>;
}

export function AnalyticalResults({ layer, modelPresentation, globalModelKey, reconstruction, onTrail, findingAssociations, onFindingNavigate }) {
  if (!layer) return null;
  const story = layer.presentation?.main_target_story;
  const answers = story?.section_answers || {};
  const comparisonSets = answers.model_comparison?.dashboard_available ? answers.model_comparison.answer?.sets || [] : [];
  return <section className="analytical-results">
    <FeatureEvidence modelPresentation={modelPresentation} globalModelKey={globalModelKey} emptyMessage={analyticalAvailabilityMessage("feature_driver_evidence", reconstruction)} findingAssociation={findingAssociations?.["area-feature-driver-evidence"]} onFindingNavigate={onFindingNavigate} onTrail={onTrail} />
    <Comparison sets={comparisonSets} modelPresentation={modelPresentation} globalModelKey={globalModelKey} emptyMessage={analyticalAvailabilityMessage("model_comparison", reconstruction)} findingAssociation={findingAssociations?.["area-model-result-comparison"]} onFindingNavigate={onFindingNavigate} onTrail={onTrail} />
    <EvaluationBehaviour modelPresentation={modelPresentation} globalModelKey={globalModelKey} emptyMessage={analyticalAvailabilityMessage("evaluation_behaviour", reconstruction)} findingAssociation={findingAssociations?.["area-evaluation-behaviour"]} onFindingNavigate={onFindingNavigate} onTrail={onTrail} />
  </section>;
}

export function AnalyticalDetails({ layer, onTrail }) {
  if (!layer) return null;
  const targets = layer.target_definitions || [];
  const searches = layer.hyperparameter_searches || [];
  const prevalence = layer.prevalence_observations || [];
  const outputs = layer.output_production_statements || [];
  const limitations = layer.scoped_limitations || [];
  const historical = layer.presentation?.historical_primary_result;
  const predictionOutputs = outputs.filter((item) => item.output_type === "prediction_export");
  if (!targets.length && !searches.length && !prevalence.length && !predictionOutputs.length && !limitations.length && !historical) return null;
  const targetName = (id) => targets.find((item) => item.id === id)?.semantic_name || "Target not established";
  return <details className="analytical-details analytical-frame"><summary>Reconstruction detail <small>targets · tuning · prevalence · outputs · scoped limitations</small></summary>
    <div className="analytical-detail-grid">
      {targets.length ? <section><h4>Targets</h4>{targets.map((target) => <TrailButton object={target} onTrail={onTrail} className="detail-row" key={target.id}><strong>{target.semantic_name}</strong><span>{target.construction_rule || target.source_field}</span><small>positive class {target.positive_class ?? "not established"} · {target.interpretation.replaceAll("_", " ")}</small></TrailButton>)}</section> : null}
      {searches.length ? <section><h4>Tuning / CV</h4>{searches.slice(0, 12).map((search) => <TrailButton object={search} onTrail={onTrail} className="detail-row" key={search.id}><strong>{targetName(search.target_id)} · {search.method}</strong><span>{search.search_type} · stage {search.stage_index} · {search.cv_folds || "?"} folds · {search.candidate_count || "?"} candidates</span><small>{String(search.final_relationship || "final linkage unresolved").replaceAll("_", " ")}</small></TrailButton>)}</section> : null}
      {prevalence.length ? <section><h4>Prevalence / baseline context</h4>{prevalence.map((item) => <TrailButton object={item} onTrail={onTrail} className="detail-row" key={item.id}><strong>{targetName(item.target_id)} · {item.role.replaceAll("_", " ")}</strong><span>{formatValue(item.value, 3)} · {item.positive_count ?? "?"}/{item.denominator ?? "?"}</span></TrailButton>)}</section> : null}
      {predictionOutputs.length || limitations.length ? <section><h4>Outputs / limitations</h4>{predictionOutputs.map((item) => <TrailButton object={item} onTrail={onTrail} className="detail-row" key={item.id}><strong>{targetName(item.target_id)} · {item.producer_method || "producer unresolved"}</strong><span>{item.target_path} · {item.artefact_existence.replaceAll("_", " ")}</span><small>{item.consistency.replaceAll("_", " ")}</small></TrailButton>)}<small>{limitations.length} scoped limitations retained in the analytical graph.</small></section> : null}
      {historical ? <section><h4>Historical canonical context</h4><TrailButton object={historical} onTrail={onTrail} className="detail-row"><strong>{historical.metric_label || historical.metric} · {historical.method || "method unresolved"}</strong><span>{formatValue(historical.exact_value ?? historical.value, historical.persisted_precision ?? 3)} · {historical.target_name || "target not established"}</span><small>{String(historical.score_input || "score input unresolved").replaceAll("_", " ")} · historical reconstruction</small></TrailButton></section> : null}
    </div>
  </details>;
}

function missingnessItems(items) {
  return (items || []).filter((item) => Number.isFinite(item.value)).slice(0, 8);
}

function Missingness({ items, onTrail, findingAssociation, onFindingNavigate, emptyMessage }) {
  const measurements = missingnessItems(items);
  if (!measurements.length) return <section className="analytical-data-component analytical-frame analytical-frame--empty"><div className="analytical-heading"><div className="analytical-heading__title"><h3>Missing data before preparation</h3><HelpPopover label="Missing data before preparation">{HELP_COPY.missingData}</HelpPopover></div><p>Stage- and denominator-aware missingness observations from the available evidence.</p></div><EmptyAnalyticalState title="Missing-data measurements unavailable">{emptyMessage}</EmptyAnalyticalState><OverviewFindingLinks association={findingAssociation} onNavigate={onFindingNavigate} /></section>;
  const values = measurements.map((item) => item.value);
  const maximum = Math.max(...values, 1);
  return <section className="analytical-data-component analytical-frame"><div className="analytical-heading"><div className="analytical-heading__title"><h3>Missing data before preparation</h3><HelpPopover label="Missing data before preparation">{HELP_COPY.missingData}</HelpPopover></div><p>Quantified missingness for variables connected to the reconstructed analysis.</p></div>
    <div className="missingness-bars">{measurements.map((item) => {
      const accent = item.value > 0 && item.value / maximum < 0.5 ? "#58ddd9" : "#ffc95a";
      const suffix = item.unit === "percent" ? "%" : item.unit ? ` ${item.unit}` : "";
      return <TrailButton key={item.id} object={item} onTrail={onTrail} className="missingness-row"><span>{item.field}<small>{Number.isFinite(item.denominator) ? `denominator ${item.denominator.toLocaleString("en-US")}` : item.pipeline_stage?.population_count ? `stage population ${item.pipeline_stage.population_count.toLocaleString("en-US")}` : "recorded extent"}</small></span><i><b style={{ width: `${item.value / maximum * 100}%`, backgroundColor: accent }} /></i><strong>{formatValue(item.value)}{suffix}</strong></TrailButton>;
    })}</div>
  </section>;
}

function Lineage({ lineage, selectedContextId, onContextSelect, onTrail, findingAssociation, onFindingNavigate, emptyMessage }) {
  const contexts = useMemo(() => populationLineageContexts(lineage), [lineage]);
  if (!contexts.length) return <section className="analytical-data-component lineage-component analytical-frame analytical-frame--empty"><div className="analytical-heading"><div className="analytical-heading__title"><h3>How the data was filtered and split</h3></div><p>Shows how the analytical population was filtered and split.</p></div><EmptyAnalyticalState title="Population lineage unavailable">{emptyMessage}</EmptyAnalyticalState><OverviewFindingLinks association={findingAssociation} onNavigate={onFindingNavigate} /></section>;
  const selected = contexts.findIndex((context) => context.id === selectedContextId);
  const current = selected >= 0 ? selected : 0;
  const context = contexts[current];
  const layout = layoutLineageGraph(context, { orientation: "vertical" });
  const nodeLabel = (node) => {
    const label = String(node.label || "Population").trim();
    const match = label.match(/^([\d,.]+)\s+(.+)$/);
    return match && Number(match[1].replaceAll(",", "")) === node.count ? match[2] : label;
  };
  return <section className="analytical-data-component lineage-component analytical-frame"><div className="analytical-heading"><div className="analytical-heading__title"><h3>How the data was filtered and split</h3></div><p>Shows how the analytical population was filtered and split.</p></div>
    {contexts.length > 1 ? <ContextSwitcher contexts={contexts} selected={current} onSelect={(index) => onContextSelect?.(contexts[index].id)} label={(item) => item.display_label || conciseContextLabel(item.workstream)} /> : null}
    <div className="lineage-graph"><svg className="lineage-svg" width={layout.width} height={layout.height} viewBox={`0 0 ${layout.width} ${layout.height}`} role="img" aria-label={`Population and sample lineage for ${context.display_label || conciseContextLabel(context.workstream)}`}>
      <defs><marker id="lineage-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" /></marker></defs>
      <g className="lineage-edges">{layout.edges.map((edge) => <g key={edge.id}>
        <path d={edge.beforeD || edge.d} />
        {edge.afterD ? <path d={edge.afterD} markerEnd="url(#lineage-arrow)" /> : null}
        {edge.labelWidth ? <><rect x={edge.labelX - edge.labelWidth / 2} y={edge.labelY - 11} width={edge.labelWidth} height="22" rx="11" /><text x={edge.labelX} y={edge.labelY + 3.5}>{edge.relation}</text></> : <text x={edge.labelX} y={edge.labelY}>{edge.relation}</text>}
      </g>)}</g>
      {layout.nodes.map((node) => <foreignObject key={node.id} x={node.x} y={node.y} width={layout.nodeWidth} height={layout.nodeHeight}><TrailButton object={node} onTrail={onTrail} title={node.label} className={`lineage-node lineage-node--${node.role} lineage-node--depth-${Math.min(node.depth, 3)}`}>{node.depth === 0 ? <><strong>{formatValue(node.count)}</strong><small>{nodeLabel(node)}</small></> : <><small>{nodeLabel(node)}</small><strong>{node.display_value || formatValue(node.count)}</strong></>}<span>{node.unit}{node.epistemic === "DERIVED" ? " · derived" : ""}</span></TrailButton></foreignObject>)}
    </svg></div>
  </section>;
}

export function AnalyticalData({ layer, reconstruction, selectedContextId, onContextSelect, onTrail, findingAssociations, onFindingNavigate }) {
  if (!layer) return null;
  const story = layer.presentation?.main_target_story;
  const answers = story?.section_answers || {};
  const missingness = answers.data_missingness?.dashboard_available ? answers.data_missingness.answer?.measurements || [] : [];
  const lineage = answers.population_lineage?.dashboard_available ? answers.population_lineage.answer?.lineage || { nodes: [], edges: [], contexts: [] } : { nodes: [], edges: [], contexts: [] };
  const availableAreas = Number(missingnessItems(missingness).length > 0) + Number(populationLineageContexts(lineage).length > 0);
  return <div className={`analytical-data analytical-data--available-${availableAreas}`}>
    <Missingness items={missingness} emptyMessage={analyticalAvailabilityMessage("data_missingness", reconstruction)} findingAssociation={findingAssociations?.["area-data-missingness"]} onFindingNavigate={onFindingNavigate} onTrail={onTrail} />
    <Lineage lineage={lineage} selectedContextId={selectedContextId} onContextSelect={onContextSelect} emptyMessage={analyticalAvailabilityMessage("sample_lineage", reconstruction)} findingAssociation={findingAssociations?.["area-population-lineage"]} onFindingNavigate={onFindingNavigate} onTrail={onTrail} />
  </div>;
}
