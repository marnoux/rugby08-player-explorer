// Builds players.json and teams.json from the game's own database inside data.gob: the data the game plays with
// and the editor edits. It has every player record (including players in no squad), every team the game has,
// squads by slot (1-15 the starting line-up) and each team's captain and kicking roles.
//
//   node tools/build-data-gob.js [<game folder or data.gob>] [<output dir>]
//
// Without a path it finds the game the way the editor does. If an edited game has data.gob.original next to
// data.gob, the original is read, so the site shows the game as shipped. The output dir defaults to the repo root;
// run tools/build-pages.js afterwards to update docs/.
//
// Team names: a team keeps the name it had in the existing teams.json (matched by team number, or the first time
// by which players are in it), then the national side for numbers 1-25, then the game's kit list, then "Team N".
'use strict';
const fs = require('fs');
const path = require('path');
const g = require('./gob.js');
const { groupOf, slugify } = require('./team-groups.js');

// National teams by team number, as the game numbers them (the same numbers as in NATIONALITIES).
const COUNTRIES = [null, 'Argentina', 'Australia', 'Canada', 'Chile', 'England', 'Fiji', 'France', 'Georgia', 'Ireland', 'Italy',
  'Japan', 'Namibia', 'New Zealand', 'Portugal', 'Romania', 'Russia', 'Scotland', 'South Africa', 'Spain', 'Samoa', 'Tonga',
  'Tunisia', 'Uruguay', 'USA', 'Wales'];

const pad5 = id => String(id).padStart(5, '0');
// The conversions the game's own text export uses (checked against all 1,765 players in it).
const cm = inch => Math.trunc(inch * 2.54);
const kg = lb => Math.floor(lb * 0.4543);

// rdf: the database entry. kitXml: the kit list entry as text, or ''. prev: { players, teams } already on the site,
// or null. Returns { players, teams, log }.
function build(rdf, kitXml, prev) {
  const db = g.parseDb(rdf);
  const log = [];
  const NAT = new Map(g.NATIONALITIES.map(n => [2 ** n.bit, n.name]));
  const natName = mask => NAT.get(mask >>> 0) || 'Other';

  const players = new Map();
  for (const p of db.players) {
    if (players.has(p.id)) { log.push(`Player id ${pad5(p.id)} has more than one record; the first is used.`); continue; }
    players.set(p.id, {
      id: pad5(p.id), head: pad5(p.head), name: p.name.replace(/\^/g, '').trim(), star: p.name.includes('^') ? 1 : 0,
      nat: natName(p.nat),
      pos: p.pos.map(c => g.POSITIONS[c]).filter(Boolean),
      h: [p.inch, cm(p.inch)], w: [p.lb, kg(p.lb)],
      r: p.r,
      ss: g.SKILLS.map((_, i) => (p.sk >> i) & 1).join(''),
      ir: p.ir,
      t: [],
    });
  }
  const odd = [...players.values()].filter(p => p.nat === 'Other');
  if (odd.length) log.push(`${odd.length} players have a nationality value that isn't a single known country; shown as "Other".`);

  /* ---------- Team names ---------- */
  const kit = kitXml ? g.teamNamesFromKitXml(kitXml) : {};
  for (const k of Object.keys(kit)) kit[k] = kit[k].replace(/([a-z])([A-Z])/g, '$1 $2');
  const prevTeams = prev ? prev.teams : [];
  const named = new Map(); // tid -> { slug, name, group, how }
  const usedSlugs = new Set();
  const take = (tid, t, how) => { named.set(tid, { slug: t.slug, name: t.name, group: t.group, how }); usedSlugs.add(t.slug); };
  const ids = t => [...new Set(t.slots.filter(id => players.has(id)))];

  // 1. Same team number as last time.
  for (const pt of prevTeams) if (pt.tid && db.teams[pt.tid - 1] && !usedSlugs.has(pt.slug)) take(pt.tid, pt, 'kept');
  // 2. The first time: the existing list that holds most of the same players.
  if (prev && !prevTeams.some(t => t.tid)) {
    const members = {};
    for (const p of prev.players) for (const [slug] of p.t) (members[slug] = members[slug] || new Set()).add(+p.id);
    const pairs = [];
    for (const t of db.teams) {
      const mine = ids(t);
      if (!mine.length) continue;
      for (const pt of prevTeams) {
        const s = members[pt.slug]; if (!s) continue;
        const score = mine.filter(id => s.has(id)).length / Math.max(mine.length, s.size);
        if (score >= 0.6) pairs.push({ tid: t.tid, pt, score });
      }
    }
    pairs.sort((a, b) => b.score - a.score);
    for (const { tid, pt } of pairs) if (!named.has(tid) && !usedSlugs.has(pt.slug)) take(tid, pt, 'matched by squad');
  }
  // 3. National side, kit list or "Team N". A name the existing list already has (an empty team, say) keeps its slug.
  for (const t of db.teams) {
    if (named.has(t.tid)) continue;
    const name = COUNTRIES[t.tid] || kit[t.tid] || `Team ${t.tid}`;
    const how = COUNTRIES[t.tid] ? 'national side' : kit[t.tid] ? 'kit list' : 'no name found';
    const old = prevTeams.find(pt => !usedSlugs.has(pt.slug) && (slugify(pt.name) === slugify(name) || pt.slug === slugify(name)));
    if (old) { take(t.tid, old, `${how}, kept existing name`); continue; }
    let slug = slugify(name), n = 2;
    while (usedSlugs.has(slug)) slug = `${slugify(name)}-${n++}`;
    take(t.tid, { slug, name, group: COUNTRIES[t.tid] ? 'Internationals' : groupOf(name) || 'Other' }, how);
  }

  /* ---------- Squads ---------- */
  const teams = db.teams.map((t, order) => {
    const nm = named.get(t.tid), notes = [];
    const seen = new Set();
    let n = 0;
    t.slots.forEach((id, i) => {
      if (!id) return;
      const p = players.get(id);
      if (!p) { notes.push(`Slot ${i + 1} holds player id ${pad5(id)}, which has no player record in the game.`); return; }
      if (seen.has(id)) { notes.push(`${p.name} is listed twice (slots ${t.slots.indexOf(id) + 1} and ${i + 1}); shown once.`); return; }
      seen.add(id); n++;
      p.t.push([nm.slug, i + 1]);
    });
    return {
      slug: nm.slug, name: nm.name, group: nm.group, order, n, notes,
      tid: t.tid, roles: t.roles.map(id => (id ? pad5(id) : null)),
    };
  });

  const list = [...players.values()];
  log.unshift(`${list.length} players (${list.filter(p => p.t.length).length} in a squad, ${list.filter(p => !p.t.length).length} in none), ` +
    `${teams.length} teams (${teams.filter(t => !t.n).length} empty)`);
  for (const t of db.teams) {
    const nm = named.get(t.tid);
    log.push(`  team ${String(t.tid).padStart(3)}  ${nm.name.padEnd(24)} ${String(teams[t.tid - 1].n).padStart(2)} players  (${nm.how}${kit[t.tid] && kit[t.tid] !== nm.name ? `; kit list says "${kit[t.tid]}"` : ''})`);
  }
  return { players: list, teams, log };
}

