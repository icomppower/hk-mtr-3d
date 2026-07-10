#!/usr/bin/env node
// One-off: invert v1/data.json's local equirectangular (x,z in km) back to real lng/lat,
// and dump stations + lines as JS literals ready to paste into data.js.
// Projection (from v1/process-hk.mjs): LAT0=22.37, LON0=114.10, KY=111.32, KX=111.32*cos(LAT0)
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const v1 = JSON.parse(readFileSync(resolve(root, "v1/data.json"), "utf8"));

const LAT0 = 22.37, LON0 = 114.10, KY = 111.32, KX = 111.32 * Math.cos(LAT0 * Math.PI / 180);
const toLL = (x, z) => [+(x / KX + LON0).toFixed(5), +(LAT0 - z / KY).toFixed(5)];

const stations = v1.stations.map(s => {
  const [lng, lat] = toLL(s.x, s.z);
  return { n: s.n, zh: s.zh, r: s.r, lng, lat, y: s.y };
});

const lines = v1.routes.map(rt => ({
  id: rt.id, color: rt.color, name: rt.name,
  shapes: rt.shapes.map(seg => seg.map(([x, , z]) => toLL(x, z))),
}));

writeFileSync(resolve(root, "tools/v1-converted.json"), JSON.stringify({ stations, lines }, null, 1));
console.log(`${stations.length} stations, ${lines.length} lines -> tools/v1-converted.json`);
console.log("lng range", Math.min(...stations.map(s=>s.lng)), Math.max(...stations.map(s=>s.lng)));
console.log("lat range", Math.min(...stations.map(s=>s.lat)), Math.max(...stations.map(s=>s.lat)));
