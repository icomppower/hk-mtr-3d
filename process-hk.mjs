// Build compact embedded dataset for the HK MTR 3D map.
// Inputs: rel_geom.json (OSM relations w/ geometry), stations_osm.json, mtr_lines_and_stations.csv, hk.geojson
// Output: data.json  { routes:[{id,color,name,shapes:[[[x,y,z]...]]}], stations:[...], boroughs:[[[x,z]...]] }
import fs from 'fs';

const LAT0 = 22.37, LON0 = 114.10;
const KY = 111.32, KX = 111.32 * Math.cos(LAT0 * Math.PI / 180);
const proj = (lat, lon) => [(lon - LON0) * KX, (LAT0 - lat) * KY];

const csv = (line) => {
  const out = []; let cur = '', q = false;
  for (const ch of line) {
    if (ch === '"') q = !q;
    else if (ch === ',' && !q) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur); return out;
};
const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

// ---- official CSV: line -> station sequence, station -> {en, zh, lines}
const rows = fs.readFileSync('mtr_lines_and_stations.csv', 'utf8').split(/\r?\n/).filter(l => l.trim());
const stinfo = {};   // norm(en) -> {en, zh, lines:Set}
for (const r of rows.slice(1)) {
  const c = csv(r).map(v => v.trim());
  const [line, dir, code, id, zh, en] = c;
  if (!en) continue;
  const k = norm(en);
  (stinfo[k] ||= { en, zh, lines: new Set() }).lines.add(line.split('-')[0]);
}
console.log('official stations:', Object.keys(stinfo).length);

// ---- OSM relations
const rel = JSON.parse(fs.readFileSync('rel_geom.json', 'utf8'));
const LINES = ['AEL', 'TCL', 'TML', 'TKL', 'EAL', 'SIL', 'TWL', 'ISL', 'KTL', 'DRL'];
const COLOR = {};
const byLine = {};
for (const el of rel.elements) {
  const ref = el.tags?.ref;
  if (!ref || !LINES.includes(ref)) continue;
  if (el.tags.colour) COLOR[ref] = el.tags.colour.toUpperCase();
  (byLine[ref] ||= []).push(el);
}

const wayElev = (t = {}) => t.tunnel ? -15 : (t.bridge ? 14 : (t.covered ? -8 : 0));

// stitch a relation's ways into continuous segments with per-point elevation
function stitch(relation) {
  const segs = [];
  let cur = null, curE = null;
  const dist = (a, b) => Math.hypot((a[0] - b[0]) * KY, (a[1] - b[1]) * KX);
  for (const m of relation.members || []) {
    if (m.type !== 'way' || !m.geometry || /platform|stop|entrance/.test(m.role || '')) continue;
    let pts = m.geometry.map(g => [g.lat, g.lon]);
    const e = wayElev(m.tags); // note: member tags absent in out geom; filled later via ways pass
    if (!cur) { cur = pts.slice(); curE = pts.map(() => e); continue; }
    const end = cur[cur.length - 1];
    if (dist(end, pts[0]) < 0.05) { /* forward */ }
    else if (dist(end, pts[pts.length - 1]) < 0.05) pts = pts.slice().reverse();
    else if (dist(cur[0], pts[0]) < 0.05) { cur.reverse(); curE.reverse(); }
    else if (dist(cur[0], pts[pts.length - 1]) < 0.05) { cur.reverse(); curE.reverse(); pts = pts.slice().reverse(); }
    else { segs.push({ pts: cur, elev: curE }); cur = pts.slice(); curE = pts.map(() => e); continue; }
    cur.push(...pts.slice(1));
    curE.push(...pts.slice(1).map(() => e));
    void end;
  }
  if (cur) segs.push({ pts: cur, elev: curE });
  return segs;
}

// member tags are not included by `out geom` for ways — but Overpass DOES include
// per-member geometry only. We need way tags (tunnel/bridge): fetched separately into ways_tags.json
let wayTags = {};
if (fs.existsSync('ways_tags.json')) {
  const wt = JSON.parse(fs.readFileSync('ways_tags.json', 'utf8'));
  for (const el of wt.elements) wayTags[el.id] = el.tags || {};
}

