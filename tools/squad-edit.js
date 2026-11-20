// Command-line squad tool. The squad editor (editor/server.js) does the same and more in a browser.
//
//   node tools/squad-edit.js show <data.gob> <team number>
//   node tools/squad-edit.js set  <data.gob> <out.gob> <team number> <slot>=<player id> [<slot>=<player id> ...]
//
// Team numbers follow the game's own order (1 Argentina ... 17 Scotland, 18 South Africa, 19 Spain ...).
// Slots are 1-30 in squad order. The input archive is only read; the result is written to <out.gob>.
'use strict';
const fs = require('fs');
const g = require('./gob.js');

const pad5 = id => String(id).padStart(5, '0');

function printTeam(db, no) {
  const t = db.teams[no - 1];
  if (!t) throw new Error(`No team number ${no}`);
  const names = new Map(db.players.map(p => [p.id, p.name]));
  console.log(`Team ${no}`);
  t.slots.forEach((id, i) => console.log(`  ${String(i + 1).padStart(2)}  ${id ? pad5(id) : '-----'}  ${id ? names.get(id) || '(no player record)' : '(empty)'}`));
  console.log(`  Roles: ${t.roles.map(id => (id ? names.get(id) || pad5(id) : '-')).join(', ')}`);
}

function main() {
  const [cmd, ...args] = process.argv.slice(2);
  if (cmd === 'show') {
    const [gobPath, no] = args;
    printTeam(g.parseDb(g.readEntryFromFile(gobPath, g.RDF_NAME)), +no);
    return;
  }
  if (cmd === 'set') {
    const [gobPath, outPath, no, ...edits] = args;
    if (!edits.length) throw new Error('Give at least one <slot>=<player id>');
    if (fs.existsSync(outPath) && fs.realpathSync(outPath) === fs.realpathSync(gobPath)) throw new Error('Write to a new file, not over the original');
    const rdf = g.readEntryFromFile(gobPath, g.RDF_NAME);
    const db = g.parseDb(rdf);
    const t = db.teams[+no - 1];
    if (!t) throw new Error(`No team number ${no}`);
    const names = new Map(db.players.map(p => [p.id, p.name]));
    for (const e of edits) {
      const m = /^(\d+)=(\d+)$/.exec(e);
      if (!m) throw new Error(`Bad edit "${e}", expected <slot>=<player id>`);
      const slot = +m[1], id = +m[2], old = t.slots[slot - 1];
      if (slot < 1 || slot > g.SLOTS) throw new Error(`Slot ${slot} is outside 1-${g.SLOTS}`);
      t.slots[slot - 1] = id;
      console.log(`Slot ${slot}: ${old ? names.get(old) : '(empty)'} -> ${names.get(id) || pad5(id)}`);
    }
    const out = g.applyDb(rdf, { teams: [t] });
    g.writePatchedGob(gobPath, outPath, g.RDF_NAME, out);
    console.log(`Wrote ${outPath}`);
    printTeam(g.parseDb(g.readEntryFromFile(outPath, g.RDF_NAME)), +no);
    return;
  }
  console.log('Usage:\n  node tools/squad-edit.js show <data.gob> <team number>\n  node tools/squad-edit.js set <data.gob> <out.gob> <team number> <slot>=<player id> [...]');
  process.exitCode = 1;
}

try { main(); } catch (err) { console.error('Error: ' + err.message); process.exitCode = 1; }
