import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('../web/analytics.js', import.meta.url), 'utf8');

function run(hash) {
  const listeners = new Map();
  const window = {
    addEventListener(name, listener) { listeners.set(name, listener); },
  };
  vm.runInNewContext(source, {window, location: {hash}, URL});
  return {window, listeners};
}

test('analytics records safe, meaningful hash routes without audit identifiers', () => {
  const {window, listeners} = run('#audit/audit_secret-id/signals?token=secret');
  assert.equal(window.vaq[1][0], 'pageview');
  assert.equal(window.vaq[1][1].path, '/audit/overview');

  const sanitized = window.vaq[0][1]({type: 'pageview', url: 'https://boveda.dev/?credential=secret#audit/private-id/signals'});
  assert.equal(sanitized.url, 'https://boveda.dev/');

  const location = {hash: '#audit/private-audit/evidence'};
  const nextWindow = {addEventListener(name, listener) { this.listener = listener; }};
  vm.runInNewContext(source, {window: nextWindow, location});
  assert.equal(nextWindow.vaq[1][0], 'pageview');
  assert.equal(nextWindow.vaq[1][1].path, '/audit/evidence');
  location.hash = '#raw/private-audit';
  nextWindow.listener();
  assert.equal(nextWindow.vaq[2][0], 'pageview');
  assert.equal(nextWindow.vaq[2][1].path, '/audit/canonical');
  assert.doesNotMatch(JSON.stringify(nextWindow.vaq), /private-audit|secret|token/);
  assert.equal(typeof listeners.get('hashchange'), 'function');
});

test('analytics collapses unknown routes and ignores query strings', () => {
  const {window} = run('#unknown?credential=secret');
  assert.equal(window.vaq[1][0], 'pageview');
  assert.equal(window.vaq[1][1].path, '/home');
});

test('analytics deduplicates hash changes within the same normalized section', () => {
  const location = {hash: '#project/private-id'};
  const window = {addEventListener(name, listener) { this.listener = listener; }};
  vm.runInNewContext(source, {window, location, URL});
  assert.equal(window.vaq[1][1].path, '/project');
  location.hash = '#project/different-private-id';
  window.listener();
  assert.equal(window.vaq.length, 2);
});