function findGob(arg) {
  let gob;
  if (!arg) {
    const game = g.findGame();
    if (!game) throw new Error('Can\'t find Rugby 08. Give the game folder (the one that contains Data/data.gob) or the path to data.gob.');
    gob = path.join(game, 'Data', 'data.gob');
  } else {
    const p = path.resolve(arg);
    if (!fs.existsSync(p)) throw new Error(`${p} doesn't exist`);
    gob = !fs.statSync(p).isDirectory() ? p : g.hasGob(p) ? path.join(p, 'Data', 'data.gob') : path.join(p, 'data.gob');
    if (!fs.existsSync(gob)) throw new Error(`No data.gob in ${p}. Give the game folder (the one that contains Data/data.gob).`);
  }
  // An edited game (direct save mode) keeps the shipped archive next to it.
  if (fs.existsSync(gob + '.original')) { console.log(`Using ${gob}.original (the game as shipped; data.gob holds your edits)`); return gob + '.original'; }
  return gob;
}

const asLines = arr => '[\n' + arr.map(x => JSON.stringify(x)).join(',\n') + '\n]\n';
const readJson = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };

function main() {
  const [srcArg, outArg] = process.argv.slice(2);
  const gob = findGob(srcArg);
  const outDir = path.resolve(outArg || path.join(__dirname, '..'));
  console.log(`Reading ${gob}`);
  const rdf = g.readEntryFromFile(gob, g.RDF_NAME);
  let kitXml = '';
  try { kitXml = g.readEntryFromFile(gob, g.KIT_XML_NAME).toString('utf8'); } catch {}
  const prevP = readJson(path.join(outDir, 'players.json')), prevT = readJson(path.join(outDir, 'teams.json'));
  const { players, teams, log } = build(rdf, kitXml, prevP && prevT ? { players: prevP, teams: prevT } : null);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'players.json'), asLines(players));
  fs.writeFileSync(path.join(outDir, 'teams.json'), asLines(teams));
  console.log(log.join('\n'));
  console.log(`Wrote players.json and teams.json to ${outDir}. Check the team names above, then run: node tools/build-pages.js`);
}

module.exports = { build };
if (require.main === module) {
  try { main(); } catch (e) { console.error(e.message); process.exit(1); }
}
