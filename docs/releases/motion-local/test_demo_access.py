"""Access-boundary tests use synthetic data and never start an audit."""
import http.client
from http.cookies import SimpleCookie
import json
from pathlib import Path
import re
import sys
import tempfile
import threading
import unittest
from unittest.mock import Mock, patch

APP = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(APP))
from demo_access import DemoAccess, credential_record, COOKIE_NAME, SESSION_SECONDS, REMEMBER_SECONDS
from server import make_server
import server as server_module


class StubRuntime:
    def state(self):
        return {'private_runtime': True}


class StubLibrary:
    def __init__(self):
        self.reads = 0

    def remember(self):
        self.reads += 1

    def list(self):
        self.reads += 1
        return {'audits': [{'id': 'SYNTHETIC'}]}


class AccessHTTPTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.record = credential_record('demo', 'synthetic-test-password')

    def setUp(self):
        self.now = 1000
        self.access = DemoAccess(self.record, clock=lambda: self.now)
        self.library = StubLibrary()
        self.server = make_server(StubRuntime(), 0, self.library, access=self.access)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.host = '127.0.0.1:' + str(self.server.server_port)
        self.origin = 'http://' + self.host
        _, _, html = self.request('/')
        self.token = re.search(r'name="probe-token" content="([^"]+)"', html.decode())[1]

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()

    def request(self, path, method='GET', value=None, cookie=None, headers=None):
        connection = http.client.HTTPConnection('127.0.0.1', self.server.server_port, timeout=5)
        base = {'Host': self.host}
        if method == 'POST':
            base.update({'Origin': self.origin, 'X-Probe-Token': self.token, 'Content-Type': 'application/json'})
        if cookie:
            base['Cookie'] = cookie
        base.update(headers or {})
        connection.request(method, path, None if value is None else json.dumps(value), base)
        response = connection.getresponse()
        result = response.status, dict(response.getheaders()), response.read()
        connection.close()
        return result

    def login(self, remember=False, cookie=None):
        status, headers, body = self.request('/api/auth/login', 'POST', {
            'username': 'demo', 'password': 'synthetic-test-password', 'remember': remember}, cookie)
        self.assertEqual(status, 200, body)
        parsed = SimpleCookie(headers['Set-Cookie'])
        return COOKIE_NAME + '=' + parsed[COOKIE_NAME].value, headers['Set-Cookie']

    def test_public_shell_and_session_do_not_load_private_data(self):
        self.assertEqual(self.request('/')[0], 200)
        self.assertEqual(self.request('/product_v2_0_1/product.js')[0], 200)
        status, _, body = self.request('/api/auth/session')
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body), {'enabled': True, 'authenticated': False})
        self.assertEqual(self.library.reads, 0)

    def test_all_data_routes_and_mutations_require_session(self):
        paths = ['/api/state', '/api/library', '/api/audit?audit=SYNTHETIC', '/api/evidence',
                 '/api/canonical', '/api/report', '/api/display-report', '/api/unknown']
        for path in paths:
            with self.subTest(path=path):
                self.assertEqual(self.request(path)[0], 401)
        for path in ['/api/run', '/api/browse', '/api/artifacts', '/api/library/remove', '/api/library/restore']:
            with self.subTest(path=path):
                self.assertEqual(self.request(path, 'POST', {})[0], 401)
        for path in ['/probe', '/v2.0.0', '/v2.0.1-flink', '/inspection?audit=SYNTHETIC']:
            status, headers, _ = self.request(path)
            self.assertEqual(status, 302)
            self.assertEqual(headers['Location'], '/#login')
        self.assertEqual(self.library.reads, 0)

    def test_login_grants_access_and_logout_revokes_captured_cookie(self):
        cookie, set_cookie = self.login()
        self.assertIn('HttpOnly', set_cookie)
        self.assertIn('SameSite=Lax', set_cookie)
        self.assertIn('Path=/', set_cookie)
        self.assertNotIn('Max-Age', set_cookie)
        self.assertNotIn('synthetic-test-password', set_cookie)
        self.assertEqual(self.request('/api/library', cookie=cookie)[0], 200)
        status, _, body = self.request('/api/auth/session', cookie=cookie)
        self.assertTrue(json.loads(body)['authenticated'])
        status, headers, _ = self.request('/api/auth/logout', 'POST', {}, cookie)
        self.assertEqual(status, 200)
        self.assertIn('Max-Age=0', headers['Set-Cookie'])
        self.assertEqual(self.request('/api/library', cookie=cookie)[0], 401)

    def test_session_rotation_and_forgery(self):
        first, _ = self.login()
        second, _ = self.login(cookie=first)
        self.assertNotEqual(first, second)
        self.assertEqual(self.request('/api/library', cookie=first)[0], 401)
        self.assertEqual(self.request('/api/library', cookie=second)[0], 200)
        self.assertEqual(self.request('/api/library', cookie=COOKIE_NAME + '=' + 'A' * 43)[0], 401)

    def test_expiration_is_enforced_server_side(self):
        cookie, _ = self.login()
        self.now += SESSION_SECONDS
        self.assertEqual(self.request('/api/library', cookie=cookie)[0], 401)
        self.now += 61
        cookie, set_cookie = self.login(remember=True)
        self.assertIn('Max-Age=' + str(REMEMBER_SECONDS), set_cookie)
        self.now += SESSION_SECONDS + 1
        self.assertEqual(self.request('/api/library', cookie=cookie)[0], 200)
        self.now += REMEMBER_SECONDS
        self.assertEqual(self.request('/api/library', cookie=cookie)[0], 401)

    def test_login_failure_is_generic_and_rate_limited(self):
        responses = []
        for user in ['wrong', 'demo', 'wrong', 'demo', 'demo']:
            status, _, body = self.request('/api/auth/login', 'POST', {'username': user, 'password': 'incorrect'})
            self.assertEqual(status, 401)
            responses.append(body)
        self.assertEqual(len(set(responses)), 1)
        status, headers, _ = self.request('/api/auth/login', 'POST', {'username': 'demo', 'password': 'incorrect'})
        self.assertEqual(status, 429)
        self.assertGreater(int(headers['Retry-After']), 0)
        self.now += 61
        self.login()

    def test_origin_token_and_host_checks_apply_to_auth_endpoints(self):
        payload = {'username': 'demo', 'password': 'synthetic-test-password'}
        for headers in [{'Origin': 'https://other.example'}, {'X-Probe-Token': 'wrong'}, {'Host': 'other.example'}]:
            self.assertEqual(self.request('/api/auth/login', 'POST', payload, headers=headers)[0], 403)
        cookie, _ = self.login()
        self.assertEqual(self.request('/api/auth/logout', 'POST', {}, cookie, {'Origin': 'https://other.example'})[0], 403)
        self.assertEqual(self.request('/api/library', cookie=cookie)[0], 200)

    def test_public_deployment_fails_closed_and_sets_secure_cookie(self):
        for origin in ['https://demo.example', 'http://demo.example']:
            with self.assertRaises(ValueError):
                make_server(StubRuntime(), 0, self.library, public_origin=origin)
        public = make_server(StubRuntime(), 0, self.library, access=self.access, public_origin='https://demo.example')
        try:
            status, cookie, _ = self.access.login('demo', 'synthetic-test-password')
            self.assertEqual(status, 200)
            self.assertIn('Secure', cookie)
        finally:
            public.server_close()

    def test_no_default_account_and_no_plaintext_in_configuration(self):
        self.assertNotIn('synthetic-test-password', json.dumps(self.record))
        for record in [{}, {'username': 'demo'}, {'algorithm': 'plaintext', 'password': 'demo'}]:
            with self.assertRaises(ValueError):
                DemoAccess(record)
        with self.assertRaises(ValueError):
            DemoAccess.from_file('/nonexistent/boveda-config.json')

    def test_public_startup_opens_the_configured_https_origin(self):
        runtime = Mock(busy=False, editorial_worker=None, q3_worker=None)
        http_server = Mock(server_port=8724)
        http_server.serve_forever.side_effect = KeyboardInterrupt
        argv = ['server.py', '--access-config', 'private.json', '--public-origin', 'https://demo.example']
        with patch.object(sys, 'argv', argv), patch.object(server_module, 'Runtime', return_value=runtime), \
                patch.object(server_module.DemoAccess, 'from_file', return_value=self.access), \
                patch.object(server_module, 'make_server', return_value=http_server), \
                patch.object(server_module.threading, 'Timer') as timer, \
                patch.object(server_module.webbrowser, 'open') as open_browser, patch('builtins.print'):
            server_module.main()
            timer.call_args.args[1]()
            open_browser.assert_called_once_with('https://demo.example')
            http_server.server_close.assert_called_once()


if __name__ == '__main__':
    unittest.main()


class RememberRestartTests(unittest.TestCase):
    def test_remember_survives_restart_but_logout_and_expiry_revoke(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'sessions.json'
            record = credential_record('demo', 'synthetic-test-password')
            now = [1000]
            def service():
                return DemoAccess(record, session_path=path, clock=lambda: now[0])
            first = service()
            _, remembered, _ = first.login('demo', 'synthetic-test-password', True)
            _, ordinary, _ = first.login('demo', 'synthetic-test-password', False)
            second = service()
            self.assertTrue(second.authenticated(remembered))
            self.assertFalse(second.authenticated(ordinary))
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)
            second.logout(remembered)
            self.assertFalse(service().authenticated(remembered))
            _, remembered, _ = second.login('demo', 'synthetic-test-password', True)
            now[0] += REMEMBER_SECONDS + 1
            self.assertFalse(service().authenticated(remembered))
            self.assertNotIn('synthetic-test-password', path.read_text())
