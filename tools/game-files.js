// Finds the Rugby 08 install and works out where each live archive's original and edited copy are.
// Shared by editor/server.js, tools/export-edits.js and tools/apply-edits.js.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const IS_WIN = process.platform === 'win32';
const hasGob = dir => fs.existsSync(path.join(dir, 'Data', 'data.gob'));

// Without gameArg, looks in the Windows registry, or on Linux/macOS in the usual Wine prefixes
// (~/.wine, $WINEPREFIX, ~/Games/*). Returns null if nothing is found. With gameArg, returns it
// resolved without checking it — callers pair this with hasGob() to validate and report a bad path.
function findGame(gameArg) {
  if (gameArg) return path.resolve(gameArg);
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

function gameRunning() {
  try {
    if (IS_WIN) return /Rugby08\.exe/i.test(execFileSync('tasklist', ['/FI', 'IMAGENAME eq Rugby08.exe', '/NH'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
    execFileSync('pgrep', ['-fi', 'rugby08\\.exe'], { stdio: 'ignore' });
    return true;
  } catch { return false; }
}

// For a validated GAME folder, works out where "Save to game" reads/writes, for each live archive
// (Data/data.gob and Data/motion/data.gob):
//   direct       the live file itself; the first save keeps the original as <file>.original
//   virtualstore Windows VirtualStore shadow copy of a Program Files install (original untouched)
//   target       a --target folder, for testing
function buildFiles(GAME, { direct, target } = {}) {
  const MODE = target ? 'target' : IS_WIN && !direct && underProgramFiles(GAME) ? 'virtualstore' : 'direct';
  const live = ['data.gob', path.join('motion', 'data.gob')].map(f => path.join(GAME, 'Data', f)).filter(f => fs.existsSync(f));
  const FILES = live.map(l => {
    if (MODE === 'direct') return { orig: l + '.original', out: l, backup: true };
    const base = MODE === 'target' ? path.resolve(target) : path.join(process.env.LOCALAPPDATA || '', 'VirtualStore', GAME.slice(path.parse(GAME).root.length));
    return { orig: l, out: path.join(base, path.relative(GAME, l)) };
  });
  return { MODE, FILES };
}

// Where the unedited archive is right now: in direct mode the live file until the first save makes the
// backup; otherwise the original location (Program Files, or the game folder in target mode).
const pristine = f => (f.backup && !fs.existsSync(f.orig) ? f.out : f.orig);
const isEdited = f => (f.backup ? fs.existsSync(f.orig) : fs.existsSync(f.out));

module.exports = { IS_WIN, hasGob, findGame, underProgramFiles, gameRunning, buildFiles, pristine, isEdited };
