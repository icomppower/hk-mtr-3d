#!/usr/bin/env node
// Emit geography.points / geography.lines JS literals from tools/v1-converted.json,
// ready to paste into data.js. Assigns each station/line an `open` year via LINE_OPEN.
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { stations, lines } = JSON.parse(readFileSync(resolve(root, "tools/v1-converted.json"), "utf8"));

const LINE_OPEN = { EAL:1910, KTL:1979, TWL:1982, ISL:1985, AEL:1998, TCL:1998, TKL:2002, DRL:2005, SIL:2016, TML:2021 };
const LINE_NAME_ZH = { EAL:"東鐵綫", KTL:"觀塘綫", TWL:"荃灣綫", ISL:"港島綫", AEL:"機場快綫", TCL:"東涌綫", TKL:"將軍澳綫", DRL:"迪士尼綫", SIL:"南港島綫", TML:"屯馬綫" };
const LINE_NAME_EN = { EAL:"East Rail Line", KTL:"Kwun Tong Line", TWL:"Tsuen Wan Line", ISL:"Island Line", AEL:"Airport Express", TCL:"Tung Chung Line", TKL:"Tseung Kwan O Line", DRL:"Disneyland Resort Line", SIL:"South Island Line", TML:"Tuen Ma Line" };

const esc = s => s.replace(/"/g,'\\"');
const pts = stations.map(s => {
  const open = Math.min(...s.r.map(r => LINE_OPEN[r]));
  return `    { name_zh:"${esc(s.zh)}", name_en:"${esc(s.n)}", lng:${s.lng}, lat:${s.lat}, open:${open} },  // ${s.r.join("+")}`;
}).join("\n");

const linesOut = [];
for (const l of lines) {
  l.shapes.forEach((path, i) => {
    const branch = l.shapes.length > 1 ? (i === 0 ? "" : ` (branch ${i+1})`) : "";
    const pathStr = path.map(([lng,lat]) => `[${lng},${lat}]`).join(",");
    linesOut.push(`    { name_zh:"${LINE_NAME_ZH[l.id]}${branch}", name_en:"${LINE_NAME_EN[l.id]}${branch}", color:"${l.color}",\n      fade:{in:${LINE_OPEN[l.id]},span:0.6},\n      path:[${pathStr}] },`);
  });
}

writeFileSync(resolve(root, "tools/points.js.frag"), `  const points = [\n${pts}\n  ];\n`);
writeFileSync(resolve(root, "tools/lines.js.frag"), `  const lines = [\n${linesOut.join("\n")}\n  ];\n`);
console.log("wrote tools/points.js.frag (" + stations.length + " stations), tools/lines.js.frag (" + linesOut.length + " line entries)");
