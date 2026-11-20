// Optional: keeps a PocketBase instance in sync with every "Save to game", so you can also edit players
// and teams from PocketBase's own admin UI (see tools/export-edits.js for the one-off JSON export this
// grew out of, and the rugby08_players/rugby08_teams collections it's pushed into).
//
// To turn this on, create editor/pocketbase.local.json (gitignored, never committed) next to this file:
//   { "url": "https://your-instance", "token": "..." }
// "token" is a PocketBase superuser auth token: in PocketBase's admin UI, open your superuser account
// and look for an "Impersonate" option to generate one (give it a long expiry for ongoing use).
// Without that file, saving just skips this step.
'use strict';
const fs = require('fs');
const path = require('path');

function loadConfig() {
  const file = path.join(__dirname, 'pocketbase.local.json');
  if (!fs.existsSync(file)) return null;
  const { url, token } = JSON.parse(fs.readFileSync(file, 'utf8'));
  return url && token ? { url: url.replace(/\/$/, ''), token } : null;
}

async function req(cfg, method, pathname) {
  const res = await fetch(`${cfg.url}${pathname}`, { method, headers: { Authorization: `Bearer ${cfg.token}` } });
  if (!res.ok) throw new Error(`PocketBase ${pathname} failed: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

async function batch(cfg, requests) {
  const res = await fetch(`${cfg.url}/api/batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.token}` },
    body: JSON.stringify({ requests }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data) throw new Error(`PocketBase /api/batch failed: HTTP ${res.status}`);
  const failed = data.filter(r => r.status < 200 || r.status >= 300);
  if (failed.length) throw new Error(`PocketBase /api/batch: ${failed.length} of ${data.length} writes failed (${JSON.stringify(failed[0]).slice(0, 300)})`);
}

// Collection name, record field the live data keys on, and the live id field it maps to.
async function idsByKey(cfg, collection, keyField) {
  const map = new Map();
  for (let page = 1; ; page++) {
    const data = await req(cfg, 'GET', `/api/collections/${collection}/records?perPage=500&page=${page}&fields=id,${keyField}`);
    for (const r of data.items) map.set(String(r[keyField]), r.id);
    if (page >= data.totalPages) break;
  }
  return map;
}

const chunk = (arr, n) => { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; };

// Pushes players/teams (the editor's own current state, same shape as /api/save's body) into PocketBase:
// updates a record if one already exists for that player_id/tid, creates it otherwise. Throws on failure.
async function sync(cfg, { players, teams }) {
  const [playerIds, teamIds] = await Promise.all([
    idsByKey(cfg, 'rugby08_players', 'player_id'),
    idsByKey(cfg, 'rugby08_teams', 'tid'),
  ]);
  const playerReqs = (players || []).map(p => {
    const body = { player_id: String(p.id), name: p.name, pos: p.pos, lb: p.lb, nat: p.nat, inch: p.inch, r: p.r, sk: p.sk, ir: p.ir, head: p.head };
    const id = playerIds.get(String(p.id));
    return id ? { method: 'PATCH', url: `/api/collections/rugby08_players/records/${id}`, body }
               : { method: 'POST', url: '/api/collections/rugby08_players/records', body };
  });
  const teamReqs = (teams || []).map(t => {
    const body = { tid: t.tid, slots: t.slots, roles: t.roles, values: t.values };
    const id = teamIds.get(String(t.tid));
    return id ? { method: 'PATCH', url: `/api/collections/rugby08_teams/records/${id}`, body }
               : { method: 'POST', url: '/api/collections/rugby08_teams/records', body };
  });
  for (const c of chunk([...playerReqs, ...teamReqs], 50)) await batch(cfg, c);
}

module.exports = { loadConfig, sync };
