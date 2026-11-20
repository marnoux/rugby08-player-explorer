// Rugby 08 squad and player editor: a small local server plus the page in editor/index.html.
//
//   node editor/server.js [--open] [--game <install folder>] [--direct] [--target <folder>] [--port 4319]
//
// --game is the folder that contains Data\data.gob. Without it the editor looks in the Windows registry, or on
// Linux and macOS in the usual Wine prefixes (~/.wine, $WINEPREFIX, ~/Games/*).
//
// Where "Save to game" writes, for both Data/data.gob and Data/motion/data.gob:
//   virtualstore  Windows, game under Program Files (the default there). Edited copies go to Windows' VirtualStore
//                 folder for the install; the game reads them when started normally (not as administrator).
//                 The files in Program Files are never changed. Restore deletes the copies.
//   direct        Linux/macOS (Wine), a Windows install outside Program Files, or --direct. The first save keeps
//                 the original next to it as data.gob.original; every save is built from that backup and written
//                 over data.gob. Restore puts the backup back.
//   target        --target <folder>: writes the edited copies under that folder (for testing). Restore deletes them.
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const g = require('../tools/gob.js');
const gf = require('../tools/game-files.js');
const pocketbase = require('./pocketbase.js');
const { IS_WIN, hasGob, underProgramFiles, gameRunning, pristine } = gf;

const PB = pocketbase.loadConfig();
let pbWarning = null;

const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const key = process.argv[i].replace(/^--/, ''), next = process.argv[i + 1];
  if (next === undefined || next.startsWith('--')) args[key] = true; else { args[key] = next; i++; }
}
const PORT = +args.port || 4319;

const GAME = gf.findGame(args.game);
if (!GAME || !hasGob(GAME)) {
  console.error(`Can't find Rugby 08${GAME ? ` in ${GAME}` : ''}. Start the editor with --game "<install folder>", the folder that contains Data/data.gob.`);
  process.exit(1);
}
const { MODE, FILES } = gf.buildFiles(GAME, { direct: args.direct, target: args.target });
const isEdited = () => gf.isEdited(FILES[0]);

const ORIG_GOB = pristine(FILES[0]);
const ORIG_RDF = g.readEntryFromFile(ORIG_GOB, g.RDF_NAME);
const ORIG_DB = g.parseDb(ORIG_RDF);

// Team names: the game's kit list first, then the explorer's team list matched by squad, then "Team N".
const TEAM_NAMES = (() => {
  const names = g.teamNamesFromKitXml(g.readEntryFromFile(ORIG_GOB, g.KIT_XML_NAME).toString('utf8'));
  // The kit list writes some names without spaces ("SouthAfrica", "AustraliaA").
  for (const k of Object.keys(names)) names[k] = names[k].replace(/([a-z])([A-Z])/g, '$1 $2');
  try {
    const root = path.join(__dirname, '..');
    const teams = JSON.parse(fs.readFileSync(path.join(root, 'teams.json'), 'utf8'));
    const players = JSON.parse(fs.readFileSync(path.join(root, 'players.json'), 'utf8'));
    const members = {};
    for (const p of players) for (const [slug] of p.t) (members[slug] = members[slug] || new Set()).add(+p.id);
    for (const t of ORIG_DB.teams) {
      if (names[t.tid]) continue;
      const ids = t.slots.filter(Boolean);
      if (!ids.length) continue;
      let best = null, score = 0;
      for (const tm of teams) {
        const s = members[tm.slug]; if (!s) continue;
        const hit = ids.filter(id => s.has(id)).length / ids.length;
        if (hit > score) { score = hit; best = tm.name.replace(/ \(list \d+\)$/, ''); }
      }
      if (score >= 0.8) names[t.tid] = best;
    }
  } catch {}
  return names;
})();

const pub = db => ({
  players: db.players.map(({ off, ...p }) => p),
  teams: db.teams.map(({ off, ...t }) => t),
});

function state() {
  let source = 'original', savedAt = null, db = ORIG_DB, warning = null;
  if (isEdited()) {
    try {
      db = g.parseDb(g.readEntryFromFile(FILES[0].out, g.RDF_NAME));
      source = 'edited';
      savedAt = fs.statSync(FILES[0].out).mtime.toISOString();
    } catch (e) {
      warning = `An edited data.gob exists but couldn't be read (${e.message}). Saving will replace it.`;
      db = ORIG_DB;
    }
  }
  return {
    game: GAME, mode: MODE, files: FILES.map(f => f.out), source, savedAt, warning: warning || pbWarning,
    teamNames: TEAM_NAMES, nationalities: g.NATIONALITIES, positions: g.POSITIONS, ratings: g.RATINGS, skills: g.SKILLS,
    current: pub(db), original: pub(ORIG_DB),
  };
}