// redo stitching using way refs + tags
function stitch2(relation) {
  const segs = [];
  let cur = null, curE = null;
  const dist = (a, b) => Math.hypot((a[0] - b[0]) * KY, (a[1] - b[1]) * KX);
  for (const m of relation.members || []) {
    if (m.type !== 'way' || !m.geometry || /platform|stop|entrance/.test(m.role || '')) continue;
    let pts = m.geometry.map(g => [g.lat, g.lon]);
    const e = wayElev(wayTags[m.ref]);
    if (!cur) { cur = pts.slice(); curE = pts.map(() => e); continue; }
    const end = cur[cur.length - 1];
    if (dist(end, pts[0]) < 0.05) { }
    else if (dist(end, pts[pts.length - 1]) < 0.05) pts = pts.slice().reverse();
    else if (dist(cur[0], pts[0]) < 0.05) { cur.reverse(); curE.reverse(); }
    else if (dist(cur[0], pts[pts.length - 1]) < 0.05) { cur.reverse(); curE.reverse(); pts = pts.slice().reverse(); }
    else { segs.push({ pts: cur, elev: curE }); cur = pts.slice(); curE = pts.map(() => e); continue; }
    cur.push(...pts.slice(1));
    curE.push(...pts.slice(1).map(() => e));
  }
  if (cur) segs.push({ pts: cur, elev: curE });
  return segs;
}

// ---- Douglas-Peucker returning keep mask
function simplifyMask(pts, tol) {
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  if (pts.length < 3) return keep.fill(1);
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let md = 0, mi = -1;
    const [ay, ax] = pts[a], [by, bx] = pts[b];
    const dy = by - ay, dx = bx - ax, len2 = dy * dy + dx * dx || 1e-12;
    for (let i = a + 1; i < b; i++) {
      const t = Math.max(0, Math.min(1, ((pts[i][0] - ay) * dy + (pts[i][1] - ax) * dx) / len2));
      const d = (pts[i][0] - (ay + t * dy)) ** 2 + (pts[i][1] - (ax + t * dx)) ** 2;
      if (d > md) { md = d; mi = i; }
    }
    if (md > tol * tol) { keep[mi] = 1; stack.push([a, mi], [mi, b]); }
  }
  return keep;
}

// ---- per line: greedy coverage over all relation segments
const covKey = (lat, lon) => `${Math.round(lat * 700)}:${Math.round(lon * 700)}`;
const segLen = (pts) => { let l = 0; for (let i = 1; i < pts.length; i++) l += Math.hypot((pts[i][0] - pts[i - 1][0]) * KY, (pts[i][1] - pts[i - 1][1]) * KX); return l; };
const NAME = { AEL: 'Airport Express 機場快綫', TCL: 'Tung Chung Line 東涌綫', TML: 'Tuen Ma Line 屯馬綫', TKL: 'Tseung Kwan O Line 將軍澳綫', EAL: 'East Rail Line 東鐵綫', SIL: 'South Island Line 南港島綫', TWL: 'Tsuen Wan Line 荃灣綫', ISL: 'Island Line 港島綫', KTL: 'Kwun Tong Line 觀塘綫', DRL: 'Disneyland Resort Line 迪士尼綫' };

