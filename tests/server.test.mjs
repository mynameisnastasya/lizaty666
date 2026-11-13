import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequestHandler } from '../server.mjs';

let root, server, baseUrl;
test.before(async () => {
  root = await mkdtemp(join(tmpdir(), 'liz-railway-web-'));
  await writeFile(join(root, 'index.html'), '<!doctype html><title>LIZ_TY666</title>');
  await writeFile(join(root, 'about.html'), 'About');
  await writeFile(join(root, 'styles.css'), 'body { color: red }');
  await writeFile(join(root, '.env'), 'SECRET=must-not-be-served');
  await writeFile(join(root, 'README.md'), 'internal documentation');
  await mkdir(join(root, 'assets'));
  await writeFile(join(root, 'assets', 'logo.svg'), '<svg></svg>');
  await symlink('/etc/hosts', join(root, 'assets', 'escape.txt'));
  server = createServer(createRequestHandler(root));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  baseUrl = 'http://127.0.0.1:' + server.address().port;
});
test.after(async () => {
  await new Promise(resolve => server.close(resolve));
  await rm(root, { recursive: true, force: true });
});
test('healthcheck is read-only and does not leak details', async () => {
  const res = await fetch(baseUrl + '/health');
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, service: 'lizaty666-web' });
  assert.equal(res.headers.get('cache-control'), 'no-store');
});
test('existing public HTML pages are served', async () => {
  for (const [path, value] of [['/', 'LIZ_TY666'], ['/about.html', 'About']]) {
    const res = await fetch(baseUrl + path);
    assert.equal(res.status, 200);
    assert.match(await res.text(), new RegExp(value));
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(res.headers.get('cache-control'), 'no-cache, must-revalidate');
  }
});
test('static assets have correct MIME and cache control', async () => {
  const res = await fetch(baseUrl + '/assets/logo.svg');
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'image/svg+xml');
  assert.equal(res.headers.get('cache-control'), 'public, max-age=3600');
});
test('HEAD does not send a body', async () => {
  const res = await fetch(baseUrl + '/styles.css', { method: 'HEAD' });
  assert.equal(res.status, 200);
  assert.equal(await res.text(), '');
  assert.equal(res.headers.get('content-length'), String('body { color: red }'.length));
});
test('no dotfiles, unsupported types, traversal, directories or symlink escape', async () => {
  const urls = [
    '/.env', '/README.md', '/.git/config', '/assets/escape.txt',
    '/%2eenv', '/%252eenv', '/assets/../.env', '/assets/%2e%2e/.env',
    '/%00bad.html', '/assets/%5cescape.txt', '/missing.html', '/assets/',
  ];
  for (const path of urls) {
    const res = await fetch(baseUrl + path, { redirect: 'manual' });
    assert.equal(res.status, 404, path);
    assert.doesNotMatch(await res.text(), /SECRET=|internal documentation|localhost|127\\.0\\.0\\.1/);
  }
});
test('mutating requests are rejected; no permissive CORS', async () => {
  for (const method of ['POST', 'PUT', 'DELETE', 'OPTIONS']) {
    const res = await fetch(baseUrl + '/', { method, headers: { Origin: 'https://example.net' } });
    assert.equal(res.status, 405, method);
    assert.equal(res.headers.get('allow'), 'GET, HEAD');
    assert.equal(res.headers.get('access-control-allow-origin'), null);
  }
});
