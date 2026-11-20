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
const { execFileSync, spawn } = require('child_process');
const g = require('../tools/gob.js');

const IS_WIN = process.platform === 'win32';
const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const key = process.argv[i].replace(/^--/, ''), next = process.argv[i + 1];
  if (next === undefined || next.startsWith('--')) args[key] = true; else { args[key] = next; i++; }
}
const PORT = +args.port || 4319;

const hasGob = g.hasGob;

function underProgramFiles(dir) {
  const pf = [process.env['ProgramFiles(x86)'], process.env.ProgramFiles].filter(Boolean).map(p => p.toLowerCase() + path.sep);
  return pf.some(p => dir.toLowerCase().startsWith(p));
}

const GAME = args.game ? path.resolve(args.game) : g.findGame();
if (!GAME || !hasGob(GAME)) {
  console.error(`Can't find Rugby 08${GAME ? ` in ${GAME}` : ''}. Start the editor with --game "<install folder>", the folder that contains Data/data.gob.`);
  process.exit(1);
}
const MODE = args.target ? 'target' : IS_WIN && !args.direct && underProgramFiles(GAME) ? 'virtualstore' : 'direct';

// Each archive the editor writes: `orig` is where the unedited archive is kept, `out` is where the edit goes.
const LIVE = ['data.gob', path.join('motion', 'data.gob')].map(f => path.join(GAME, 'Data', f)).filter(f => fs.existsSync(f));
const FILES = LIVE.map(live => {
  if (MODE === 'direct') return { orig: live + '.original', out: live, backup: true };
  const base = MODE === 'target' ? path.resolve(args.target) : path.join(process.env.LOCALAPPDATA, 'VirtualStore', GAME.slice(path.parse(GAME).root.length));
  return { orig: live, out: path.join(base, path.relative(GAME, live)) };
});
// Where the unedited archive is right now: in direct mode the live file until the first save makes the backup.
const pristine = f => (f.backup && !fs.existsSync(f.orig) ? f.out : f.orig);
const isEdited = () => (FILES[0].backup ? fs.existsSync(FILES[0].orig) : fs.existsSync(FILES[0].out));

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
    // Built from data.gob (tools/build-data-gob.js): each team carries its number, so use the site's names directly.
    if (teams.some(tm => tm.tid)) {
      for (const tm of teams) if (tm.tid) names[tm.tid] = tm.name;
      return names;
    }
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
    game: GAME, mode: MODE, files: FILES.map(f => f.out), source, savedAt, warning, rosters: g.findProfileRosters(GAME),
    teamNames: TEAM_NAMES, nationalities: g.NATIONALITIES, positions: g.POSITIONS, ratings: g.RATINGS, skills: g.SKILLS,
    current: pub(db), original: pub(ORIG_DB),
  };
}

function gameRunning() {
  try {
    if (IS_WIN) return /Rugby08\.exe/i.test(execFileSync('tasklist', ['/FI', 'IMAGENAME eq Rugby08.exe', '/NH'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
    execFileSync('pgrep', ['-fi', 'rugby08\\.exe'], { stdio: 'ignore' }); // exits 0 only when a match is running
    return true;
  } catch { return false; }
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
      if (url.pathname === '/api/save') save(body); else restore();
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
  const rosters = g.findProfileRosters(GAME);
  if (rosters.length) {
    console.log('\nProfile rosters (the game plays with these instead of the edited data.gob; if it still shows the old\nsquads after you save, close the game and move these aside so it rebuilds them):');
    for (const r of rosters) console.log(`               ${r}`);
    console.log('');
  }
  console.log('Keep this window open while you edit. Press Ctrl+C to stop.');
  if (args.open) openBrowser(`http://localhost:${PORT}`);
});
server.on('error', e => {
  console.error(e.code === 'EADDRINUSE' ? `Port ${PORT} is in use. The editor may already be running: open http://localhost:${PORT}` : e.message);
  process.exit(1);
});
