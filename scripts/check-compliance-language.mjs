#!/usr/bin/env node
/**
 * Markdown + MDX compliance-language sweep (D104 + D136).
 *
 * ESLint's no-restricted-syntax rules cover TS / TSX / JS / JSX / MJS
 * source files. Markdown + MDX content authored under docs/ (excluding
 * the docs/research/ archive tree where Cerebral $7M settlement
 * citations + EDPB photo-ID anti-pattern citations + DPO precedent
 * quotes live verbatim) needs the same enforcement gate so a future
 * marketing-MDX page or runbook revision cannot regress the D104 / D136
 * posture.
 *
 * Scope:
 *   - Walk: every *.md + *.mdx under the repo, excluding
 *     docs/research/, node_modules/, .next/, .velite/, dist/, build/,
 *     coverage/.
 *   - Patterns banned: /HIPAA[-\s]compli(?:ant|ance)/i + /\bDPO\b/i.
 *   - Exit 1 on any match + print file:line:match excerpt so the
 *     verify pipeline fails loudly.
 *
 * Why a Node script rather than eslint-plugin-mdx + markdown plugins:
 *   the plugin surface is heavy + drags in a TS/JS-AST parser for
 *   markdown nodes. A grep-shaped script does the job at zero plugin
 *   overhead and is the documented 2026 pattern for content-language
 *   gates outside the ESLint surface.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import process from 'node:process';

const repoRoot = process.cwd();

// Skip the research archive (intentional verbatim citations live
// there) + the standard generated/installed tree.
const SKIP_DIRS = new Set([
  'node_modules',
  '.next',
  '.velite',
  '.turbo',
  '.sst',
  '.open-next',
  'dist',
  'build',
  'coverage',
  'playwright-report',
  'test-results',
  'research', // docs/research/ — Round-X audit archives with verbatim citations
]);

const SKIP_PATH_FRAGMENTS = [
  // Doc files that explicitly document the bans + cite the strings.
  // The eslint.config.mjs file itself is JS (caught by ESLint's own
  // rules); these are docs that cite the rule for humans.
  ['docs', 'adr'],
];

const HIPAA_PATTERN = /HIPAA[-\s]compli(?:ant|ance)/i;
const DPO_PATTERN = /\bDPO\b/i;

const violations = [];

function walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.git')) continue;
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(join(dir, entry.name));
    } else if (entry.isFile() && (entry.name.endsWith('.md') || entry.name.endsWith('.mdx'))) {
      const fullPath = join(dir, entry.name);
      const rel = relative(repoRoot, fullPath);
      const parts = rel.split(sep);
      const skip = SKIP_PATH_FRAGMENTS.some((frag) =>
        frag.every((segment, i) => parts[i] === segment),
      );
      if (skip) continue;
      scan(fullPath, rel);
    }
  }
}

function scan(fullPath, rel) {
  let content;
  try {
    content = readFileSync(fullPath, 'utf8');
  } catch {
    return;
  }
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line === undefined) continue;
    if (HIPAA_PATTERN.test(line)) {
      violations.push({
        file: rel,
        line: i + 1,
        rule: 'D104',
        message: 'Never claim "HIPAA-compliant" or "HIPAA compliance" — use "HIPAA-aligned"',
        excerpt: line.trim(),
      });
    }
    if (DPO_PATTERN.test(line)) {
      violations.push({
        file: rel,
        line: i + 1,
        rule: 'D136',
        message: 'Use "Privacy Lead" — never "DPO" as a self-applied title',
        excerpt: line.trim(),
      });
    }
  }
}

walk(repoRoot);

if (violations.length === 0) {
  console.log('check-compliance-language: 0 violations across markdown + MDX surface');
  process.exit(0);
}

console.error(`check-compliance-language: ${violations.length} violation(s) found:\n`);
for (const v of violations) {
  console.error(`  ${v.file}:${v.line} [${v.rule}] ${v.message}`);
  console.error(`    ${v.excerpt.slice(0, 160)}`);
}
process.exit(1);
