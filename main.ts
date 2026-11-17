// Ignition: a token launch radar for token-radar-01 (Node 22, standard library only).
//
// The program reads the sealed snapshot from /input/snapshot.json (or --input <file|dir>), scores the
// whole pre-token field with the model in lib/model.ts, writes the ranked board to /output/board.json,
// writes /output/data.js for the dashboard, copies this repository's dashboard/ and screenshots/ to
// /output, and writes /output/dossier.json, the summary the judge reads, with the vendored library.
//
// The dashboard is static: dashboard/index.html, dashboard/app.css and dashboard/app.js read
// ../data.js and nothing else. The page re-runs the model's arithmetic on every row it shows and
// checks the result against the number board.json carries, so the page and the data visibly agree.
// It makes no network request: the dashboard's files are scanned here for one, and the program
// refuses to write a dossier over a dashboard that names a URL.
//
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot, SnapshotError } from './lib/model.ts';
import { buildDossier, DossierError } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));

/** The scorer's own caps (reference/gate.json): text_max_bytes shapes the bytes, the rest refuse. */
const TEXT_MAX_BYTES = 65_536;
const SCREENSHOT_CAPS = { max: 4, max_bytes: 524_288 };
const DASHBOARD_CAPS = { max_files: 400, max_bytes: 4_194_304 };
const IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

/** --name <value> out of the arguments, or the fallback. */
function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const withEquals = process.argv.find((a) => a.startsWith(`--${name}=`));
  return withEquals === undefined ? fallback : withEquals.slice(name.length + 3);
}

function fail(message: string): never {
  process.stderr.write(`token radar: ${message}\n`);
  process.exit(1);
}

const inputArg = arg('input', '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(inputFile)) {
  process.stderr.write(`token radar: no snapshot at ${inputFile}: pass --input <snapshot.json|directory> or mount the sealed /input\n`);
  process.exit(2);
}
const out = arg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

let snapshot;
try {
  snapshot = parseSnapshot(readFileSync(inputFile, 'utf8'));
} catch (error) {
  if (error instanceof SnapshotError) fail(error.message);
  throw error;
}
const { board, radar } = buildRadar(snapshot);
const issue = boardIssue(board, snapshot);
if (issue !== null) fail(`the model wrote a board the gate refuses: ${issue}`);

mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
writeFileSync(join(out, 'data.js'), dataScript(radar));

/** Copy one directory's regular files into `to`, skipping names that start with a dot. */
function copyFiles(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(from)) {
    if (name.startsWith('.')) continue;
    const path = join(from, name);
    if (!statSync(path).isFile()) continue;
    copyFileSync(path, join(to, name));
    copied.push(name);
  }
  return copied;
}

/** A dashboard file that names an http(s) URL anywhere: the gate's network paragraph is stricter, but none may appear at all. */
function urlInDashboard(): string | null {
  const root = join(here, 'dashboard');
  if (!existsSync(root)) return 'dashboard/ is missing';
  for (const name of readdirSync(root)) {
    if (name.startsWith('.')) continue;
    const path = join(root, name);
    if (!statSync(path).isFile()) continue;
    const text = readFileSync(path, 'utf8');
    if (/https?:\/\//i.test(text)) return `dashboard/${name} names a URL`;
    if (/\b(import|require)\s*\(\s*['"`][^'"`]*:\/\//i.test(text)) return `dashboard/${name} imports a URL`;
  }
  return null;
}

const urlIssue = urlInDashboard();
if (urlIssue !== null) fail(`the dashboard would fail the gate: ${urlIssue}`);

const dash = copyFiles(join(here, 'dashboard'), join(out, 'dashboard'));
const shots = copyFiles(join(here, 'screenshots'), join(out, 'screenshots'));
if (shots.length < 3 || shots.length > 4) {
  fail(`screenshots/ holds ${shots.length} image${shots.length === 1 ? '' : 's'}: hand in 3 or 4: the board, a protocol's detail view and a filtered view`);
}
for (const name of shots) {
  if (!IMAGE_NAME.test(name)) fail(`screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters`);
}

// The dossier is written last: the scorer rebuilds it from this /output and compares bytes.
try {
  writeFileSync(join(out, 'dossier.json'), buildDossier(out, { text_max_bytes: TEXT_MAX_BYTES, screenshots: SCREENSHOT_CAPS, dashboard: DASHBOARD_CAPS }));
} catch (error) {
  if (error instanceof DossierError) fail(`the dossier was refused: ${error.message}`);
  throw error;
}

const top = board.slice(0, 3).map((row) => `#${row.rank} ${row.name} $${row.implied_value_usd.toLocaleString('en-US')}`).join(', ');
process.stdout.write(
  `token radar: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, ${board.length} rows scored (${radar.stats.early} found below the floor, ${radar.stats.live_protocols} live-token protocols set aside, ${radar.stats.live} shown)\n` +
    `token radar: top of the board: ${top}\n` +
    `token radar: wrote ${join(out, 'board.json')}, ${join(out, 'data.js')}, ${join(out, 'dashboard')} (${dash.length} files), ${join(out, 'screenshots')} (${shots.length} images) and ${join(out, 'dossier.json')}\n`,
);
