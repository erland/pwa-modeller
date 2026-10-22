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

test('ignores generated asset-looking strings inside embedded JavaScript', async () => {
  const dir = await fixture(document, {
    'app.js': 'const sample = \'<script src="./assets/example.js"></script>\'; console.log(sample);',
    'app.css': 'body { color: red; }',
  });
  try {
    const run = spawnSync(process.execPath, [packager], { cwd: dir, encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('preserves dollar replacement tokens in inlined JS and CSS verbatim', async () => {
  const js = 'const replacements = ["$&", "$' + String.fromCharCode(39) + '", "$' + String.fromCharCode(96) + '", "$' + '{p}"]; console.log(replacements);';
  const css = 'body::before { content: "$&"; }';
  const dir = await fixture(document, {
    'app.js': js,
    'app.css': css,
  });
  try {
    const run = spawnSync(process.execPath, [packager], { cwd: dir, encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
    const output = await readFile(join(dir, 'release', 'pwa-modeller-dev.html'), 'utf8');
    assert.ok(output.includes(js), 'The full JavaScript payload must remain byte-for-byte unchanged');
    assert.ok(output.includes(css), 'The full CSS payload must remain unchanged');
    assert.doesNotMatch(output, /<script\b[^>]*src=/i);
    assert.doesNotMatch(output, /<link\b[^>]*rel="stylesheet"/i);
    const inlineJs = output.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
    assert.ok(inlineJs, 'Expected one inline module');
    const parse = spawnSync(process.execPath, ['--input-type=module', '--check'], { input: inlineJs, encoding: 'utf8' });
    assert.equal(parse.status, 0, parse.stderr);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
