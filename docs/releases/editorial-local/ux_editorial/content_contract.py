"""Publish the implemented field contracts, including non-editorial surfaces."""
import csv
from pathlib import Path
from .prompts import VERSION, CONTRACT, PROFILES

# Field, role, component, literal sandbox label (or clearly identified proposal),
# required grammar, structured opportunity. These receive no LLM transformation.
PASSTHROUGH = [
 ('S1–S4.*.status','Read epistemic state','INDICATOR','Epistemic Status','Exact canonical enum, adjacent to the corresponding answer; never inferred from editorial prose.','status'),
 ('S1–S4.*.label','Identify the established item','NO SPECIAL TREATMENT','Canonical item label','Exact label; never renamed by the editor.','label'),
 ('S1–S4.*.evidence[]','Verify the answer','STRUCTURED FACTS','Evidence References','Exact evidence ID, artifact and location; evidence excerpts remain in the evidence trail.','references[]; do not turn tokens into prose'),
 ('S2/S3.quantitative_notes[].category','Group a quantitative fact','TABLE','Category','Exact category in a quantitative fact row.','category'),
 ('S2/S3.quantitative_notes[].label','Identify the measured fact','TABLE','Fact','Exact fact label beside its value.','label'),
 ('S2/S3.quantitative_notes[].value','Read the established quantity','TABLE','Value','Exact value, including null; never calculate a replacement.','value'),
 ('S2/S3.quantitative_notes[].unit','Interpret the quantity','TABLE','Unit','Exact unit beside the value; null stays unspecified.','unit'),
 ('S2/S3.quantitative_notes[].status/evidence','Interpret and verify the fact','TABLE','Status / Evidence','Exact status and references associated with that fact.','status + evidence'),
 ('S2–S4.supporting_reconstruction[].kind/text/status/evidence','Inspect analytical detail on demand','NO SPECIAL TREATMENT','Supporting Reconstruction','Canonical technical detail, separate from primary answers; no editorial compression.','existing typed detail and references'),
 ('S4.resulting_model_landscape','Understand the model landscape','Q&A CARD','What model or modelling capability actually results?','Container for primary identity, canonical designation and model rows; no additional generated summary.','nested primary, designation and model components'),
 ('S4.resulting_model_landscape.canonical_model_status.answer','Read the explicit designation','INDICATOR','Is there one canonical model?','Exact Yes / No / Not established value beside its separately edited explanation.','answer + status'),
 ('Q1.profile.unit.statement','Identify one observation','STRUCTURED FACTS','Unit','Retained canonical statement in the first slot of Unit → N → Target → Split → Representation.','label + statement'),
 ('Q1.profile.n.statement','Read the amount and selected scope','STRUCTURED FACTS','N','Retained canonical statement in the N slot; keep its population/branch.','statement; no numeric extraction from prose in this experiment'),
 ('Q1.profile.target.statement','Identify the target','STRUCTURED FACTS','Target','Retained canonical statement, including task and target distinctions.','statement'),
 ('Q1.profile.split.statement','Read partitioning and counts','STRUCTURED FACTS','Split','Retained canonical statement, retaining split identity/order/units and uncertainty.','statement; future split rows only from explicit structured inputs'),
 ('Q1.profile.representation.statement','Read model-facing shape','STRUCTURED FACTS','Representation','Retained canonical statement in the fifth slot; retain variant and dimension.','statement'),
 ('Q1.profile.*.status/evidence','Interpret the five facts','STRUCTURED FACTS','Status / Evidence','Exact status and references per slot, not one inferred state for the whole card.','status + evidence per field'),
 ('Q2.record_status','Know whether performance work is complete','INDICATOR','Status','Exact record status with the existing partial-record/access-limitation notice.','record_status'),
 ('Q2.performance_cards[].model_or_capability.text','Identify the evaluated capability','Q&A CARD','Model / Capability','Exact model identity at the top of its performance card; do not merge cards.','model text + status + references'),
 ('Q2.performance_cards[].evaluation.text','Interpret what a result measures','Q&A CARD','Evaluation','Exact evaluation context immediately before the metrics; no cross-evaluation ranking.','evaluation text + status + references'),
 ('Q2.performance_cards[].metrics[].label','Identify the metric','TABLE','Metric','Exact label in the metric row.','label'),
 ('Q2.performance_cards[].metrics[].value','Read the measured result','TABLE','Value','Exact numeric/text/null value; no rounding, conversion or inferred winner by the editor.','value'),
 ('Q2.performance_cards[].metrics[].unit','Interpret the result','TABLE','Unit','Exact unit, if established; null is not replaced with a guessed unit.','unit'),
 ('Q2.performance_cards[].*.status/evidence','Interpret and verify model, evaluation and metrics','TABLE','Status / Evidence','Keep original associations and exact values.','status + references at the original scope'),
 ('Q2.execution/card_failures/access_limitations','See missing work and bounded inspection','NO SPECIAL TREATMENT','Processing Findings','Existing notices and diagnostics unchanged; never recast as analytical absence.','existing diagnostics; not editorial input'),
 ('S5.signal_id/name/family','Identify the supervisory check','TABLE','Signal / Family','Exact identifier, signal name and family; one signal per row/card.','signal_id + name + family'),
 ('S5.outcome','Read the deterministic result','INDICATOR','Outcome','Exact outcome, including insufficient evidence and not applicable; no red/green interpretation invented here.','outcome'),
 ('S5.applicability.status/explanation','Understand whether the check applies','STRUCTURED FACTS','Applicability','Exact status and explanation together.','status + explanation'),
 ('S5.rule_evaluation.*','Inspect how the outcome was derived','NO SPECIAL TREATMENT','Deterministic rule evaluation','Exact expression, operands and result; no natural-language rewrite.','existing rule structure'),
 ('S5.structured_observations.*','Inspect the established observations','STRUCTURED FACTS','Structured observations','Existing typed values and inspection coverage; preserve nulls, parse limits and scope.','existing observations; no inferred summaries'),
 ('S5.explanation','Understand the existing outcome explanation','NO SPECIAL TREATMENT','Why this outcome occurred','Exact deterministic explanation; kept beside that signal.','text'),
 ('S5.evidence/inspection_coverage/processing_findings','Verify the check and its limits','NO SPECIAL TREATMENT','Evidence trail / Inspection limitation','Exact evidence identities, findings and coverage; retain existing presentation notices.','existing reference and diagnostic records'),
 ('S6.overall.score_percent','Read audit confidence, not model quality','INDICATOR','Audit Confidence','Exact percentage or Not available, with overall status and band. Retain the sandbox warning that high Audit Confidence does not mean the model is good.','score_percent + band + status'),
 ('S6.overall.band/status','Interpret overall confidence','INDICATOR','Audit Confidence','Exact band and provisional/complete status attached to the overall score.','band + status'),
 ('S6.dimensions.coverage.*','Read analytical coverage','TABLE','Coverage','Exact score_percent and status; counts remain available as structured detail.','score_percent, established_slots, total_slots, unassessed_slots, status'),
 ('S6.dimensions.evidence_strength.*','Read evidence strength','TABLE','Evidence strength','Exact band, score and status; preserve established/scored counts.','band, score_percent, established_slots, scored_slots, status'),
 ('S6.dimensions.traceability.*','Read traceability','TABLE','Traceability','Exact score and status with traceable/established/unassessed counts.','score_percent, traceable_slots, established_slots, unassessed_slots, status'),
 ('S6.dimensions.evaluability.*','Read how many checks are decidable','TABLE','Evaluability','Exact score/status; retain decidable, insufficient-evidence, not-applicable and processing-failure counts separately.','existing dimension values'),
 ('S6.formula.*','Inspect the confidence calculation','STRUCTURED FACTS','Score weights','Exact named weights in detail; no recalculation or editorial optimization.','dimension + weight rows'),
 ('S6.execution.status','Read execution completeness','INDICATOR','Execution status','Exact canonical status.','status'),
 ('S6.execution.dimension_failures.*','See processing problems','LIST','Processing findings','Exact finding per dimension, without editorial prose transformation.','dimension + finding'),
 ('S6.input_identities.*','Verify contributing inputs','NO SPECIAL TREATMENT','Input identities','Canonical technical metadata available in detail, not generated copy.','passthrough metadata'),
 ('Global.project_id/contract_version/run identity','Identify the audit and record','NO SPECIAL TREATMENT','Audit details','Exact identity values; never editorial input for inventing project facts.','metadata'),
 ('Global.publication_eligibility.*','Understand whether the result is publishable','INDICATOR','Publication status','Exact status, reason and limitations from the final canonical composition.','existing publication object'),
 ('Global.provenance/evidence_tokens/diagnostics/accounting','Inspect provenance and operation','NO SPECIAL TREATMENT','Audit details','Exact existing values in detail; no editorial prompt and no feedback to analytical stages.','existing metadata'),
]


