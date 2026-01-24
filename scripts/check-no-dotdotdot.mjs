#!/usr/bin/env node
/**
 * CI guardrail: disallow literal three-dot ellipses in Markdown and in code comments.
 *
 * Why: "…" in docs/comments can look like "file truncated" to patching tools/LLMs.
 *
 * Allowed:
 *  - Real JS/TS spread/rest operator usage in code (e.g. {…obj}, fn(…args))
 *
 * Blocked:
 *  - Three-dot ellipses in Markdown
 *  - Three-dot ellipses inside JS/TS comments
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

const MARKDOWN_EXTS = new Set(['.md', '.mdx']);
const CODE_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

function isIgnoredDir(name) {
  return (
    name === 'node_modules' ||
    name === 'dist' ||
    name === 'build' ||
    name === '.git' ||
    name === '.vite' ||
    name === 'coverage'
  );
}

function walk(dir, out) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (isIgnoredDir(e.name)) continue;
      walk(full, out);
    } else if (e.isFile()) {
      out.push(full);
    }
  }
}

function getLineCol(text, index) {
  let line = 1;
  let col = 1;
  for (let i = 0; i < index; i++) {
    if (text[i] === '\n') {
      line++;
      col = 1;
    } else {
      col++;
    }
  }
  return { line, col };
}

function getLineSnippet(text, line) {
  const lines = text.split('\n');
  return (lines[line - 1] ?? '').slice(0, 220);
}

function findEllipsesInMarkdown(text) {
  const hits = [];
  let idx = text.indexOf('...');
  while (idx !== -1) {
    const { line, col } = getLineCol(text, idx);
    hits.push({ line, col });
    idx = text.indexOf('...', idx + 3);
  }
  return hits;
}

/**
 * Scan for "…" inside comments, while ignoring strings/templates.
 * This is a lightweight state machine; it does not aim to be a perfect JS parser.
 */
function findEllipsesInCode(text) {
  const hits = [];
  let i = 0;
  let line = 1;
  let col = 1;

  const advance = (ch) => {
    i++;
    if (ch === '\n') {
      line++;
      col = 1;
    } else {
      col++;
    }
  };

  let state = 'code'; // code | line_comment | block_comment | single | double | template
  let blockDepth = 0;

  while (i < text.length) {
    const ch = text[i];
    const next = text[i + 1];

    // Helpers to record a hit at current position
    const maybeHit = () => {
      if (text.startsWith('...', i)) {
        hits.push({ line, col });
      }
    };

    if (state === 'code') {
      // Enter comments
      if (ch === '/' && next === '/') {
        state = 'line_comment';
        advance(ch);
        advance(next);
        continue;
      }
      if (ch === '/' && next === '*') {
        state = 'block_comment';
        blockDepth = 1;
        advance(ch);
        advance(next);
        continue;
      }

      // Enter strings
      if (ch === "'") {
        state = 'single';
        advance(ch);
        continue;
      }
      if (ch === '"') {
        state = 'double';
        advance(ch);
        continue;
      }
      if (ch === '`') {
        state = 'template';
        advance(ch);
        continue;
      }

      advance(ch);
      continue;
    }

    if (state === 'line_comment') {
      maybeHit();
      if (ch === '\n') {
        state = 'code';
      }
      advance(ch);
      continue;
    }

    if (state === 'block_comment') {
      maybeHit();
      if (ch === '/' && next === '*') {
        // nested block comment
        blockDepth++;
        advance(ch);
        advance(next);
        continue;
      }
      if (ch === '*' && next === '/') {
        blockDepth--;
        advance(ch);
        advance(next);
        if (blockDepth <= 0) state = 'code';
        continue;
      }
      advance(ch);
      continue;
    }

    // String states: skip over escaped characters
    if (state === 'single') {
      if (ch === '\\') {
        advance(ch);
        if (i < text.length) advance(text[i]);
        continue;
      }
      if (ch === "'") {
        state = 'code';
      }
      advance(ch);
      continue;
    }

    if (state === 'double') {
      if (ch === '\\') {
        advance(ch);
        if (i < text.length) advance(text[i]);
        continue;
      }
      if (ch === '"') {
        state = 'code';
      }
      advance(ch);
      continue;
    }

    if (state === 'template') {
      if (ch === '\\') {
        advance(ch);
        if (i < text.length) advance(text[i]);
        continue;
      }
      if (ch === '`') {
        state = 'code';
        advance(ch);
        continue;
      }
      // Ignore ${…} expressions as code (so comments inside are treated as code)
      if (ch === '$' && next === '{') {
        advance(ch);
        advance(next);
        // consume until matching }
        let depth = 1;
        while (i < text.length && depth > 0) {
          const c = text[i];
          if (c === '\\') {
            advance(c);
            if (i < text.length) advance(text[i]);
            continue;
          }
          if (c === '{') depth++;
          if (c === '}') depth--;
          advance(c);
        }
        continue;
      }
      advance(ch);
      continue;
    }

    // fallback
    advance(ch);
  }

  return hits;
}

function formatHit(rel, line, col, snippet) {
  return `${rel}:${line}:${col}\n  ${snippet}`;
}

const files = [];
walk(ROOT, files);

const failures = [];

for (const file of files) {
  const ext = path.extname(file).toLowerCase();
  if (!MARKDOWN_EXTS.has(ext) && !CODE_EXTS.has(ext)) continue;

  const rel = path.relative(ROOT, file);
  const text = fs.readFileSync(file, 'utf8');

  if (MARKDOWN_EXTS.has(ext)) {
    const hits = findEllipsesInMarkdown(text);
    for (const h of hits) failures.push(formatHit(rel, h.line, h.col, getLineSnippet(text, h.line)));
    continue;
  }

  const hits = findEllipsesInCode(text);
  for (const h of hits) failures.push(formatHit(rel, h.line, h.col, getLineSnippet(text, h.line)));
}

if (failures.length) {
  console.error(`\n❌ Disallowed three-dot ellipses found in docs/comments (${failures.length} hit(s)):\n`);
  console.error(failures.join('\n\n'));
  console.error('\nFix: replace "..." with "…" (Unicode ellipsis) or a clearer placeholder.\n');
  process.exit(1);
} else {
  console.log('✅ No disallowed three-dot ellipses found in docs/comments.');
}
