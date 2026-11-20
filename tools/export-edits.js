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
const { FILES } = gf.buildFiles(GAME, { direct: args.direct, target: args.target });
const edited = gf.isEdited(FILES[0]);
const source = edited ? FILES[0].out : gf.pristine(FILES[0]);

const db = g.parseDb(g.readEntryFromFile(source, g.RDF_NAME));
const json = JSON.stringify({
  players: db.players.map(({ off, ...p }) => p),
  teams: db.teams.map(({ off, ...t }) => t),
}, null, 1);

console.error(`Game:   ${GAME}`);
console.error(`Source: ${source} (${edited ? 'your edits' : 'the original, unedited database'})`);
if (args.out) { fs.writeFileSync(args.out, json); console.error(`Wrote ${args.out}`); }
else console.log(json);
