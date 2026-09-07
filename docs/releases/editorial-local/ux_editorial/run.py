"""Edit explicitly selected preserved final packages; never execute analytical stages."""
import argparse
import concurrent.futures
import csv
import html
import json
import re
import time
from pathlib import Path
from .editor import Package, WORKSPACE, resolve, write_json, empty_answer
from .prompts import VERSION, PROFILES, CONTRACT, NO_PROMPT
from .provider import Provider, MODEL, PRICES, EFFORT, MAX_OUTPUT_TOKENS


def prompt_book(destination):
    from .content_contract import write_contract
    write_contract(destination)


def evaluate_field(field, provider, attempt=0):
    if re.search(r'[a-z]{3,}[\u4e00-\u9fff]$', field['canonical_text']):
        result = resolve(field, empty_answer(field, 'FALLBACK'))
        result.update(reason='SOURCE_REVIEW_REQUIRED', usage={'cost_usd': 0, 'latency_seconds': 0})
        return result
    if field['stage'] == 'Q1' and re.search(r'(\([^)]{8,}\))(?:\s*\1){2,}', field['canonical_text']):
        result = resolve(field, empty_answer(field, 'FALLBACK'))
        result.update(reason='SOURCE_REVIEW_REQUIRED', usage={'cost_usd': 0, 'latency_seconds': 0})
        return result
    answer, event = provider.generate(field)
    result = resolve(field, answer)
    result['usage'] = {k: event[k] for k in ('response_id', 'usage', 'cost_usd', 'latency_seconds', 'error', 'usage_unknown') if k in event}
    if event.get('error'):
        result['reason'] = event['error']
    if result['decision'] == 'REWRITE' and not event.get('error'):
        from .validation import REVIEW_POLICY
        review_field = {**field, 'shape':'text', 'keep_allowed':True,
                        'profile_id':field['profile_id']+'.semantic_review',
                        'instructions':REVIEW_POLICY + (' An opening introduction must name the supplied concrete output, not repeat the purpose three times. Reject the prohibited phrases this documented project or documented outputs. Secondary aims must not become achieved results.' if field['profile_id']=='S1.purpose_intro' else ' A Construction introduction may select essential information from supporting statements, but must explain preparation, representation, learning and the model landscape where established. Reject invented branch associations or a claim of a final single model when designation is unresolved. Do not demand every supporting number or gap, only material meaning.' if field['profile_id']=='S4.construction_intro' else ''),
                        'context':{'field':field['profile_id'],'display':result['content'],'canonical_metadata':field['context']}}
        verdict, review_event = provider.generate(review_field)
        prior_cost = result['usage'].get('cost_usd') or 0
        result['usage']['cost_usd'] = prior_cost + (review_event.get('cost_usd') or 0)
        result['usage']['usage_unknown'] = bool(event.get('usage_unknown') or review_event.get('usage_unknown'))
        result['semantic_review'] = {'verdict':(verdict or {}).get('decision','FALLBACK'), 'reason':(verdict or {}).get('text','Review unavailable'), 'response_id':review_event.get('response_id')}
        if not verdict or verdict.get('decision') != 'KEEP' or review_event.get('error'):
            if attempt == 0 and not review_event.get('error'):
                retry = evaluate_field({**field, 'instructions':field['instructions']+'\nReview this concern against the canonical source and preserve its meaning: '+result['semantic_review']['reason']}, provider, 1)
                retry['usage']['cost_usd'] = (retry['usage'].get('cost_usd') or 0) + result['usage']['cost_usd']
                retry['prior_review'] = result['semantic_review']
                return retry
            fallback = resolve(field, empty_answer(field,'FALLBACK'))
            fallback.update(reason='SEMANTIC_REVIEW_FALLBACK',usage=result['usage'],semantic_review=result['semantic_review'])
            return fallback
    return result


