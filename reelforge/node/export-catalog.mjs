// Exports the scene catalog of the studio to studio/scenes.catalog.json.
// Usage: node reelforge/node/export-catalog.mjs <repository root> [<output.json>]
//
// 1) Main route: compile studio/src/scenes/index.ts with esbuild (already in the node_modules of Remotion), import it and read
//    the registry (export `scenes`, `registry`, `SCENES`, or the default export; array or object of scene definitions).
//    We keep type, description, exampleProps, cues.
// 2) Fallback: read the README.md files of studio/src/scenes (and of its sub-folders): lines such as
//    "- `type` - description" or table rows "| `type` | description |".
// No npm dependency is added. ESM code.

import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv[2] ?? process.cwd());
const output = path.resolve(process.argv[3] ?? path.join(root, 'studio', 'scenes.catalog.json'));
const studio = path.join(root, 'studio');
const scenesDir = path.join(studio, 'src', 'scenes');

function findEsbuild() {
  const req = createRequire(path.join(studio, 'package.json'));
  const candidates = ['esbuild', path.join(studio, 'node_modules', '@remotion', 'bundler', 'node_modules', 'esbuild'),
    path.join(studio, 'node_modules', '@remotion', 'cli', 'node_modules', 'esbuild')];
  for (const c of candidates) {
    try { return req(c); } catch { /* next */ }
  }
  // esbuild may be nested: look for node_modules/**/esbuild/lib/main.js (a few levels deep)
  const base = path.join(studio, 'node_modules');
  const stack = [base];
  while (stack.length) {
    const d = stack.pop();
    let names = [];
    try { names = fs.readdirSync(d); } catch { continue; }
    for (const n of names) {
      const p = path.join(d, n);
      if (n === 'esbuild' && fs.existsSync(path.join(p, 'lib', 'main.js'))) return req(p);
      if (n === 'node_modules' || n.startsWith('@')) stack.push(p);
      else if (d !== base && fs.existsSync(path.join(p, 'node_modules')) && d.split(path.sep).length < base.split(path.sep).length + 4) stack.push(path.join(p, 'node_modules'));
    }
  }
  return null;
}

function normalize(def) {
  return {
    type: String(def.type),
    description: String(def.description ?? ''),
    exampleProps: def.exampleProps ?? {},
    cues: Array.isArray(def.cues) ? def.cues : [],
  };
}

async function fromRegistry() {
  const entry = ['index.ts', 'index.tsx', 'registry.ts'].map((n) => path.join(scenesDir, n)).find((p) => fs.existsSync(p));
  if (!entry) throw new Error('studio/src/scenes/index.ts not found');
  const esbuild = findEsbuild();
  if (!esbuild) throw new Error('esbuild not found in studio/node_modules');
  const cache = path.join(studio, 'node_modules', '.cache', 'reelforge');
  fs.mkdirSync(cache, { recursive: true });
  const file = path.join(cache, 'scenes-registry.mjs');
  await esbuild.build({
    entryPoints: [entry], outfile: file, bundle: true, format: 'esm', platform: 'node', packages: 'external',
    jsx: 'automatic', loader: { '.png': 'dataurl', '.svg': 'dataurl', '.jpg': 'dataurl', '.ttf': 'dataurl', '.css': 'empty' },
    logLevel: 'silent',
  });
  const mod = await import(pathToFileURL(file).href + '?t=' + Date.now());
  let reg = mod.scenes ?? mod.SCENES ?? mod.registry ?? mod.REGISTRY ?? mod.default;
  if (reg && !Array.isArray(reg) && typeof reg === 'object' && !reg.type) reg = Object.values(reg);
  if (!Array.isArray(reg) || reg.length === 0) throw new Error('scene registry empty or of unknown shape');
  return reg.filter((d) => d && d.type).map(normalize);
}

function readReadme(file) {
  const found = [];
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    let m = line.match(/^\s*[-*]\s+`([a-z0-9]+(?:-[a-z0-9]+)*)`\s*[—–:-]+\s*(.+)$/);
    if (!m) m = line.match(/^\s*\|\s*`([a-z0-9]+(?:-[a-z0-9]+)*)`\s*\|\s*([^|]+?)\s*\|/);
    if (m) found.push({ type: m[1], description: m[2].trim(), exampleProps: {}, cues: [] });
  }
  return found;
}

function fromReadmes() {
  const seen = new Map();
  const dirs = [scenesDir];
  for (const n of fs.existsSync(scenesDir) ? fs.readdirSync(scenesDir) : []) {
    const p = path.join(scenesDir, n);
    if (fs.statSync(p).isDirectory()) dirs.push(p);
  }
  for (const d of dirs) {
    const f = path.join(d, 'README.md');
    if (fs.existsSync(f)) for (const s of readReadme(f)) if (!seen.has(s.type)) seen.set(s.type, s);
  }
  if (seen.size === 0) throw new Error('no usable scene README.md');
  return [...seen.values()];
}

let scenes;
let source = 'registry';
try {
  scenes = await fromRegistry();
} catch (e) {
  console.error(`[catalog] registry unreadable (${e.message}); falling back to the READMEs`);
  source = 'readme';
  scenes = fromReadmes();
}
scenes.sort((a, b) => a.type.localeCompare(b.type));
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify({ version: 1, source, scenes }, null, 2) + '\n', 'utf8');
console.log(`[catalog] ${scenes.length} scenes (${source}) -> ${output}`);
