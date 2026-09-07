"""Read repository attribution from audit-bound Git metadata, never infer it."""
import configparser
import json
import re
from pathlib import Path
from urllib.parse import urlsplit


def github_url(value):
    """Canonical public link; do not expose remote credentials or URL parameters."""
    if not isinstance(value, str) or any(c.isspace() for c in value):
        return None
    if value.startswith('git@github.com:'):
        value = 'https://github.com/' + value[len('git@github.com:'):]
    try:
        url = urlsplit(value)
        if url.scheme not in ('https', 'http', 'ssh', 'git') or url.hostname != 'github.com' or url.port:
            return None
        path = url.path.rstrip('/')
        if path.endswith('.git'):
            path = path[:-4]
        if not re.fullmatch(r'/[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?/[A-Za-z0-9_.-]+', path):
            return None
        if path.rsplit('/', 1)[-1] in ('.', '..'):
            return None
        return 'https://github.com' + path
    except ValueError:
        return None


def _bounded_file(path, boundary):
    if not path.resolve().is_relative_to(boundary.resolve()) or path.is_symlink():
        raise ValueError('Metadata escapes its bound directory')
    if path.stat().st_size > 1024 * 1024:
        raise ValueError('Metadata exceeds read limit')
    return path.read_text(encoding='utf-8')


def repository_url(workspace, canonical_root, project_id):
    """Only read matching run metadata and that exact project's local Git config.

    No parent-repository discovery, git execution, includes, network request,
    README scan, title mapping or analytical writes. Missing/ambiguous origins
    remain unavailable. Runtime snapshots preserve the same metadata.
    """
    try:
        workspace, root = Path(workspace), Path(canonical_root)
        sources = set()
        for path in (root / 'runs').glob('*/run_metadata.json'):
            metadata = json.loads(_bounded_file(path, root))
            if metadata.get('project_id') != project_id:
                continue
            source = metadata.get('project_root')
            if isinstance(source, str) and source:
                sources.add((workspace / source).resolve())
        if len(sources) != 1:
            return None
        source = sources.pop()
        if not source.is_relative_to((workspace / 'projects').resolve()):
            return None
        config = configparser.ConfigParser(interpolation=None, strict=True)
        config.read_string(_bounded_file(source / '.git/config', source))
        return github_url(config.get('remote "origin"', 'url', fallback=None))
    except (OSError, ValueError, TypeError, AttributeError, configparser.Error):
        return None
