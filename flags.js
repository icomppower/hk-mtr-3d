/* =====================================================================
 *  flags.js — HK MTR: Narrated Terrain Layer · neutral plain-colour swatches.
 *
 *  Neutral-documentary posture: no emblems. Each line flies a flat swatch
 *  matching its official MTR line colour (and the two cross-linked history
 *  layers get their own muted swatches). Same contract as poly2019/kyiv2022
 *  flags.js: export flagTexture(unit) keyed by unit.flag.
 * ===================================================================== */
const W = 230, H = 150;
const SWATCH = {
  eal: "#53B7E8", ktl: "#00AB4E", twl: "#ED1D24", isl: "#007DC5",
  tkl: "#7D499D", ael: "#00888A", tcl: "#F7943E", tml: "#923011",
  sil: "#B6BD00", drl: "#F173AC",
  hist1941: "#8a7a5c",   // muted sepia — 1941 cross-link layer
  hist2019: "#6b6f76",   // muted steel — 2019 cross-link layer
};

const flagTexCache = {};
export function flagTexture(unit) {
  if (flagTexCache[unit.id]) return flagTexCache[unit.id];
  const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
  const c = cv.getContext("2d");
  const fill = SWATCH[unit.flag];
  if (!fill) console.warn(`unknown flag "${unit.flag}" for ${unit.id}`);
  c.fillStyle = fill || SWATCH.ktl; c.fillRect(0, 0, W, H);
  const sh = c.createLinearGradient(0, 0, W * 0.18, 0);
  sh.addColorStop(0, "rgba(0,0,0,0.28)"); sh.addColorStop(1, "rgba(0,0,0,0)");
  c.fillStyle = sh; c.fillRect(0, 0, W * 0.18, H);
  c.strokeStyle = "rgba(0,0,0,0.42)"; c.lineWidth = 3; c.strokeRect(1.5, 1.5, W - 3, H - 3);
  const tex = new THREE.CanvasTexture(cv); tex.anisotropy = 4; tex.needsUpdate = true;
  flagTexCache[unit.id] = tex; return tex;
}