// Turns permission errors into advice that fits the save mode.
function explain(e, file) {
  if (e && (e.code === 'EPERM' || e.code === 'EACCES' || e.code === 'EBUSY')) {
    const why = e.code === 'EBUSY' ? 'the file is in use (is the game running?)' : 'permission was denied';
    const tip = MODE === 'direct' && IS_WIN && underProgramFiles(GAME) ? ' Leave out --direct so saves go to the VirtualStore folder instead.' : '';
    return new Error(`Couldn't write ${file}: ${why}.${tip}`);
  }
  return e;
}

function save(body) {
  if (gameRunning()) throw new Error('Rugby 08 is running. Close the game, then save again.');
  const rdf = g.applyDb(ORIG_RDF, body);
  for (const f of FILES) {
    const src = pristine(f);
    if (!g.hasEntry(src, g.RDF_NAME)) continue; // an archive without the database is left alone
    try {
      if (f.backup && !fs.existsSync(f.orig)) g.copyInto(f.out, f.orig); // first save: keep the original
      fs.mkdirSync(path.dirname(f.out), { recursive: true });
      g.writePatchedGob(f.orig, f.out, g.RDF_NAME, rdf);
    } catch (e) { throw explain(e, f.out); }
  }
}

function restore() {
  if (gameRunning()) throw new Error('Rugby 08 is running. Close the game first.');
  for (const f of FILES) {
    try {
      if (f.backup) { if (fs.existsSync(f.orig)) { g.copyInto(f.orig, f.out); fs.unlinkSync(f.orig); } }
      else if (fs.existsSync(f.out)) fs.unlinkSync(f.out);
    } catch (e) { throw explain(e, f.out); }
  }
}

function openBrowser(url) {
  const [cmd, cmdArgs] = IS_WIN ? ['cmd', ['/c', 'start', '', url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  try {
    const child = spawn(cmd, cmdArgs, { stdio: 'ignore', detached: true });
    child.on('error', () => console.log(`Open ${url} in your browser.`));
    child.unref();
  } catch { console.log(`Open ${url} in your browser.`); }
}

function send(res, code, body, type = 'application/json; charset=utf-8') {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(type.startsWith('application/json') ? JSON.stringify(body) : body);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > 20e6) { reject(new Error('Request too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch { reject(new Error('Bad JSON')); } });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      return send(res, 200, fs.readFileSync(path.join(__dirname, 'index.html')), 'text/html; charset=utf-8');
    }
    if (req.method === 'GET' && url.pathname === '/api/state') return send(res, 200, state());
    if (req.method === 'POST' && (url.pathname === '/api/save' || url.pathname === '/api/restore')) {
      // Only accept requests from this page: JSON body and, when the browser sends one, our own origin.
      const origin = req.headers.origin;
      if (!/^application\/json/.test(req.headers['content-type'] || '') || (origin && origin !== `http://localhost:${PORT}` && origin !== `http://127.0.0.1:${PORT}`)) {
        return send(res, 403, { error: 'Requests must come from the editor page.' });
      }
      const body = await readJson(req);
      if (url.pathname === '/api/save') {
        save(body);
        pbWarning = null;
        if (PB) {
          try { await pocketbase.sync(PB, body); console.log('Synced to PocketBase.'); }
          catch (e) { pbWarning = `Saved to the game, but syncing to PocketBase failed: ${e.message}`; console.error(pbWarning); }
        }
      } else restore();
      return send(res, 200, state());
    }
    send(res, 404, { error: 'Not found' });
  } catch (e) {
    send(res, 400, { error: e.message });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  const how = { virtualstore: 'edited copies in Windows VirtualStore (originals untouched)', direct: 'written into the game folder; the first save keeps the original as data.gob.original', target: 'edited copies in the --target folder' }[MODE];
  console.log(`Rugby 08 editor: http://localhost:${PORT}`);
  console.log(`Game:          ${GAME}`);
  console.log(`Saving:        ${how}`);
  console.log(`               ${FILES.map(f => f.out).join('\n               ')}`);
  console.log(`PocketBase:    ${PB ? `syncing to ${PB.url}` : 'not configured (see editor/pocketbase.js)'}`);
  console.log('Keep this window open while you edit. Press Ctrl+C to stop.');
  if (args.open) openBrowser(`http://localhost:${PORT}`);
});
server.on('error', e => {
  console.error(e.code === 'EADDRINUSE' ? `Port ${PORT} is in use. The editor may already be running: open http://localhost:${PORT}` : e.message);
  process.exit(1);
});
