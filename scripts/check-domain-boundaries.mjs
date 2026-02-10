#!/usr/bin/env node
/**
 * Domain service boundary guardrail.
 *
 * Goal: keep heavy non-UI logic independent of UI layers.
 *
 * Enforced rules (minimal and low-risk):
 *  - Files under src/domain/** MUST NOT import from UI folders:
 *      src/components, src/pages, src/portal, src/publisher
 *  - Files under src/diagram/** MUST NOT import from UI folders.
 *  - Files under src/store/** (including ops/) MUST NOT import from UI folders.
 *
 * This is intentionally simple (no AST) to keep it fast and dependency-free.
 */

import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const srcRoot = path.join(repoRoot, 'src');

const UI_DIRS = [
  path.join(srcRoot, 'components'),
  path.join(srcRoot, 'pages'),
  path.join(srcRoot, 'portal'),
  path.join(srcRoot, 'publisher')
];

const GUARDED_DIRS = [
  path.join(srcRoot, 'domain'),
  path.join(srcRoot, 'diagram'),
  path.join(srcRoot, 'store')
];

const CODE_EXTS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];

function isFile(p) {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function isDir(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function walk(dir) {
  /** @type {string[]} */
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'coverage') continue;
      for (const f of walk(full)) out.push(f);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name);
      if (CODE_EXTS.includes(ext)) out.push(full);
    }
  }
  return out;
}

function stripComments(code) {
  // Remove /* */ and // comments (best-effort) to avoid false positives.
  // Note: keeps line structure roughly intact.
  return code
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function extractImportSpecifiers(code) {
  const cleaned = stripComments(code);
  /** @type {string[]} */
  const imports = [];

  // import … from 'x' (best-effort)
  for (const m of cleaned.matchAll(/\bimport\s+[\s\S]*?\s+from\s+['"]([^'"]+)['"];?/g)) {
    imports.push(m[1]);
  }
  // import('x')
  for (const m of cleaned.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    imports.push(m[1]);
  }
  // require('x')
  for (const m of cleaned.matchAll(/\brequire\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    imports.push(m[1]);
  }

  return imports;
}

function resolveImport(fromFile, spec) {
  // Only enforce for relative imports; external packages are fine.
  if (!spec.startsWith('.')) return null;

  const base = path.resolve(path.dirname(fromFile), spec);

  // Direct file with extension
  if (isFile(base)) return base;

  // Try extensions
  for (const ext of CODE_EXTS) {
    if (isFile(base + ext)) return base + ext;
  }

  // Directory import: try index.*
  if (isDir(base)) {
    for (const ext of CODE_EXTS) {
      const idx = path.join(base, 'index' + ext);
      if (isFile(idx)) return idx;
    }
  }

  return null;
}

function isUnder(child, parent) {
  const rel = path.relative(parent, child);
  return rel === '' || (!rel.startsWith('..' + path.sep) && rel !== '..');
}

function prettyRel(p) {
  return path.relative(repoRoot, p).split(path.sep).join('/');
}

/** @type {{from: string, to: string, spec: string}[]} */
const violations = [];

for (const guarded of GUARDED_DIRS) {
  if (!isDir(guarded)) continue;
  for (const file of walk(guarded)) {
    const code = fs.readFileSync(file, 'utf8');
    const specs = extractImportSpecifiers(code);
    for (const spec of specs) {
      const resolved = resolveImport(file, spec);
      if (!resolved) continue;
      for (const uiDir of UI_DIRS) {
        if (isUnder(resolved, uiDir)) {
          violations.push({ from: file, to: resolved, spec });
          break;
        }
      }
    }
  }
}

if (violations.length > 0) {
  console.error('\n❌ Domain boundary violations found.');
  console.error('Guarded layers (domain/diagram/store) must not import UI layers (components/pages/portal/publisher).\n');
  for (const v of violations) {
    console.error(`- ${prettyRel(v.from)} imports ${v.spec} -> ${prettyRel(v.to)}`);
  }
  console.error(`\nFix: move the logic into src/domain/** (or src/diagram/**) and have UI import it, not the other way around.\n`);
  process.exit(1);
}

console.log('✅ Domain boundary check passed.');
