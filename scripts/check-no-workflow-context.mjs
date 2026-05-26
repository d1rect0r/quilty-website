#!/usr/bin/env node
/**
 * META-2 source-comment hygiene gate (project-wide convention).
 *
 * Source files MUST NOT carry workflow-context references —
 * M-numbers (M1, M1.5, M3, M6, ...), Round-N audit refs,
 * Wave-N sprint refs, Cluster-N taxonomy refs, "this sprint" /
 * "next sprint" / "the audit found" phrasing, Commit-N refs,
 * `@quilty/<role>-reviewer` agent-name refs, JIRA/Linear/GH
 * issue-number refs. Only permanent documentation references
 * survive code review:
 *
 *   - D-numbers (D1-D195+)
 *   - ADR-NNNN
 *   - RFC / WCAG SC / CVE / HIPAA § / GDPR Article / FTC §
 *
 * Why this exists: the canon at META-2 is that source-file
 * comments outlive the sprint that produced them. A "Wave 4
 * close-pass found" reference in 2026 source is meaningless to
 * a 2027 reader; the same idea written as "consent-server perf
 * chokepoint per D63" stays legible.
 *
 * Configuration:
 *   - All patterns + scopes + exclusions live in
 *     `scripts/meta-policy.json`. Adding a new META-N convention
 *     is a config edit, not an executable edit.
 *
 * Escape hatch:
 *   - A line that matches a forbidden pattern AND contains
 *     `META-2-allow: <rationale>` on the same line is treated as
 *     an explicit override (rationale required for git-blame
 *     audit traceability). Use sparingly + only when the matched
 *     substring is legitimate (e.g., a vendor SKU 'M3').
 *
 * Discoverability:
 *   - See `docs/runbook/meta-2-enforcement.md` for the full
 *     policy + escape-hatch + new-pattern workflow.
 *
 * Why a Node script rather than ESLint no-restricted-syntax:
 * comment-text matching is a regex-shaped concern, not an
 * AST-shaped one. Mirrors `scripts/check-compliance-language.mjs`
 * + `scripts/check-security-txt-expires.mjs`. ESLint integration
 * is a future option if real-time editor feedback becomes a
 * blocker; deferred until a 3+-engineer team scale justifies it.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import process from 'node:process';

const repoRoot = process.cwd();

const policy = JSON.parse(readFileSync(join(repoRoot, 'scripts/meta-policy.json'), 'utf8'));

const SKIP_DIRS = new Set(policy.scopes.exclude_dirs);
const SCAN_EXTS = new Set(policy.scopes.scan_extensions);
const EXCLUDE_FILENAME = new RegExp(policy.scopes.exclude_filename_regex);
const ESCAPE_MARKER = policy.escape_hatch.comment_marker;

const PATTERNS = policy.patterns.map((p) => ({
  rule: p.rule,
  regex: new RegExp(p.regex, p.flags),
  message: p.message,
}));

// Resolve glob-style scope-directory entries. A literal `*`
// segment expands to every immediate child directory at that
// position. Used for the `packages/<any>/src` scope (the wildcard
// segment is `"*"` in scopes.directories) so the script enters
// each package's `src/` subtree but not the package root —
// vitest.config.ts, README.md, etc. at the package root are
// excluded from the META-2 scan by design.
function expandScopeDirectory(segments) {
  const result = [];
  function recurse(prefix, remaining) {
    if (remaining.length === 0) {
      result.push(prefix);
      return;
    }
    const [head, ...tail] = remaining;
    if (head === '*') {
      let entries;
      try {
        entries = readdirSync(join(repoRoot, ...prefix), { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.startsWith('.') && !SKIP_DIRS.has(entry.name)) {
          recurse([...prefix, entry.name], tail);
        }
      }
    } else {
      recurse([...prefix, head], tail);
    }
  }
  recurse([], segments);
  return result;
}

const SCAN_ROOTS = policy.scopes.directories.flatMap(expandScopeDirectory);
const SCAN_FILES = policy.scopes.files;

// Self-exclusion: the script itself + future scripts/-rooted
// support modules. The current `scripts/` directory is not in
// `SCAN_ROOTS`, so this guard is belt-and-suspenders today; it
// activates if a future expansion adds `scripts/` to the scan
// scope. Note: `meta-policy.json` does not need an entry here
// because `.json` is not in `SCAN_EXTS`; only files matching the
// scan extensions reach the skip check.
const SKIP_FILES = [['scripts', 'check-no-workflow-context.mjs']];

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
    } else if (entry.isFile()) {
      const dotIndex = entry.name.lastIndexOf('.');
      if (dotIndex < 0) continue;
      const ext = entry.name.slice(dotIndex);
      if (!SCAN_EXTS.has(ext)) continue;
      // Exclude test files by filename suffix.
      if (EXCLUDE_FILENAME.test(entry.name)) continue;
      const fullPath = join(dir, entry.name);
      const rel = relative(repoRoot, fullPath);
      const parts = rel.split(sep);
      const skipped = SKIP_FILES.some((frag) => frag.every((segment, i) => parts[i] === segment));
      if (skipped) continue;
      scan(fullPath, rel);
    }
  }
}

function scanFile(relParts) {
  const fullPath = join(repoRoot, ...relParts);
  try {
    statSync(fullPath);
  } catch {
    return;
  }
  scan(fullPath, relParts.join(sep));
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
    // Escape-hatch check — if the line carries an explicit override,
    // skip the entire line. The rationale text is in the same line
    // (e.g., `// foo M3 ... // META-2-allow: Stripe Apple Pay SKU`).
    if (line.includes(ESCAPE_MARKER)) continue;
    for (const pattern of PATTERNS) {
      if (pattern.regex.test(line)) {
        violations.push({
          file: rel,
          line: i + 1,
          rule: pattern.rule,
          message: pattern.message,
          excerpt: line.trim(),
        });
      }
    }
  }
}

for (const root of SCAN_ROOTS) {
  walk(join(repoRoot, ...root));
}
for (const file of SCAN_FILES) {
  scanFile(file);
}

if (violations.length === 0) {
  console.log(
    `check-no-workflow-context: 0 violations across ${SCAN_ROOTS.length} dirs + ${SCAN_FILES.length} files (policy v${policy.policy_version})`,
  );
  process.exit(0);
}

console.error(
  `check-no-workflow-context: ${violations.length} META-2 violation(s) found (policy v${policy.policy_version}):\n`,
);
for (const v of violations) {
  console.error(`  ${v.file}:${v.line} [${v.rule}] ${v.message}`);
  console.error(`    ${v.excerpt.slice(0, 160)}`);
}
console.error(
  `\nTo override a legitimate match (rare), add \`// ${ESCAPE_MARKER} <rationale>\` to the same line.`,
);
console.error(`See docs/runbook/meta-2-enforcement.md for the full policy.`);
process.exit(1);
