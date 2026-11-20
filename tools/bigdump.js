// Usage: node bigdump.js <gob> <outdir> [name ...]
// Parses EA BIGF, decompresses RefPack entries, writes them out.
const fs = require('fs');
const path = require('path');
const [, , gob, outdir, ...want] = process.argv;
const data = fs.readFileSync(gob);

function parseBig(buf, base = 0) {
  const count = buf.readUInt32BE(base + 8);
  let p = base + 16;
  const ents = [];
  for (let i = 0; i < count; i++) {
    const off = buf.readUInt32BE(p), size = buf.readUInt32BE(p + 4); p += 8;
    const e = buf.indexOf(0, p);
    ents.push({ name: buf.toString('latin1', p, e), off: base + off, size });
    p = e + 1;
  }
  return ents;
}

function refpack(src) {
  let p = 0;
  const flags = src[0];
  if (src[1] !== 0xfb) return null;
  p = 2;
  const big = flags & 0x80;
  const n = big ? 4 : 3;
  if (flags & 0x01) p += n; // compressed size present
  let outSize = 0;
  for (let i = 0; i < n; i++) outSize = (outSize << 8) | src[p++];
  outSize >>>= 0;
  const out = Buffer.alloc(outSize);
  let o = 0;
  while (p < src.length) {
    const b0 = src[p++];
    let lit, cnt, dist;
    if (b0 < 0x80) {
      const b1 = src[p++];
      lit = b0 & 3; cnt = ((b0 >> 2) & 7) + 3; dist = ((b0 & 0x60) << 3) + b1 + 1;
    } else if (b0 < 0xc0) {
      const b1 = src[p++], b2 = src[p++];
      lit = b1 >> 6; cnt = (b0 & 0x3f) + 4; dist = ((b1 & 0x3f) << 8) + b2 + 1;
    } else if (b0 < 0xe0) {
      const b1 = src[p++], b2 = src[p++], b3 = src[p++];
      lit = b0 & 3; cnt = ((b0 & 0x0c) << 6) + b3 + 5; dist = ((b0 & 0x10) << 12) + (b1 << 8) + b2 + 1;
    } else if (b0 < 0xfc) {
      lit = ((b0 & 0x1f) << 2) + 4; cnt = 0; dist = 0;
    } else {
      lit = b0 & 3; cnt = 0; dist = 0;
    }
    for (let i = 0; i < lit; i++) out[o++] = src[p++];
    for (let i = 0; i < cnt; i++) { out[o] = out[o - dist]; o++; }
    if (b0 >= 0xfc) break;
  }
  return out;
}

const ents = parseBig(data);
fs.mkdirSync(outdir, { recursive: true });
for (const e of ents) {
  if (want.length && !want.includes(e.name)) continue;
  const raw = data.subarray(e.off, e.off + e.size);
  let body = raw;
  try { const d = refpack(raw); if (d) body = d; } catch (err) { console.error('decomp fail', e.name, err.message); }
  fs.writeFileSync(path.join(outdir, e.name), body);
  console.log(e.name, e.size, '->', body.length);
}
