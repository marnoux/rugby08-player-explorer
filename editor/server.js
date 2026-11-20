// Rugby 08 squad and player editor: a small local server plus the page in editor/index.html.
//
//   node editor/server.js [--open] [--game <install folder>] [--target <folder>] [--port 4319]
//
// It reads the original database from the installed game's Data\data.gob and never changes that file.
// "Save to game" writes an edited data.gob to Windows' VirtualStore folder for the install (both Data\data.gob
// and Data\motion\data.gob). The game reads those copies when it is started normally (not as administrator).
// "Restore original game data" deletes the two copies. --target writes somewhere else instead (for testing).
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const g = require('../tools/gob.js');

const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const key = process.argv[i].replace(/^--/, ''), next = process.argv[i + 1];
  if (next === undefined || next.startsWith('--')) args[key] = true; else { args[key] = next; i++; }
}
const PORT = +args.port || 4319;

function findGame() {
  if (args.game) return path.resolve(args.game);
  try {
    const out = execFileSync('reg', ['query', 'HKLM\\SOFTWARE\\WOW6432Node\\EA SPORTS\\EA Sports Rugby 08', '/v', 'Install Dir'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const m = /Install Dir\s+REG_SZ\s+(.+)/.exec(out);
    if (m) return path.resolve(m[1].trim());
  } catch {}
  return 'C:\\Program Files (x86)\\EA SPORTS\\EA SPORTS(TM) Rugby 08';
}

function findTarget(game) {
  if (args.target) return path.resolve(args.target);
  const pf = [process.env['ProgramFiles(x86)'], process.env.ProgramFiles].filter(Boolean).map(p => p.toLowerCase() + path.sep);
  if (!pf.some(p => game.toLowerCase().startsWith(p))) {
    throw new Error(`The game at ${game} isn't under Program Files, so Windows won't redirect its files. Start the editor with --target <folder> and copy the result in yourself.`);
  }
  return path.join(process.env.LOCALAPPDATA, 'VirtualStore', game.slice(path.parse(game).root.length));
}

const GAME = findGame();
const ORIG_GOB = path.join(GAME, 'Data', 'data.gob');
if (!fs.existsSync(ORIG_GOB)) { console.error(`Can't find ${ORIG_GOB}. Start with --game "<install folder>".`); process.exit(1); }
const TARGET = findTarget(GAME);
const OUT = [path.join(TARGET, 'Data', 'data.gob'), path.join(TARGET, 'Data', 'motion', 'data.gob')];

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
  if (fs.existsSync(OUT[0])) {
    try {
      db = g.parseDb(g.readEntryFromFile(OUT[0], g.RDF_NAME));
      source = 'edited';
      savedAt = fs.statSync(OUT[0]).mtime.toISOString();
    } catch (e) {
      warning = `An edited data.gob exists but couldn't be read (${e.message}). Saving will replace it.`;
      db = ORIG_DB;
    }
  }
  return {
    game: GAME, target: TARGET, files: OUT, source, savedAt, warning,
    teamNames: TEAM_NAMES, nationalities: g.NATIONALITIES, positions: g.POSITIONS, ratings: g.RATINGS, skills: g.SKILLS,
    current: pub(db), original: pub(ORIG_DB),
  };
}

function gameRunning() {
  try {
    const out = execFileSync('tasklist', ['/FI', 'IMAGENAME eq Rugby08.exe', '/NH'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return /Rugby08\.exe/i.test(out);
  } catch { return false; }
}

function save(body) {
  if (gameRunning()) throw new Error('Rugby 08 is running. Close the game, then save again.');
  const rdf = g.applyDb(ORIG_RDF, body);
  for (const f of OUT) fs.mkdirSync(path.dirname(f), { recursive: true });
  g.writePatchedGob(ORIG_GOB, OUT[0], g.RDF_NAME, rdf);
  g.copyInto(OUT[0], OUT[1]);
}

function restore() {
  if (gameRunning()) throw new Error('Rugby 08 is running. Close the game first.');
  for (const f of OUT) if (fs.existsSync(f)) fs.unlinkSync(f);
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
  console.log(`Rugby 08 editor: http://localhost:${PORT}`);
  console.log(`Game:          ${GAME}`);
  console.log(`Saves go to:   ${OUT.join('\n               ')}`);
  console.log('Keep this window open while you edit. Press Ctrl+C to stop.');
  if (args.open) execFileSync('cmd', ['/c', 'start', '', `http://localhost:${PORT}`]);
});
server.on('error', e => {
  console.error(e.code === 'EADDRINUSE' ? `Port ${PORT} is in use. The editor may already be running: open http://localhost:${PORT}` : e.message);
  process.exit(1);
});
