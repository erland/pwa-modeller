import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';

const packager = resolve('scripts/package-standalone.mjs');

async function fixture(html, assets) {
  const dir = await mkdtemp(join(tmpdir(), 'standalone-package-'));
  await mkdir(join(dir, 'dist-standalone', 'assets'), { recursive: true });
  await writeFile(join(dir, 'dist-standalone', 'index.html'), html);
  for (const [name, value] of Object.entries(assets)) {
    await writeFile(join(dir, 'dist-standalone', 'assets', name), value);
  }
  return dir;
}

const document = '<!doctype html><html><head><link rel="manifest" href="./manifest.webmanifest"><link rel="stylesheet" crossorigin href="./assets/app.css"></head><body><div id="root"></div><script type="module" crossorigin src="./assets/app.js"></script></body></html>';

test('embeds JS and CSS, removing the PWA manifest', async () => {
  const dir = await fixture(document, {
    'app.js': 'console.log("standalone");',
    'app.css': 'body { color: red; }',
  });
  try {
    const run = spawnSync(process.execPath, [packager], { cwd: dir, encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
    const output = await readFile(join(dir, 'release', 'pwa-modeller-dev.html'), 'utf8');
    assert.match(output, /<script type="module">/);
    assert.match(output, /console\.log\("standalone"\)/);
    assert.match(output, /<style>/);
    assert.match(output, /body \{ color: red; \}/);
    assert.doesNotMatch(output, /manifest\.webmanifest|assets\/app\.(?:js|css)/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('rejects additional assets that would be missing from single file', async () => {
  const dir = await fixture(document, {
    'app.js': 'console.log("standalone");',
    'app.css': 'body { color: red; }',
    'extra.wasm': 'not actually wasm',
  });
  try {
    const run = spawnSync(process.execPath, [packager], { cwd: dir, encoding: 'utf8' });
    assert.notEqual(run.status, 0);
    assert.match(run.stderr, /Unexpected non-inlined build assets/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('rejects unknown external JavaScript sources', async () => {
  const dir = await fixture(document.replace('./assets/app.js', 'https://example.com/app.js'), {
    'app.js': 'console.log("standalone");',
    'app.css': 'body { color: red; }',
  });
  try {
    const run = spawnSync(process.execPath, [packager], { cwd: dir, encoding: 'utf8' });
    assert.notEqual(run.status, 0);
    assert.match(run.stderr, /Unexpected external script/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