def edit_package(root, destination, provider, workers=4):
    package = Package(root)
    destination = Path(destination).resolve()
    if destination.is_relative_to(package.root) or package.root.is_relative_to(destination):
        raise ValueError('Editorial output must be separate from the canonical package')
    destination.mkdir(parents=True, exist_ok=False)
    items = list(package.fields())
    write_json(destination / 'inputs.json', {'canonical_root': str(package.root), 'source_sha256': package.sources, 'prompt_version': VERSION, 'fields': items})
    results = []
    start = time.monotonic()
    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as pool:
        tasks = {pool.submit(evaluate_field, item, provider): item for item in items}
        for future in concurrent.futures.as_completed(tasks):
            results.append(future.result())
            write_json(destination / 'fields.json', results)
    order = {(item['stage'], item['pointer']): i for i, item in enumerate(items)}
    results.sort(key=lambda x: order[(x['stage'], x['pointer'])])
    write_json(destination / 'fields.json', results)
    display = package.compose(results)
    (destination / 'display.md').write_text(display)
    from .presentation import preview
    content = package.content(results)
    write_json(destination / 'content.json', content)
    preview(destination / 'preview.html', content)
    package.verify_unchanged()
    counts = {key: sum(r['decision'] == key for r in results) for key in ('KEEP', 'REWRITE', 'FALLBACK')}
    summary = {'project_id': package.pid, 'canonical_root': str(package.root), 'prompt_version': VERSION,
               'model': MODEL, 'reasoning_effort': EFFORT, 'fields': len(results), 'decisions': counts, 'canonical_unchanged': True,
               'cost_usd': sum(r['usage'].get('cost_usd') or 0 for r in results),
               'unknown_usage_requests': sum(bool(r['usage'].get('usage_unknown')) for r in results),
               'wall_seconds': round(time.monotonic() - start, 3), 'degradations': package.degradations,
               'publication': package.summary.get('publication_eligibility')}
    write_json(destination / 'summary.json', summary)
    return summary, results


def comparison(destination, rows):
    keys = ['project_id', 'stage', 'profile_id', 'pointer', 'decision', 'reason', 'canonical_text', 'display_text']
    rows = sorted(rows, key=lambda r: (r['profile_id'], r['project_id'], r['pointer']))
    with (destination / 'comparison.csv').open('w', newline='') as stream:
        writer = csv.DictWriter(stream, fieldnames=keys, extrasaction='ignore')
        writer.writeheader(); writer.writerows(rows)
    style = 'body{font:15px system-ui;margin:2rem;color:#152536}table{border-collapse:collapse;width:100%;table-layout:fixed}th,td{padding:12px;vertical-align:top;border:1px solid #ccd5de;overflow-wrap:anywhere}th{background:#eef3f8}td:first-child{width:18%}.REWRITE{background:#f2fbf6}.FALLBACK{background:#fff5e6}h2{margin-top:3rem}small{color:#556}'
    parts = ['<!doctype html><meta charset="utf-8"><title>Bóveda — Canonical / Display</title><style>' + style + '</style><h1>Canonical / Display</h1><p>Grouped by field for cross-project review. Compare the same field across projects: question, content grammar and material supervisory reading.</p>']
    group = None
    for r in rows:
        if group != r['profile_id']:
            if group: parts.append('</tbody></table>')
            group = r['profile_id']
            parts.append('<h2>' + html.escape(group) + '</h2><table><thead><tr><th>Project / Decision</th><th>Canonical</th><th>Display</th></tr></thead><tbody>')
        parts.append('<tr class="' + r['decision'] + '"><td>' + html.escape(r['project_id']) + '<br><b>' + r['decision'] + '</b><br><small>' + html.escape(r['reason']) + '</small></td><td>' + html.escape(r['canonical_text']) + '</td><td>' + html.escape(r['display_text']).replace('\n', '<br>') + '</td></tr>')
    if group: parts.append('</tbody></table>')
    (destination / 'comparison.html').write_text('\n'.join(parts))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--budget', type=float, default=.75)
    args = parser.parse_args()
    manifest = json.loads(args.manifest.read_text())
    if manifest.get('editorial_execution_authorized') is not True:
        raise ValueError('Explicit editorial authorization required')
    args.out.mkdir(parents=True, exist_ok=False)
    prompt_book(args.out / 'PROMPT_BOOK.md')
    write_json(args.out / 'request.json', {'manifest': manifest, 'model': MODEL, 'reasoning_effort': EFFORT, 'max_output_tokens': MAX_OUTPUT_TOKENS, 'budget_usd': args.budget, 'pricing_usd_per_million': PRICES})
    provider = Provider(args.out / 'api_events.jsonl', args.budget)
    summaries, rows = [], []
    for item in manifest['packages']:
        root = WORKSPACE / item['root']
        summary, results = edit_package(root, args.out / item['label'], provider)
        summaries.append(summary); rows.extend(results)
        write_json(args.out / 'summary.json', summaries)
        comparison(args.out, rows)
        print(json.dumps({'label': item['label'], **summary}), flush=True)
        if provider.stopped:
            break

if __name__ == '__main__':
    main()
