import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import { join, resolve } from 'node:path';

const buildDir = resolve('dist-standalone');
const releaseDir = resolve('release');
const releaseName = process.env.RELEASE_TAG ?? 'dev';
if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(releaseName)) {
  throw new Error('Invalid release tag');
}
let html = await readFile(join(buildDir, 'index.html'), 'utf8');
const seen = { js: 0, css: 0 };

// Remove PWA metadata that points to resources which are deliberately not shipped.
html = html.replace(/\s*<link\b[^>]*rel=["'](?:manifest|icon|apple-touch-icon)["'][^>]*>/gi, '');
const scripts = [...html.matchAll(/<script\b([^>]*)\bsrc=["']([^"']+)["']([^>]*)><\/script>/gi)];
for (const m of scripts) {
  const src = m[2];
  if (!/^\.\/assets\/[\w.-]+\.js$/.test(src)) throw new Error('Unexpected external script: ' + src);
  const js = await readFile(join(buildDir, src), 'utf8');
  // Avoid terminating an inline script in HTML and preserve module semantics.
  html = html.replace(m[0], '<script type="module">\n' + js.replace(/<\/script/gi, '<\\/script') + '\n</script>');
  seen.js++;
}
const styles = [...html.matchAll(/<link\b[^>]*rel=["']stylesheet["'][^>]*>/gi)];
for (const m of styles) {
  const href = m[0].match(/\bhref=["']([^"']+)["']/i)?.[1];
  if (!href || !/^\.\/assets\/[\w.-]+\.css$/.test(href)) throw new Error('Unexpected stylesheet: ' + href);
  const css = await readFile(join(buildDir, href), 'utf8');
  html = html.replace(m[0], '<style>\n' + css.replace(/<\/style/gi, '<\\/style') + '\n</style>');
  seen.css++;
}
if (seen.js !== 1 || seen.css < 1) throw new Error('Expected one JS bundle and at least one stylesheet: ' + JSON.stringify(seen));
// Only examine markup, not source-code strings inside the inlined bundles.
const markup = html
  .replace(/<script\\b[^>]*>[\\s\\S]*?<\\/script>/gi, '')
  .replace(/<style\\b[^>]*>[\\s\\S]*?<\\/style>/gi, '');
if (/<(?:script|link)\\b[^>]*(?:src|href)=["'](?:\\.\\/)?assets\\//i.test(markup)) {
  throw new Error('Standalone HTML still references generated assets');
}
if (/\\b(?:src|href)=["'](?:\\/|\\.\\/)(?:icons\\/|manifest\\.webmanifest)/i.test(markup)) {
  throw new Error('Standalone HTML still references PWA assets');
}
const remaining = (await readdir(join(buildDir, 'assets'))).filter(x => !/\.(js|css)$/.test(x));
if (remaining.length) throw new Error('Unexpected non-inlined build assets: ' + remaining.join(', '));
await mkdir(releaseDir, { recursive: true });
const output = join(releaseDir, 'pwa-modeller-' + releaseName + '.html');
await writeFile(output, html);
console.log('Created ' + output + ' (' + Buffer.byteLength(html) + ' bytes)');