def write_contract(destination):
    path=Path(destination)
    lines=['# Bóveda — UX Content Contract','','Version: '+VERSION,'',
           'Canonical → final UX editorial transformation → display. Fixed supervisory questions frame project-specific content. The editor receives one canonical field and its item/status context. It does not receive evidence excerpts or other projects.',
           '', 'Model descriptions receive their canonical description and status only; their unchanged row labels are rendered separately and cannot imply training/evaluation scope. The primary explanation additionally receives the canonical primary identity so a paired capability remains paired.',
           '', '## Minimal response contract', '', CONTRACT, '',
           'Text fields return `{decision, text}`; list fields return `{decision, items}`; Construction Path returns `{decision, flows: [{label, nodes}], notes}`. KEEP/FALLBACK use empty content. KEEP retains canonical text inside the same component. FALLBACK shows canonical content in that component; a flow fallback displays the canonical explanation without inventing a sequence. No model switches component types.', '',
           'Questions for S1–S4 are literal sandbox rendering questions, except “Why does this appear primary?” (a proposed sub-question for the existing explanation). “Models or Capabilities” is the existing label normalized to title case. Q1 currently uses literal labels, not the historical seven-category questions.', '',
           'A Q&A card can contain a list, a flow or a table. S4 primary identity and its explanation are parts of the same card; Canonical Model Status keeps its exact indicator value. No map is implemented: place names without usable canonical geometry and a spatial supervisory purpose are insufficient.', '']
    rows=[]
    for p in PROFILES:
        row={'Field':p.stage+'.'+p.path,'UX role':p.role,'Component type':p.component,'Question / label':p.question,'Required display grammar':p.grammar,'Exact editorial prompt':p.prompt,'Structured rendering opportunity':p.structured}
        rows.append(row)
        lines += ['## '+p.name,'']
        for k,v in row.items():
            if k=='Exact editorial prompt':lines+=['**Exact editorial prompt**','','```text',v,'```','']
            else:lines+=['**'+k+':** '+v,'']
    lines += ['## Canonical passthrough fields','','These canonical fields remain immutable. Q1 statements additionally supply the separate Q1 display profiles above; their retained values, status and evidence are never replaced. Their existing final Markdown remains unchanged; `content.json` also carries the established structured Q1/Q2/S5/S6 content for later component rendering. Supporting technical artifacts remain available in the canonical package.','', '| Field | UX role | Component | Question / label | Required display grammar | Structured opportunity |','|---|---|---|---|---|---|']
    for field,role,component,label,grammar,structured in PASSTHROUGH:
        lines.append('| '+' | '.join(x.replace('|','\\|') for x in (field,role,component,label,grammar,structured))+' |')
        rows.append({'Field':field,'UX role':role,'Component type':component,'Question / label':label,'Required display grammar':grammar,'Exact editorial prompt':'NO EDITORIAL PROMPT','Structured rendering opportunity':structured})
    lines += ['', '## Source mapping', '',
              '- S1–S4: `sandboxes/*/*_analyst/rendering.py` and current canonical record fields.',
              '- Q1: `research/Q1_Data_Shape_v1_2_audit/q1_data_shape/rendering.py` (Unit, N, Target, Split, Representation).',
              '- Q2: `sandboxes/Q2_Model_Performance/q2_analyst/rendering.py`.',
              '- S5: `sandboxes/S5_Signals/s5_signals/rendering.py`.',
              '- S6: `sandboxes/S6_Audit_Confidence/s6_audit_confidence/rendering.py`.',
              '- API response shaping: [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs). Content correctness is reviewed separately from JSON shape.', '']
    path.write_text('\n'.join(lines))
    with path.with_suffix('.csv').open('w',newline='') as f:
        writer=csv.DictWriter(f,fieldnames=list(rows[0]));writer.writeheader();writer.writerows(rows)
