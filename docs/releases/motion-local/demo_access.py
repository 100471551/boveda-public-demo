"""One configured demo account and opaque, revocable browser sessions.

No registration, user database or analytical/runtime dependencies.
"""
import argparse
from collections import deque
import getpass
import hashlib
import hmac
from http.cookies import CookieError, SimpleCookie
import json
import os
from pathlib import Path
import secrets
import tempfile
import threading
import time


ITERATIONS = 600_000
SESSION_SECONDS = 8 * 60 * 60
REMEMBER_SECONDS = 14 * 24 * 60 * 60
COOKIE_NAME = 'boveda_demo_session'


def credential_record(username, password):
    if not isinstance(username, str) or not 1 <= len(username) <= 128 or username != username.strip():
        raise ValueError('Choose a username between 1 and 128 characters, without surrounding spaces.')
    if not isinstance(password, str) or not 12 <= len(password) <= 512:
        raise ValueError('Choose a password between 12 and 512 characters.')
    salt = secrets.token_bytes(32)
    digest = hashlib.pbkdf2_hmac('sha256', password.encode(), salt, ITERATIONS)
    return {'username': username, 'algorithm': 'pbkdf2_sha256', 'iterations': ITERATIONS,
            'salt': salt.hex(), 'password_hash': digest.hex()}


def write_credentials(path, record):
    """Create privately and exclusively; changing an account is an explicit action."""
    path = Path(path).expanduser()
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w') as stream:
        json.dump(record, stream, indent=2)
        stream.write('\n')


class DemoAccess:
    def __init__(self, record, *, secure=False, clock=time.time, session_path=None):
        try:
            self.username = record['username']
            self.iterations = record['iterations']
            self.salt = bytes.fromhex(record['salt'])
            self.digest = bytes.fromhex(record['password_hash'])
            if (record['algorithm'] != 'pbkdf2_sha256' or not isinstance(self.username, str)
                    or not 1 <= len(self.username) <= 128 or type(self.iterations) is not int
                    or not ITERATIONS <= self.iterations <= 2_000_000
                    or len(self.salt) != 32 or len(self.digest) != 32):
                raise ValueError()
        except (KeyError, TypeError, ValueError):
            raise ValueError('Invalid demo access configuration') from None
        self.secure = secure
        self.clock = clock
        self.lock = threading.Lock()
        self.sessions = {}
        self.remembered = set()
        self.session_path = Path(session_path) if session_path else None
        self.version = hashlib.sha256(json.dumps(record, sort_keys=True).encode()).hexdigest()
        if self.session_path and self.session_path.exists():
            try:
                saved = json.loads(self.session_path.read_text())
                if saved.get('version') == self.version:
                    self.sessions = {k: v for k, v in saved.get('sessions', {}).items()
                                     if isinstance(k, str) and len(k) == 64
                                     and isinstance(v, (int, float)) and v > self.clock()}
                    self.remembered = set(self.sessions)
            except (OSError, ValueError, TypeError):
                pass
        # A shared account gets a shared limit, including behind the local proxy.
        # No IP address, password or user-submitted identifier is retained.
        self.attempts = deque()

    @classmethod
    def from_file(cls, path, **kwargs):
        try:
            record = json.loads(Path(path).expanduser().read_text())
        except (OSError, ValueError):
            raise ValueError('Cannot load the demo access configuration') from None
        kwargs.setdefault('session_path', Path(path).expanduser().with_suffix('.sessions.json'))
        return cls(record, **kwargs)

    def _save_sessions(self):
        if not self.session_path:
            return
        self.session_path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        fd, temporary = tempfile.mkstemp(dir=self.session_path.parent)
        try:
            with os.fdopen(fd, 'w') as stream:
                json.dump({'version': self.version, 'sessions': {
                    k: v for k, v in self.sessions.items() if k in self.remembered}}, stream)
            os.replace(temporary, self.session_path)
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)

    def _key(self, header):
        try:
            cookie = SimpleCookie()
            cookie.load(header or '')
            value = cookie[COOKIE_NAME].value
            if len(value) != 43:
                return None
            return hashlib.sha256(value.encode()).hexdigest()
        except (KeyError, CookieError, UnicodeError):
            return None

    def _prune(self, now):
        for key, expires in list(self.sessions.items()):
            if expires <= now:
                del self.sessions[key]

    def authenticated(self, header):
        key = self._key(header)
        with self.lock:
            self._prune(self.clock())
            return key is not None and key in self.sessions

    def login(self, username, password, remember=False, old_cookie=None):
        """Return (HTTP status, cookie or None, retry-after seconds)."""
        if (not isinstance(username, str) or not isinstance(password, str)
                or len(username) > 128 or len(password) > 512 or type(remember) is not bool):
            return 400, None, 0
        now = self.clock()
        with self.lock:
            while self.attempts and self.attempts[0] <= now - 60:
                self.attempts.popleft()
            if len(self.attempts) >= 5:
                return 429, None, max(1, int(60 - (now - self.attempts[0])) + 1)
            self.attempts.append(now)
        candidate = hashlib.pbkdf2_hmac('sha256', password.encode(), self.salt, self.iterations)
        user_matches = hmac.compare_digest(username.encode(), self.username.encode())
        password_matches = hmac.compare_digest(candidate, self.digest)
        if not (user_matches and password_matches):
            return 401, None, 0
        value = secrets.token_urlsafe(32)
        duration = REMEMBER_SECONDS if remember else SESSION_SECONDS
        with self.lock:
            self._prune(self.clock())
            self.sessions.pop(self._key(old_cookie), None)
            if len(self.sessions) >= 256:
                del self.sessions[min(self.sessions, key=self.sessions.get)]
            key = hashlib.sha256(value.encode()).hexdigest()
            self.sessions[key] = self.clock() + duration
            if remember:
                self.remembered.add(key)
            self._save_sessions()
        return 200, self.cookie(value, duration if remember else None), 0

    def cookie(self, value='', max_age=None):
        cookie = SimpleCookie()
        cookie[COOKIE_NAME] = value
        item = cookie[COOKIE_NAME]
        item['path'] = '/'
        item['httponly'] = True
        item['samesite'] = 'Lax'
        if self.secure:
            item['secure'] = True
        if max_age is not None:
            item['max-age'] = str(max_age)
        return item.OutputString()

    def logout(self, header):
        with self.lock:
            self.sessions.pop(self._key(header), None)
            self._save_sessions()
        return self.cookie(max_age=0)


def main():
    parser = argparse.ArgumentParser(description='Create the single account used to access the Bóveda demo.')
    parser.add_argument('--config', required=True, type=Path)
    parser.add_argument('--username', required=True)
    args = parser.parse_args()
    password = getpass.getpass('Demo password: ')
    if password != getpass.getpass('Confirm password: '):
        parser.error('Passwords do not match')
    try:
        write_credentials(args.config, credential_record(args.username, password))
    except (OSError, ValueError) as exc:
        parser.error(str(exc))
    print('Demo access configuration created. The plaintext password was not stored.')


if __name__ == '__main__':
    main()
