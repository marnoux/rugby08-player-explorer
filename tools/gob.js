// Reads and writes Rugby 08's data.gob archive and the player/team database inside it.
// Shared by tools/squad-edit.js and editor/server.js.
//
// data.gob is an EA "BIGF" archive: a big-endian directory of (offset, size, name), entries RefPack-compressed.
// The game's database is the entry named by RDF_NAME. Layout, checked against the game's own text export:
//   4-byte header
//   100-byte player records:
//     +0  u16 player id           +4  name, 16 bytes latin1, NUL-terminated ("^" at the end marks a star player)
//     +20 u16 positions: three 4-bit codes (main, second, third; 0 = none), top 4 bits kept as they are
//     +22 u16 weight in lb minus 100
//     +24 u32 nationality flags (one bit per country, see NATIONALITIES)
//     +28 u8  height in inches minus 60
//     +33.. the 23 ratings, one byte each, at RATING_OFFSETS (other bytes in between are kept as they are)
//     +84 u16 bits 0-12 special skills (SKILLS order), bits 13-14 "I. Resist" level, bit 15 kept as it is
//     +90 u16 head model id
//   some bytes of unknown use (kept)
//   104-byte team records, numbered from 1:
//     +0  30 x u16 player ids in squad order (0 = empty)   +60 u16 team number   +62 u16 (kept)
//     +64 7 x u16 role players (role 1 is usually the captain, roles 3-7 kicking duties)
//     +78 10 bytes of team values (meaning not known yet)   +88 the rest (kept)
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const RDF_NAME = '73cb47d1d69c90f28fd1cc4186ac1926.rdf';
const KIT_XML_NAME = '730eef3fd7726e43de955f21083ab000.xml';
const PLAYER_REC = 100, TEAM_REC = 104, SLOTS = 30, ROLES = 7, TEAM_VALUES = 10;
const RATING_OFFSETS = [33, 34, 35, 36, 37, 38, 39, 40, 42, 43, 44, 45, 46, 47, 48, 49, 50, 54, 55, 56, 57, 58, 59];
const RATINGS = ['Attack', 'Defence', 'Speed', 'Acceleration', 'Agility', 'Handling', 'Passing', 'Kicking', 'Goal kicking',
  'Tackling', 'Strength', 'Rucking', 'Scrummaging', 'Hooking', 'Line-outs', 'Discipline', 'Aggression', 'Stamina',
  'Consistency', 'Temperament', 'Creativity', 'Bravery', 'Fitness'];
const SKILLS = ['Command', 'Passer', 'Playmaker', 'Scoring', 'Goal kicker', 'Tactical kicking', 'Crash ball',
  'Tackle breaker', 'Tackling', 'Ball winner', 'Defensive organiser', 'Scrum', 'Line-out jump'];
// Position codes as the game stores them (note: wing is 10, centre is 11).
const POSITIONS = [null, 'Loosehead Prop', 'Hooker', 'Tighthead Prop', 'Second Row', 'Blindside Flanker', 'Openside Flanker',
  'Number Eight', 'Scrum Half', 'Fly Half', 'Wing', 'Centre', 'Full Back'];
// Nationality bit -> name and national team number. Chilean (bit 3) and Tunisian (bit 20) are inferred from the
// alphabetical order of the others; no player in the shipped data uses them.
const NATIONALITIES = [
  [0, 'Argentinian', 1], [1, 'Australian', 2], [2, 'Canadian', 3], [3, 'Chilean', 4], [4, 'English', 5], [5, 'Fijian', 6],
  [6, 'French', 7], [7, 'Georgian', 8], [8, 'Irish', 9], [9, 'Italian', 10], [10, 'Japanese', 11], [11, 'Namibian', 12],
  [12, 'New Zealand', 13], [13, 'Romanian', 15], [14, 'Russian', 16], [15, 'Samoan', 20], [16, 'Scottish', 17],
  [17, 'South African', 18], [18, 'Spanish', 19], [19, 'Tongan', 21], [20, 'Tunisian', 22], [21, 'Uruguayan', 23],
  [22, 'American', 24], [23, 'Welsh', 25], [24, 'Portugal', 14],
].map(([bit, name, team]) => ({ bit, name, team }));

/* ---------- Finding the game ---------- */
const hasGob = dir => fs.existsSync(path.join(dir, 'Data', 'data.gob'));

