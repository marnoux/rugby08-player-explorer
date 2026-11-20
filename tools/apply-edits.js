#!/usr/bin/env node
// Pulls players and teams from PocketBase and writes them into a Rugby 08 install's data.gob and
// Data/motion/data.gob, the same way editor/server.js's "Save to game" does. This is the other half of
// tools/export-edits.js and editor/pocketbase.js: PocketBase holds the one source of truth, and this
// script is how you apply it to any machine that has its own copy of the game installed.
//
//   node tools/apply-edits.js [--game <install folder>] [--direct] [--target <folder>]
//                             [--url <pocketbase-url>] [--token <token>] [--config <path>]
//
// Without --url/--token, reads editor/pocketbase.local.json — the same file editor/server.js's sync
// uses (see editor/pocketbase.js for how to set that up and get a token).
// Without --game, looks in the Windows registry, or on Linux/macOS in the usual Wine prefixes
// (~/.wine, $WINEPREFIX, ~/Games/*) — same detection as editor/server.js and tools/export-edits.js.
// --direct and --target match editor/server.js too.
'use strict';
const fs = require('fs');
const path = require('path');
const g = require('./gob.js');
const gf = require('./game-files.js');

const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const key = process.argv[i].replace(/^--/, ''), next = process.argv[i + 1];
  if (next === undefined || next.startsWith('--')) args[key] = true; else { args[key] = next; i++; }
}

const GAME = gf.findGame(args.game);
if (!GAME || !gf.hasGob(GAME)) {
  console.error(`Can't find Rugby 08${GAME ? ` in ${GAME}` : ''}. Run with --game "<install folder>", the folder that contains Data/data.gob.`);
  process.exit(1);
}
if (gf.gameRunning()) { console.error('Rugby 08 is running. Close the game, then run this again.'); process.exit(1); }

const { FILES } = gf.buildFiles(GAME, { direct: args.direct, target: args.target });
const { pristine } = gf;

/* ---------- PocketBase ---------- */
function pbConfig() {
  if (args.url && args.token) return { url: args.url.replace(/\/$/, ''), token: args.token };
  const file = args.config ? path.resolve(args.config) : path.join(__dirname, '..', 'editor', 'pocketbase.local.json');
  if (!fs.existsSync(file)) {
    console.error(`No PocketBase config. Pass --url and --token, or create ${file} with {"url": "...", "token": "..."} (see editor/pocketbase.js).`);
    process.exit(1);
  }
  const { url, token } = JSON.parse(fs.readFileSync(file, 'utf8'));
  return { url: url.replace(/\/$/, ''), token };
}

async function fetchAll(cfg, collection) {
  const items = [];
  for (let page = 1; ; page++) {
    const res = await fetch(`${cfg.url}/api/collections/${collection}/records?perPage=500&page=${page}`, {
      headers: { Authorization: `Bearer ${cfg.token}` },
    });
    if (!res.ok) throw new Error(`PocketBase ${collection} fetch failed: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
    const data = await res.json();
    items.push(...data.items);
    if (page >= data.totalPages) break;
  }
  return items;
}

(async () => {
  const cfg = pbConfig();
  const [playerRecs, teamRecs] = await Promise.all([fetchAll(cfg, 'rugby08_players'), fetchAll(cfg, 'rugby08_teams')]);
  const players = playerRecs.map(p => ({ id: +p.player_id, name: p.name, pos: p.pos, lb: p.lb, nat: p.nat, inch: p.inch, r: p.r, sk: p.sk, ir: p.ir, head: p.head }));
  const teams = teamRecs.map(t => ({ tid: t.tid, slots: t.slots, roles: t.roles, values: t.values }));

  console.log(`Game:       ${GAME}`);
  console.log(`PocketBase: ${cfg.url} (${players.length} players, ${teams.length} teams)`);

  const origRdf = g.readEntryFromFile(pristine(FILES[0]), g.RDF_NAME);
  const rdf = g.applyDb(origRdf, { players, teams });
  for (const f of FILES) {
    const src = pristine(f);
    if (!g.hasEntry(src, g.RDF_NAME)) continue;
    if (f.backup && !fs.existsSync(f.orig)) g.copyInto(f.out, f.orig);
    fs.mkdirSync(path.dirname(f.out), { recursive: true });
    g.writePatchedGob(f.orig, f.out, g.RDF_NAME, rdf);
    console.log(`Wrote ${f.out}`);
  }
})().catch(e => { console.error(e.message); process.exit(1); });
