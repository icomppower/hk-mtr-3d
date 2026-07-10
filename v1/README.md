# HK MTR 3D — 港鐵立體路網

Interactive 3D map of the Hong Kong MTR network in a single HTML file (Three.js, no build). Real track geometry from OpenStreetMap (true tunnel/viaduct depth), all 97 stations from official MTR open data, animated trains.

**Live:** https://icomppower.github.io/hk-mtr-3d

Sister project: [NYC Subway 3D](https://github.com/icomppower/nyc-subway-3d)

Rebuild data: `node process-hk.mjs` (needs Overpass extracts + `hk.geojson`, see script header), then inject `data.json` into `index.template.html` to produce `index.html`.