// The install folder (the one that contains Data/data.gob), or null. On Windows it looks in the registry and the
// default folder; on Linux and macOS in the usual Wine prefixes (~/.wine, $WINEPREFIX, ~/Games/*) and ~/Games itself.
function findGame() {
  if (process.platform === 'win32') {
    try {
      const out = execFileSync('reg', ['query', 'HKLM\\SOFTWARE\\WOW6432Node\\EA SPORTS\\EA Sports Rugby 08', '/v', 'Install Dir'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      const m = /Install Dir\s+REG_SZ\s+(.+)/.exec(out);
      if (m && hasGob(m[1].trim())) return path.resolve(m[1].trim());
    } catch {}
    const def = 'C:\\Program Files (x86)\\EA SPORTS\\EA SPORTS(TM) Rugby 08';
    return hasGob(def) ? def : null;
  }
  // Wine: look for EA SPORTS/<...Rugby 08...>/Data/data.gob under drive_c of the usual prefixes, then for an install
  // folder directly inside ~/Games.
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
  // A copy of the install folder placed directly in ~/Games (for example one added to Steam as a non-Steam game).
  try { for (const d of fs.readdirSync(path.join(home, 'Games'))) if (/rugby 08/i.test(d) && hasGob(path.join(home, 'Games', d))) return path.join(home, 'Games', d); } catch {}
  return null;
}

// The game keeps a roster for each profile, "<profile>.ros", in the user's Documents folder. A profile that has one
// plays with that roster, not with the squads in data.gob, so an edited data.gob only shows up in the game once
// those are moved aside and the game rebuilds them. Returns the paths of the ones it finds. `game` is the install
// folder; when it sits inside a Wine prefix, that prefix is searched too.
function findProfileRosters(game) {
  const sub = 'EA SPORTS(TM) Rugby 08', home = os.homedir(), docs = [];
  if (process.platform === 'win32') {
    for (const d of ['Documents', 'My Documents']) docs.push(path.join(process.env.USERPROFILE || home, d, sub));
  } else {
    const prefixes = [process.env.WINEPREFIX, path.join(home, '.wine')];
    const inPrefix = /^(.*?)[\\/]drive_c[\\/]/i.exec(game || '');
    if (inPrefix) prefixes.push(inPrefix[1]);
    const children = (dir, ...rest) => { try { return fs.readdirSync(dir).map(d => path.join(dir, d, ...rest)); } catch { return []; } };
    prefixes.push(...children(path.join(home, 'Games')));
    // Steam runs each game in its own Proton prefix; the Deck, a desktop install and Flatpak Steam keep them apart.
    for (const steam of [path.join(home, '.local', 'share', 'Steam'), path.join(home, '.steam', 'steam'), path.join(home, '.var', 'app', 'com.valvesoftware.Steam', '.local', 'share', 'Steam')]) {
      prefixes.push(...children(path.join(steam, 'steamapps', 'compatdata'), 'pfx'));
    }
    for (const pre of prefixes.filter(Boolean)) {
      for (const user of children(path.join(pre, 'drive_c', 'users'))) docs.push(path.join(user, 'Documents', sub), path.join(user, 'My Documents', sub));
    }
  }
  const found = new Set();
  for (const dir of docs) {
    let names = [];
    try { names = fs.readdirSync(dir); } catch { continue; }
    for (const n of names) if (/\.ros$/i.test(n)) { try { found.add(fs.realpathSync(path.join(dir, n))); } catch {} }
  }
  return [...found];
}

/* ---------- Archive ---------- */
function readDir(buf) {
  if (buf.toString('latin1', 0, 4) !== 'BIGF') throw new Error('Not a BIGF archive');
  const count = buf.readUInt32BE(8);
  let p = 16; const ents = [];
  for (let i = 0; i < count; i++) {
    const dirPos = p, off = buf.readUInt32BE(p), size = buf.readUInt32BE(p + 4); p += 8;
    const e = buf.indexOf(0, p);
    ents.push({ name: buf.toString('latin1', p, e), off, size, dirPos }); p = e + 1;
  }
  return ents;
}

function unrefpack(src) {
  if (src[1] !== 0xfb) throw new Error('Entry is not RefPack-compressed');
  const flags = src[0], n = (flags & 0x80) ? 4 : 3;
  let p = 2; if (flags & 0x01) p += n;
  let outSize = 0; for (let i = 0; i < n; i++) outSize = outSize * 256 + src[p++];
  const out = Buffer.alloc(outSize); let o = 0;
  while (p < src.length) {
    const b0 = src[p++]; let lit, cnt, dist;
    if (b0 < 0x80) { const b1 = src[p++]; lit = b0 & 3; cnt = ((b0 >> 2) & 7) + 3; dist = ((b0 & 0x60) << 3) + b1 + 1; }
    else if (b0 < 0xc0) { const b1 = src[p++], b2 = src[p++]; lit = b1 >> 6; cnt = (b0 & 0x3f) + 4; dist = ((b1 & 0x3f) << 8) + b2 + 1; }
    else if (b0 < 0xe0) { const b1 = src[p++], b2 = src[p++], b3 = src[p++]; lit = b0 & 3; cnt = ((b0 & 0x0c) << 6) + b3 + 5; dist = ((b0 & 0x10) << 12) + (b1 << 8) + b2 + 1; }
    else if (b0 < 0xfc) { lit = ((b0 & 0x1f) << 2) + 4; cnt = 0; dist = 0; }
    else { lit = b0 & 3; cnt = 0; dist = 0; }
    for (let i = 0; i < lit; i++) out[o++] = src[p++];
    for (let i = 0; i < cnt; i++) { out[o] = out[o - dist]; o++; }
    if (b0 >= 0xfc) break;
  }
  if (o !== outSize) throw new Error(`Decompressed ${o} bytes, expected ${outSize}`);
  return out;
}

// RefPack stream made only of literal blocks: valid for any RefPack decoder, about 1% larger than the input.
function refpackLiteral(data) {
  if (data.length >= 1 << 24) throw new Error('Too large for a 3-byte RefPack header');
  const parts = [Buffer.from([0x10, 0xfb, data.length >> 16 & 255, data.length >> 8 & 255, data.length & 255])];
  let p = 0;
  while (data.length - p >= 4) {
    const n = Math.min(112, (data.length - p) & ~3);
    parts.push(Buffer.from([0xe0 | ((n >> 2) - 1)]), data.subarray(p, p + n)); p += n;
  }
  const r = data.length - p;
  parts.push(Buffer.from([0xfc | r]), data.subarray(p));
  return Buffer.concat(parts);
}

function readHeaderDir(fd) {
  const head = Buffer.alloc(16);
  fs.readSync(fd, head, 0, 16, 0);
  if (head.toString('latin1', 0, 4) !== 'BIGF') throw new Error('Not a BIGF archive');
  const dirLen = head.readUInt32BE(12);
  const dir = Buffer.alloc(dirLen);
  fs.readSync(fd, dir, 0, dirLen, 0);
  return readDir(dir);
}

// Reads one entry from a data.gob on disk without loading the whole archive.
function readEntryFromFile(gobPath, name) {
  const fd = fs.openSync(gobPath, 'r');
  try {
    const ent = readHeaderDir(fd).find(e => e.name === name);
    if (!ent) throw new Error(`${name} not found in ${gobPath}`);
    const raw = Buffer.alloc(ent.size);
    fs.readSync(fd, raw, 0, ent.size, ent.off);
    return raw[1] === 0xfb ? unrefpack(raw) : raw;
  } finally { fs.closeSync(fd); }
}

function hasEntry(gobPath, name) {
  const fd = fs.openSync(gobPath, 'r');
  try { return readHeaderDir(fd).some(e => e.name === name); } catch { return false; } finally { fs.closeSync(fd); }
}

// Writes outPath as a copy of origPath with one entry replaced. The new entry is appended at the end and the
// directory is pointed at it; nothing else in the archive changes. Checks the result before moving it into place.
function writePatchedGob(origPath, outPath, name, data) {
  const packed = refpackLiteral(data);
  if (!unrefpack(packed).equals(data)) throw new Error('Compression check failed');
  const fd = fs.openSync(origPath, 'r');
  let ent, origSize;
  try { ent = readHeaderDir(fd).find(e => e.name === name); origSize = fs.fstatSync(fd).size; } finally { fs.closeSync(fd); }
  if (!ent) throw new Error(`${name} not found in ${origPath}`);
  const tmp = outPath + '.tmp';
  fs.copyFileSync(origPath, tmp);
  const ALIGN = 2048, newOff = Math.ceil(origSize / ALIGN) * ALIGN;
  const w = fs.openSync(tmp, 'r+');
  try {
    if (newOff > origSize) fs.writeSync(w, Buffer.alloc(newOff - origSize), 0, newOff - origSize, origSize);
    fs.writeSync(w, packed, 0, packed.length, newOff);
    const d = Buffer.alloc(8); d.writeUInt32BE(newOff, 0); d.writeUInt32BE(packed.length, 4);
    fs.writeSync(w, d, 0, 8, ent.dirPos);
    const s = Buffer.alloc(4); s.writeUInt32LE(newOff + packed.length, 0);
    fs.writeSync(w, s, 0, 4, 4);
  } finally { fs.closeSync(w); }
  if (!readEntryFromFile(tmp, name).equals(data)) { fs.unlinkSync(tmp); throw new Error('Read-back check failed'); }
  fs.renameSync(tmp, outPath);
}

function copyInto(src, dest) {
  const tmp = dest + '.tmp';
  fs.copyFileSync(src, tmp);
  fs.renameSync(tmp, dest);
}

/* ---------- Database ---------- */
function parseDb(rdf) {
  const players = [];
  let o = 4;
  while (o + PLAYER_REC <= rdf.length) {
    const name = rdf.toString('latin1', o + 4, o + 20).split('\0')[0];
    if (!/^[A-Za-z]/.test(name)) break;
    const pos = rdf.readUInt16LE(o + 20), sk = rdf.readUInt16LE(o + 84);
    players.push({
      id: rdf.readUInt16LE(o), name,
      pos: [pos & 15, (pos >> 4) & 15, (pos >> 8) & 15],
      lb: rdf.readUInt16LE(o + 22) + 100,
      nat: rdf.readUInt32LE(o + 24),
      inch: rdf[o + 28] + 60,
      r: RATING_OFFSETS.map(k => rdf[o + k]),
      sk: sk & 0x1fff, ir: (sk >> 13) & 3,
      head: rdf.readUInt16LE(o + 90),
      off: o,
    });
    o += PLAYER_REC;
  }
  let t = o;
  const isTeamStart = x => rdf.readUInt16LE(x + 60) === 1 && rdf.readUInt16LE(x + TEAM_REC + 60) === 2 && rdf.readUInt16LE(x + 2 * TEAM_REC + 60) === 3;
  while (t + 3 * TEAM_REC <= rdf.length && !isTeamStart(t)) t += 2;
  if (t + 3 * TEAM_REC > rdf.length) throw new Error('Could not find the team table');
  const teams = [];
  for (let x = t; x + TEAM_REC <= rdf.length && rdf.readUInt16LE(x + 60) === teams.length + 1; x += TEAM_REC) {
    teams.push({
      tid: teams.length + 1,
      slots: [...Array(SLOTS)].map((_, i) => rdf.readUInt16LE(x + i * 2)),
      roles: [...Array(ROLES)].map((_, i) => rdf.readUInt16LE(x + 64 + i * 2)),
      values: [...rdf.subarray(x + 78, x + 78 + TEAM_VALUES)],
      off: x,
    });
  }
  return { players, teams };
}

const isInt = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Returns a copy of origRdf with the given players and teams written into it. Only values that differ from the
// original are checked and written, so quirks in the shipped data (unusual codes, ids with no player record)
// and any bytes after an unchanged name stay exactly as they were.
function applyDb(origRdf, state) {
  const db = parseDb(origRdf);
  const out = Buffer.from(origRdf);
  const pById = new Map(db.players.map(p => [p.id, p]));
  const tById = new Map(db.teams.map(t => [t.tid, t]));
  const heads = new Set(db.players.map(p => p.head));
  const errors = [];
  for (const p of state.players || []) {
    const o0 = pById.get(p.id);
    if (!o0) { errors.push(`Unknown player id ${p.id}`); continue; }
    const at = o0.off, who = o0.name;
    if (p.name !== o0.name) {
      if (typeof p.name !== 'string' || !/^[A-Za-z]/.test(p.name)) errors.push(`${who}: name must start with a letter`);
      else if (!/^[\x20-\x7e\xa0-\xff]+$/.test(p.name)) errors.push(`${who}: name has characters the game can't show`);
      else if (Buffer.byteLength(p.name, 'latin1') > 15) errors.push(`${who}: name is longer than 15 characters`);
      else { const nb = Buffer.alloc(16); nb.write(p.name, 'latin1'); nb.copy(out, at + 4); }
    }
    const pos = p.pos || [];
    if (!same(pos, o0.pos)) {
      if (!isInt(pos[0], 1, 12) || !isInt(pos[1], 0, 12) || !isInt(pos[2], 0, 12)) errors.push(`${who}: positions must be codes 1-12 (main) and 0-12`);
      else out.writeUInt16LE((origRdf.readUInt16LE(at + 20) & 0xf000) | pos[0] | pos[1] << 4 | pos[2] << 8, at + 20);
    }
    if (p.lb !== o0.lb) { if (!isInt(p.lb, 100, 600)) errors.push(`${who}: weight must be 100-600 lb`); else out.writeUInt16LE(p.lb - 100, at + 22); }
    if (p.nat !== o0.nat) { if (!isInt(p.nat, 0, 0xffffffff)) errors.push(`${who}: bad nationality`); else out.writeUInt32LE(p.nat, at + 24); }
    if (p.inch !== o0.inch) { if (!isInt(p.inch, 60, 100)) errors.push(`${who}: height must be 60-100 inches`); else out[at + 28] = p.inch - 60; }
    if (!same(p.r, o0.r)) {
      if (!Array.isArray(p.r) || p.r.length !== RATINGS.length || !p.r.every(v => isInt(v, 0, 100))) errors.push(`${who}: ratings must be 23 whole numbers from 0 to 100`);
      else p.r.forEach((v, i) => { out[at + RATING_OFFSETS[i]] = v; });
    }
    if (p.sk !== o0.sk || p.ir !== o0.ir) {
      if (!isInt(p.sk, 0, 0x1fff) || !isInt(p.ir, 0, 3)) errors.push(`${who}: bad special skills or I. Resist`);
      else out.writeUInt16LE((origRdf.readUInt16LE(at + 84) & 0x8000) | p.sk | p.ir << 13, at + 84);
    }
    if (p.head !== o0.head) {
      if (!heads.has(p.head)) errors.push(`${who}: head model ${p.head} isn't used by any player in the game`);
      else out.writeUInt16LE(p.head, at + 90);
    }
  }
  for (const t of state.teams || []) {
    const o0 = tById.get(t.tid);
    if (!o0) { errors.push(`Unknown team number ${t.tid}`); continue; }
    const at = o0.off, who = `Team ${t.tid}`;
    // Ids already in the shipped record are allowed even when no player record exists for them.
    const okId = (id, orig) => id === 0 || pById.has(id) || orig.includes(id);
    if (!same(t.slots, o0.slots)) {
      if (!Array.isArray(t.slots) || t.slots.length !== SLOTS || !t.slots.every(id => isInt(id, 0, 0xffff) && okId(id, o0.slots))) errors.push(`${who}: squad must be 30 player ids (0 for an empty slot)`);
      else {
        const filled = t.slots.filter(Boolean);
        if (new Set(filled).size !== filled.length) errors.push(`${who}: a player appears twice in the squad`);
        else t.slots.forEach((id, i) => out.writeUInt16LE(id, at + i * 2));
      }
    }
    if (!same(t.roles, o0.roles)) {
      if (!Array.isArray(t.roles) || t.roles.length !== ROLES || !t.roles.every(id => isInt(id, 0, 0xffff) && okId(id, o0.roles))) errors.push(`${who}: roles must be 7 player ids`);
      else t.roles.forEach((id, i) => out.writeUInt16LE(id, at + 64 + i * 2));
    }
    if (!same(t.values, o0.values)) {
      if (!Array.isArray(t.values) || t.values.length !== TEAM_VALUES || !t.values.every(v => isInt(v, 0, 255))) errors.push(`${who}: team values must be 10 numbers from 0 to 255`);
      else t.values.forEach((v, i) => { out[at + 78 + i] = v; });
    }
  }
  if (errors.length) throw new Error(errors.slice(0, 12).join('\n') + (errors.length > 12 ? `\n…and ${errors.length - 12} more` : ''));
  return out;
}

function teamNamesFromKitXml(xml) {
  const names = {};
  for (const m of xml.matchAll(/<team\s+name="([^"]+)"[^>]*\bid="(\d+)"/g)) names[+m[2]] = m[1];
  return names;
}

module.exports = {
  RDF_NAME, KIT_XML_NAME, SLOTS, ROLES, TEAM_VALUES, RATINGS, SKILLS, POSITIONS, NATIONALITIES,
  hasGob, findGame, findProfileRosters, readDir, unrefpack, refpackLiteral, readEntryFromFile, hasEntry, writePatchedGob, copyInto, parseDb, applyDb, teamNamesFromKitXml,
};
