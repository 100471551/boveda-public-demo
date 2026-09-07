"""One bounded request per field; editorial usage is separate from audit usage."""
import importlib.util
import json
import math
import threading
import time
import urllib.request
from .editor import WORKSPACE, response_schema

MODEL = 'gpt-5.6-terra'
EFFORT = 'low'
MAX_OUTPUT_TOKENS = 2000
PRICES = {'input': 2., 'cached_input': .20, 'cache_write': 2.5, 'output': 12.}
SCHEMA = {'type': 'object', 'properties': {'decision': {'type': 'string', 'enum': ['KEEP', 'REWRITE', 'FALLBACK']}, 'text': {'type': 'string'}}, 'required': ['decision', 'text'], 'additionalProperties': False}


class Provider:
    def __init__(self, ledger, budget=.75):
        if isinstance(budget, bool) or not isinstance(budget, (int, float)) or not math.isfinite(budget) or budget <= 0:
            raise ValueError('Editorial budget must be finite and positive')
        spec = importlib.util.spec_from_file_location('_editorial_credential', WORKSPACE / 'shared/boveda_substrate/credentials.py')
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        self.key = module.load_authorized_api_key(WORKSPACE)
        self.ledger = ledger
        self.budget, self.spent, self.reserved = budget, 0., 0.
        self.lock, self.stopped = threading.Lock(), False

    def generate(self, field):
        payload = {'model': MODEL, 'instructions': field['instructions'],
                   'input': json.dumps({'canonical_text': field['canonical_text'], 'context': field['context']}, ensure_ascii=False),
                   'reasoning': {'effort': EFFORT}, 'max_output_tokens': MAX_OUTPUT_TOKENS, 'store': False,
                   'text': {'format': {'type': 'json_schema', 'name': 'editorial_field', 'strict': True, 'schema': response_schema(field.get('shape', 'text'), field.get('keep_allowed', True))}}}
        encoded = json.dumps(payload).encode()
        reservation = (len(encoded) * max(PRICES['input'], PRICES['cache_write']) + MAX_OUTPUT_TOKENS * PRICES['output']) / 1e6
        with self.lock:
            if self.stopped or self.spent + self.reserved + reservation > self.budget:
                return None, {'error': 'EDITORIAL_BUDGET_OR_TRANSPORT_STOP', 'cost_usd': 0, 'latency_seconds': 0}
            self.reserved += reservation
        event = {'profile_id': field['profile_id'], 'project_id': field.get('project_id'), 'pointer': field['pointer'], 'model': MODEL, 'reasoning_effort': EFFORT, 'started_unix': time.time()}
        start = time.monotonic()
        answer = None
        try:
            request = urllib.request.Request('https://api.openai.com/v1/responses', data=encoded,
                headers={'Authorization': 'Bearer ' + self.key, 'Content-Type': 'application/json'})
            with urllib.request.urlopen(request, timeout=55) as response:
                raw = json.loads(response.read())
            usage = raw.get('usage')
            if not usage:
                raise ValueError('Response usage unavailable')
            cached = usage.get('input_tokens_details', {}).get('cached_tokens', 0)
            written = usage.get('input_tokens_details', {}).get('cache_write_tokens', 0)
            cost = ((usage['input_tokens'] - cached - written) * PRICES['input'] + cached * PRICES['cached_input'] + written * PRICES['cache_write'] + usage['output_tokens'] * PRICES['output']) / 1e6
            event.update(response_id=raw.get('id'), usage=usage, cost_usd=cost, response_status=raw.get('status'))
            texts = [part.get('text', '') for item in raw.get('output', []) if item.get('type') == 'message' for part in item.get('content', []) if part.get('type') == 'output_text']
            event['response_text'] = '\n'.join(texts)
            try:
                if raw.get('status') == 'completed':
                    answer = json.loads(event['response_text'])
            except (ValueError, TypeError):
                event['error'] = 'INVALID_JSON'
        except Exception as exc:
            # Do not retry uncertain paid requests or serialize credentials/error bodies.
            event.update(error=type(exc).__name__, http_status=getattr(exc, 'code', None), usage_unknown=True, cost_usd=None)
        event['latency_seconds'] = round(time.monotonic() - start, 3)
        with self.lock:
            self.reserved -= reservation
            self.spent += event.get('cost_usd') or 0
            if event.get('usage_unknown'):
                self.stopped = True
            try:
                with self.ledger.open('a') as stream:
                    stream.write(json.dumps(event, ensure_ascii=False) + '\n')
            except OSError:
                self.stopped = True
                raise
        return answer, event