const outRoutes = [];
for (const rid of LINES) {
  const segs = (byLine[rid] || []).flatMap(stitch2).filter(s => segLen(s.pts) > 1.0);
  segs.sort((a, b) => segLen(b.pts) - segLen(a.pts));
  const covered = new Set();
  const picked = [];
  for (const s of segs) {
    let fresh = 0;
    for (const [lat, lon] of s.pts) if (!covered.has(covKey(lat, lon))) fresh++;
    if (picked.length === 0 || (fresh / s.pts.length > 0.1 && fresh > 25)) {
      picked.push(s);
      for (const [lat, lon] of s.pts) covered.add(covKey(lat, lon));
    }
    if (picked.length >= 4) break;
  }
  const outShapes = picked.map(s => {
    const keep = simplifyMask(s.pts, 0.00008);
    const pts = s.pts.filter((_, i) => keep[i]);
    let elev = s.elev.filter((_, i) => keep[i]);
    for (let pass = 0; pass < 3; pass++)
      elev = elev.map((e, i) => (elev[Math.max(0, i - 1)] + e * 2 + elev[Math.min(elev.length - 1, i + 1)]) / 4);
    return pts.map(([lat, lon], i) => {
      const [x, z] = proj(lat, lon);
      return [+x.toFixed(3), +elev[i].toFixed(1), +z.toFixed(3)];
    });
  });
  outRoutes.push({ id: rid, color: COLOR[rid] || '#888', name: NAME[rid] || rid, shapes: outShapes });
}

// ---- stations: OSM nodes matched to official CSV
const osmSt = JSON.parse(fs.readFileSync('stations_osm.json', 'utf8'));
const matched = {};
for (const el of osmSt.elements) {
  const en = el.tags?.['name:en'] || el.tags?.name;
  const k = norm(en);
  const lat = el.lat ?? el.center?.lat, lon = el.lon ?? el.center?.lon;
  if (stinfo[k] && lat != null && !matched[k]) matched[k] = { lat, lon };
}
const missing = Object.keys(stinfo).filter(k => !matched[k]);
console.log('matched:', Object.keys(matched).length, 'missing:', missing.map(k => stinfo[k].en).join(', ') || 'none');

// elevation of a station = elevation of nearest point on any of its lines' shapes
function stationElev(x, z, lines) {
  let best = 0, bd = Infinity;
  for (const r of outRoutes) {
    if (!lines.has(r.id)) continue;
    for (const shp of r.shapes) for (const [px, py, pz] of shp) {
      const d = (px - x) ** 2 + (pz - z) ** 2;
      if (d < bd) { bd = d; best = py; }
    }
  }
  return Math.round(best);
}
const outStations = [];
for (const k of Object.keys(matched)) {
  const { lat, lon } = matched[k];
  const info = stinfo[k];
  const [x, z] = proj(lat, lon);
  outStations.push({ n: info.en, zh: info.zh, r: [...info.lines], x: +x.toFixed(3), y: stationElev(x, z, info.lines), z: +z.toFixed(3) });
}

// ---- district rings (resample + light simplify, drop tiny)
const hk = JSON.parse(fs.readFileSync('hk.geojson', 'utf8'));
const rings = [];
for (const f of hk.features) {
  const polys = f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [f.geometry.coordinates];
  for (const poly of polys) {
    if (!poly || !poly[0] || poly[0].length < 12) continue;
    const ring = poly[0].map(([lon, lat]) => [lat, lon]);
    const res = [ring[0]];
    let acc = 0;
    for (let i = 1; i < ring.length; i++) {
      acc += Math.hypot((ring[i][0] - ring[i - 1][0]) * KY, (ring[i][1] - ring[i - 1][1]) * KX);
      if (acc >= 0.1) { res.push(ring[i]); acc = 0; }
    }
    if (res.length < 6) continue;
    const keep = simplifyMask(res, 0.0003);
    const simp = res.filter((_, i) => keep[i]);
    if (simp.length >= 6) rings.push(simp.map(([lat, lon]) => proj(lat, lon).map(v => +v.toFixed(2))));
  }
}

const data = { routes: outRoutes, stations: outStations, boroughs: rings };
fs.writeFileSync('data.json', JSON.stringify(data));
console.log(`routes: ${outRoutes.length}, shapes: ${outRoutes.reduce((a, r) => a + r.shapes.length, 0)}, pts: ${outRoutes.reduce((a, r) => a + r.shapes.reduce((b, s) => b + s.length, 0), 0)}`);
console.log(`stations: ${outStations.length}, rings: ${rings.length}, data.json: ${(fs.statSync('data.json').size / 1024).toFixed(0)} KB`);
for (const r of outRoutes) console.log(` ${r.id}: ${r.shapes.map(s => s.length).join('+')} pts ${r.color}`);
