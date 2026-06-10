#!/usr/bin/env node
// Publishes docs/prd/ into a GitHub wiki working copy.
//
//   node scripts/sync-wiki.mjs <wiki-clone-dir>
//
// Transform: README.md → Home.md (+ published-copy banner), YAML frontmatter
// stripped (the wiki renders it as text, not metadata), relative .md links
// rewritten to wiki page names, _Sidebar/_Footer generated, stale NN-* pages
// pruned. Run by .github/workflows/wiki-sync.yml on pushes to main; for a
// manual sync: clone https://github.com/surajsau/Open-Metro.wiki.git, run
// this against the clone, then commit and push it.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('../docs/prd', import.meta.url));
const REPO = 'https://github.com/surajsau/Open-Metro';

// Sidebar labels; files missing here fall back to a filename-derived title.
const TITLES = {
  '00-product-overview': 'Product Overview',
  '01-game-design': 'Game Design',
  '02-game-engine': 'Game Engine',
  '03-world-generation': 'World Generation & Difficulty',
  '04-network-editing': 'Network Editing',
  '05-transit-simulation': 'Transit Simulation',
  '06-rendering': 'Rendering',
  '07-interaction': 'Interaction',
  '08-ui-shell': 'UI Shell & App State',
  '09-engineering-standards': 'Engineering Standards',
};

const out = process.argv[2];
if (!out || !fs.existsSync(out)) {
  console.error('usage: node scripts/sync-wiki.mjs <wiki-clone-dir>');
  process.exit(1);
}

const stripFrontmatter = (t) => t.replace(/^---\n[\s\S]*?\n---\n+/, '');
const rewriteLinks = (t) =>
  t
    .replace(/\]\(README\.md(#[^)]*)?\)/g, (_, frag) => `](Home${frag ?? ''})`)
    .replace(/\]\((\d{2}-[a-z0-9-]+)\.md(#[^)]*)?\)/g, (_, page, frag) => `](${page}${frag ?? ''})`);
const titleOf = (page) =>
  TITLES[page] ??
  page
    .replace(/^\d{2}-/, '')
    .split('-')
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');

const sources = fs.readdirSync(SRC).filter((f) => f.endsWith('.md'));
const written = [];
for (const f of sources) {
  const page = f === 'README.md' ? 'Home' : f.replace(/\.md$/, '');
  let t = rewriteLinks(stripFrontmatter(fs.readFileSync(path.join(SRC, f), 'utf8')));
  if (page === 'Home') {
    t =
      `> **Published copy** — these pages are generated from [\`docs/prd/\`](${REPO}/tree/main/docs/prd) in the main repo, which is the source of truth. Propose changes there, not by editing the wiki.\n\n` +
      t;
  }
  fs.writeFileSync(path.join(out, `${page}.md`), t);
  written.push(page);
}

const ordered = written.filter((p) => p !== 'Home').sort();
fs.writeFileSync(
  path.join(out, '_Sidebar.md'),
  ['**Open Metro PRDs**', '', '- [Home](Home)', ...ordered.map((p) => `- [${titleOf(p)}](${p})`)].join('\n') + '\n',
);
fs.writeFileSync(
  path.join(out, '_Footer.md'),
  `Published from [\`docs/prd/\`](${REPO}/tree/main/docs/prd) — the spec of record. Edit there, not in the wiki.\n`,
);

// Prune wiki pages whose docs/prd source was deleted or renamed. Only NN-*.md
// names are managed; hand-made wiki pages are left alone.
for (const f of fs.readdirSync(out)) {
  if (/^\d{2}-.*\.md$/.test(f) && !written.includes(f.replace(/\.md$/, ''))) {
    fs.rmSync(path.join(out, f));
    console.log(`pruned stale page ${f}`);
  }
}

// Self-check: no relative .md links or surviving frontmatter in the output.
const bad = [];
for (const p of [...written, '_Sidebar', '_Footer']) {
  const t = fs.readFileSync(path.join(out, `${p}.md`), 'utf8');
  if (/\]\((?!https?:)[^)]*\.md(#[^)]*)?\)/.test(t)) bad.push(`${p}: unrewritten relative .md link`);
  if (/^---\n(id|title):/m.test(t)) bad.push(`${p}: frontmatter survived`);
}
if (bad.length > 0) {
  console.error(bad.join('\n'));
  process.exit(1);
}
console.log(`synced ${written.length} pages + sidebar/footer → ${out}`);
