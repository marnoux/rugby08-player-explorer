// Builds players.json and teams.json from the Rugby 08 player database text file.
// Usage: node build-data.js <player-database.txt> <output dir>
// The text file is entry 453779c39fd0d3f0742eb80e0cb2a7c7.txt inside data.gob (see bigdump.js).
const fs = require('fs');
const path = require('path');
const [, , src, outDir] = process.argv;
const lines = fs.readFileSync(src, 'latin1').split(/\r?\n/);
const header = lines[0];

const cols = ['ID', 'Head', 'Name', 'Nationality', 'Pos 1', 'Pos 2', 'Pos 3', 'Height (lbs/kg)', 'Weight (in/cm)',
  'Attack', 'Defense', 'Speed', 'Accel.', 'Agi.', 'Handling', 'Pass', 'Kick', 'G. Kick', 'Tackle', 'Str.', 'Ruck',
  'Scrum.', 'Hook', 'L. Outs', 'Disc.', 'Aggr.', 'Sta.', 'Consist.', 'Temp.', 'Creat.', 'Bravery', 'Fitness',
  'SS Command', 'SS Passer', 'SS Play Maker', 'SS Scoring', 'SS G. Kicker', 'SS T. Kicking', 'SS Crash Ball',
  'SS T. Breaker', 'SS Tackling', 'SS Ball Winner', 'SS Def. Org.', 'SS Scrum', 'SS Jump', 'SS I. Resist'];
let from = 0;
const starts = cols.map(c => {
  const i = header.indexOf(c, from);
  if (i < 0) throw new Error('missing column ' + c);
  from = i + c.length;
  return i;
});

const { groupOf, slugify } = require('./team-groups.js');

const teams = [];
const players = new Map();
let cur = null;
for (let i = 2; i < lines.length; i++) {
  const l = lines[i];
  if (!l.trim()) continue;
  if (!/^\d{5}\s/.test(l)) {
    const name = l.trim();
    const seen = teams.filter(t => t.srcName === name).length;
    const slug = slugify(name) + (seen ? '-' + (seen + 1) : '');
    cur = { slug, srcName: name, name: seen ? `${name} (list ${seen + 1})` : name, group: seen ? 'Internationals' : (groupOf(name) || 'Other'),
      order: teams.length, n: 0, srcRows: 0, line: i + 1, ids: new Set() };
    teams.push(cur);
    continue;
  }
  const r = starts.map((s, k) => l.slice(s, k + 1 < starts.length ? starts[k + 1] : s + 13).trim());
  cur.srcRows++;
  const id = r[0];
  if (cur.ids.has(id)) continue; // repeated row inside the same squad list
  cur.ids.add(id);
  cur.n++;
  let p = players.get(id);
  if (!p) {
    const rawName = r[2];
    const [hIn, hCm] = r[7].split('/').map(Number);
    const [wLb, wKg] = r[8].split('/').map(Number);
    p = {
      id, head: r[1], name: rawName.replace(/\^/g, '').trim(), star: rawName.includes('^') ? 1 : 0, nat: r[3],
      pos: [r[4], r[5], r[6]].filter(x => x && x !== 'None'),
      h: [hIn, hCm], w: [wLb, wKg],
      r: r.slice(9, 32).map(Number),
      ss: r.slice(32, 45).map(x => (x === 'Yes' ? '1' : '0')).join(''),
      ir: Number(r[45]),
      t: [],
    };
    players.set(id, p);
  }
  p.t.push([cur.slug, cur.n]);
}

for (const t of teams) {
  t.notes = [];
  if (t.srcRows !== t.n) t.notes.push(`The game file lists ${t.srcRows} rows for this squad; ${t.srcRows - t.n} are exact repeats and are shown once.`);
}
const eng2 = teams.find(t => t.slug === 'england-2');
if (eng2) eng2.notes.push('A second England list sits among the English clubs in the game file. It differs from the first list by one player and the order of two others.');

fs.mkdirSync(outDir, { recursive: true });
const asLines = arr => '[\n' + arr.map(x => JSON.stringify(x)).join(',\n') + '\n]\n';
fs.writeFileSync(path.join(outDir, 'players.json'), asLines([...players.values()]));
fs.writeFileSync(path.join(outDir, 'teams.json'), asLines(teams.map(({ slug, name, group, order, n, notes }) => ({ slug, name, group, order, n, notes }))));
console.log(`${players.size} players, ${teams.length} teams, ${teams.filter(t => !t.n).length} empty`);
