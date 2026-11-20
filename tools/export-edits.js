#!/usr/bin/env node
// Exports the current players and teams from a Rugby 08 install as JSON: the edited database if a save
// has been made, otherwise the original. Same record shape the editor itself uses, minus internal byte
// offsets. Much smaller than data.gob itself (which also bundles textures, models and audio), so it's
// easy to copy around or upload.
//
//   node tools/export-edits.js [--game <install folder>] [--direct] [--out edits.json]
//
// Without --game, looks in the Windows registry, or on Linux/macOS in the usual Wine prefixes
// (~/.wine, $WINEPREFIX, ~/Games/*) — same detection as editor/server.js. --direct and --target match
// editor/server.js too, for a game saved in direct mode or to a --target folder.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const g = require('./gob.js');

const IS_WIN = process.platform === 'win32';
const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const key = process.argv[i].replace(/^--/, ''), next = process.argv[i + 1];
  if (next === undefined || next.startsWith('--')) args[key] = true; else { args[key] = next; i++; }
}

const hasGob = dir => fs.existsSync(path.join(dir, 'Data', 'data.gob'));

function findGame() {
  if (args.game) return path.resolve(args.game);
  if (IS_WIN) {
    try {
      const out = execFileSync('reg', ['query', 'HKLM\\SOFTWARE\\WOW6432Node\\EA SPORTS\\EA Sports Rugby 08', '/v', 'Install Dir'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      const m = /Install Dir\s+REG_SZ\s+(.+)/.exec(out);
      if (m && hasGob(m[1].trim())) return path.resolve(m[1].trim());
    } catch {}
    const def = 'C:\\Program Files (x86)\\EA SPORTS\\EA SPORTS(TM) Rugby 08';
    return hasGob(def) ? def : null;
  }
  const home = os.homedir(), prefixes = [process.env.WINEPREFIX, path.join(home, '.wine')];
  try { for (const d of fs.readdirSync(path.join(home, 'Games'))) prefixes.push(path.join(home, 'Games', d)); } catch {}
  for (const pre of prefixes.filter(Boolean)) {
    for (const pf of ['Program Files (x86)', 'Program Files']) {
      const ea = path.join(pre, 'drive_c', pf, 'EA SPORTS');
      let dirs = [];
      try { dirs = fs.readdirSync(ea); } catch { continue; }
      for (const d of dirs) if (/rugby 08/i.test(d) && hasGob(path.join(ea, d))) return path.join(ea, d);
    }
  }
  return null;
}

function underProgramFiles(dir) {
  const pf = [process.env['ProgramFiles(x86)'], process.env.ProgramFiles].filter(Boolean).map(p => p.toLowerCase() + path.sep);
  return pf.some(p => dir.toLowerCase().startsWith(p));
}

const GAME = findGame();
if (!GAME || !hasGob(GAME)) {
  console.error(`Can't find Rugby 08${GAME ? ` in ${GAME}` : ''}. Run with --game "<install folder>", the folder that contains Data/data.gob.`);
  process.exit(1);
}
const MODE = args.target ? 'target' : IS_WIN && !args.direct && underProgramFiles(GAME) ? 'virtualstore' : 'direct';

const live = path.join(GAME, 'Data', 'data.gob');
const base = MODE === 'target' ? path.resolve(args.target) : path.join(process.env.LOCALAPPDATA || '', 'VirtualStore', GAME.slice(path.parse(GAME).root.length));
const out = MODE === 'direct' ? live : path.join(base, 'Data', 'data.gob');
const backupOrig = live + '.original';
const edited = MODE === 'direct' ? (fs.existsSync(backupOrig) ? live : null) : (fs.existsSync(out) ? out : null);

const source = edited || live;
const db = g.parseDb(g.readEntryFromFile(source, g.RDF_NAME));
const json = JSON.stringify({
  players: db.players.map(({ off, ...p }) => p),
  teams: db.teams.map(({ off, ...t }) => t),
}, null, 1);

console.error(`Game:   ${GAME}`);
console.error(`Source: ${source} (${edited ? 'your edits' : 'the original, unedited database'})`);
if (args.out) { fs.writeFileSync(args.out, json); console.error(`Wrote ${args.out}`); }
else console.log(json);
