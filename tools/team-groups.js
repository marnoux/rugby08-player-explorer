// Which group each team is listed under on the site. Shared by build-data.js and build-data-gob.js.
'use strict';
const GROUPS = {
  'Internationals': ['Argentina', 'Australia', 'Canada', 'Chile', 'England', 'Fiji', 'France', 'Georgia', 'Ireland', 'Italy',
    'Japan', 'Namibia', 'New Zealand', 'Portugal', 'Romania', 'Russia', 'Scotland', 'South Africa', 'Spain', 'Samoa', 'Tonga',
    'Tunisia', 'Uruguay', 'USA', 'Wales', 'Jr. All Blacks'],
  // "Lions" is the Johannesburg side (all South African players), not the British & Irish Lions.
  'Super 14': ['Lions', 'Brumbies', 'Waratahs', 'Reds', 'Western Force', 'Blues', 'Crusaders', 'Highlanders', 'Chiefs', 'Hurricanes',
    'Bulls', 'Cats', 'Sharks', 'Stormers', 'Cheetahs'],
  'English clubs': ['NEC Harlequins', 'Bath', 'Bristol', 'Gloucester', 'Leeds', 'Leicester Tigers', 'London Irish', 'Newcastle',
    'Northampton', 'Rotherham', 'Sale', 'Saracens', 'London Wasps', 'Worcester', 'Cornish Pirates'],
  'French clubs': ['Agen', 'Beziers', 'Biarritz', 'Bourgoin', 'Brive', 'Castres', 'Clermont', 'Perpignan', 'Paris', 'Toulouse'],
  'Irish provinces': ['Leinster', 'Munster', 'Ulster', 'Connacht'],
  'Italian clubs': ['Treviso', 'Brescia', 'Viadana'],
  'Scottish clubs': ['Borders', 'Edinburgh', 'Glasgow'],
  'Welsh clubs': ['Bridgend', 'Cardiff', 'Llanelli', 'Neath-Swansea', 'Newport Gwent'],
  'Invitational sides': ['Australia A', 'British & Irish Lions', 'NZ Maori', 'Pacific Islanders'],
};
const groupOf = {};
for (const [g, names] of Object.entries(GROUPS)) for (const n of names) groupOf[n.toLowerCase()] = g;

const slugify = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

module.exports = { GROUPS, groupOf: name => groupOf[String(name).toLowerCase()], slugify };
