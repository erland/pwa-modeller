#!/usr/bin/env node
/**
 * CI guardrail: disallow literal "..." in docs/comments.
 *
 * Why: triple-dots in comments/docs can look like "file truncated" to patching tools/LLMs.
 *
 * Allowed:
 *   - real JS/TS spread/rest operator usage in code (e.g. {...obj}, fn(...args))
 *
 * Blocked:
 *   - "..." anywhere in Markdown
 *   - "..." inside JS/TS comments (and in Markdown)
 */

import fs from "node:fs";
import path from "node:path";

const PROJECT_ROOT = path.resolve(process.cwd());

const INCLUDE_DIRS = ["src", "docs"];
const INCLUDE_FILES = ["README.md"];

const CODE_EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".cjs", ".mjs"]);
const MD_EXTS = new Set([".md"]);

const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".git",
  ".vite",
]);

/** Recursively collect files under a directory, skipping common build dirs. */
function collectFiles(dir) {
  const out = [];
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    let ents;
    try {
      ents = fs.readdirSync(cur, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const ent of ents) {
      const full = path.join(cur, ent.name);
      if (ent.isDirectory()) {
        if (SKIP_DIRS.has(ent.name)) continue;
        stack.push(full);
      } else if (ent.isFile()) {
        out.push(full);
      }
    }
  }
  return out;
}

/**
 * Find "..." inside comments/strings/templates for JS/TS-like files.
 * Tiny lexer:
 * - Allows spread/rest in normal code and inside template ${...} expressions.
 * - Flags "..." in:
 *   - line comments
 *   - block comments
 *   - 'single' and "double" string literals
 *   - template literal raw text (the parts outside ${...})
 */
function findEllipsesInCode(text) {
  const hits = [];

  /** @type {Array<{type: string, braceDepth?: number}>} */
  const stack = [{ type: "normal" }];

  let i = 0;
  let line = 1;
  let col = 1;

  function cur() {
    return stack[stack.length - 1];
  }
  function push(frame) {
    stack.push(frame);
  }
  function pop() {
    if (stack.length > 1) stack.pop();
  }

  function advance(n = 1) {
    for (let k = 0; k < n; k++) {
      const ch = text[i++];
      if (ch === "\n") {
        line++;
        col = 1;
      } else {
        col++;
      }
    }
  }

  function peek(n = 0) {
    return text[i + n];
  }

  while (i < text.length) {
    const ch = peek(0);
    const ch2 = ch + (peek(1) ?? "");
    const ch3 = ch2 + (peek(2) ?? "");
    const t = cur().type;

    const banned = t === "sl_comment" || t === "ml_comment";

    if (ch3 === "..." && banned) {
      hits.push({ index: i, line, col });
      advance(3);
      continue;
    }

    // NORMAL-LIKE (includes template_expr)
    if (t === "normal" || t === "template_expr") {
      if (ch2 === "//") {
        push({ type: "sl_comment" });
        advance(2);
        continue;
      }
      if (ch2 === "/*") {
        push({ type: "ml_comment" });
        advance(2);
        continue;
      }
      if (ch === "'") {
        push({ type: "s_quote" });
        advance(1);
        continue;
      }
      if (ch === '"') {
        push({ type: "d_quote" });
        advance(1);
        continue;
      }
      if (ch === "`") {
        push({ type: "template_text" });
        advance(1);
        continue;
      }

      if (t === "template_expr") {
        // Track braces in ${ ... } so we can find the closing '}'
        if (ch === "{") {
          cur().braceDepth = (cur().braceDepth ?? 0) + 1;
          advance(1);
          continue;
        }
        if (ch === "}") {
          const d = cur().braceDepth ?? 0;
          if (d === 0) {
            pop(); // end of ${...}
            advance(1);
            continue;
          }
          cur().braceDepth = d - 1;
          advance(1);
          continue;
        }
      }

      advance(1);
      continue;
    }

    // TEMPLATE RAW TEXT
    if (t === "template_text") {
      if (ch2 === "${") {
        push({ type: "template_expr", braceDepth: 0 });
        advance(2);
        continue;
      }
      if (ch === "`") {
        pop(); // end template
        advance(1);
        continue;
      }
      if (ch === "\\") {
        advance(2);
        continue;
      }
      advance(1);
      continue;
    }

    // SINGLE LINE COMMENT
    if (t === "sl_comment") {
      if (ch === "\n") {
        pop();
      }
      advance(1);
      continue;
    }

    // MULTI LINE COMMENT
    if (t === "ml_comment") {
      if (ch2 === "*/") {
        pop();
        advance(2);
        continue;
      }
      advance(1);
      continue;
    }

    // STRINGS (tracked to avoid mis-detecting comments inside strings)
    if (t === "s_quote") {
      if (ch === "\\") {
        advance(2);
        continue;
      }
      if (ch === "'") {
        pop();
        advance(1);
        continue;
      }
      advance(1);
      continue;
    }

    if (t === "d_quote") {
      if (ch === "\\") {
        advance(2);
        continue;
      }
      if (ch === '"') {
        pop();
        advance(1);
        continue;
      }
      advance(1);
      continue;
    }

    // Fallback
    advance(1);
  }

  return hits;
}

function getLineSnippet(text, targetLine) {
  const lines = text.split(/\r?\n/);
  const idx = Math.max(0, Math.min(lines.length - 1, targetLine - 1));
  return lines[idx];
}

function formatHit(relPath, line, col, snippet) {
  const pointer = " ".repeat(Math.max(0, col - 1)) + "^";
  return [
    `${relPath}:${line}:${col} found "..."`,
    `  ${snippet}`,
    `  ${pointer}`,
  ].join("\n");
}

const files = [];

// include dirs
for (const d of INCLUDE_DIRS) {
  const abs = path.join(PROJECT_ROOT, d);
  files.push(...collectFiles(abs));
}
// include specific files
for (const f of INCLUDE_FILES) {
  files.push(path.join(PROJECT_ROOT, f));
}

let failures = [];

for (const file of files) {
  const ext = path.extname(file).toLowerCase();
  if (!CODE_EXTS.has(ext) && !MD_EXTS.has(ext)) continue;

  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    continue;
  }

  const rel = path.relative(PROJECT_ROOT, file).replaceAll("\\", "/");

  if (MD_EXTS.has(ext)) {
    const idx = text.indexOf("...");
    if (idx !== -1) {
      const before = text.slice(0, idx);
      const line = before.split(/\r?\n/).length;
      const col = before.length - before.lastIndexOf("\n");
      failures.push(formatHit(rel, line, col, getLineSnippet(text, line)));
    }
    continue;
  }

  const hits = findEllipsesInCode(text);
  for (const h of hits) {
    failures.push(formatHit(rel, h.line, h.col, getLineSnippet(text, h.line)));
  }
}

if (failures.length) {
  console.error(`\n❌ Disallowed literal "..." found in docs/comments (${failures.length} hit(s)):\n`);
  console.error(failures.join("\n\n"));
  console.error(`\nFix: replace "..." with "…" (Unicode ellipsis) or a clearer placeholder.\n`);
  process.exit(1);
} else {
  console.log('✅ No disallowed "..." found in docs/comments.');
}
