# Dhaka Village Census Map

A static MapLibre/Mapbox web map, deployed for free on GitHub Pages.
Geometry and census data are kept as **two separate files** and joined
**in the browser** via `setFeatureState` — no server, no database, no
build step needed at deploy time.

## Project layout

```
dhaka-web-map/
├── dhaka_villages.geojson      # your existing combined file (kept local, gitignored)
├── scripts/
│   ├── build_web_data.py       # splits the combined file into the two lean outputs below
│   └── requirements.txt
└── docs/                       # <- this is what GitHub Pages serves
    ├── index.html
    ├── style.css
    ├── app.js
    └── data/
        ├── villages_geom.geojson   # geometry + labels only (~3 MB)
        └── villages_data.csv       # all census numbers, keyed by `key` (~440 KB)
```

## Step 1 — Generate the two web files from your existing data

Drop your already-combined `dhaka_villages.geojson` (the one with both the
GPKG and CSV census columns already joined) in the project root, then:

```bash
cd dhaka-web-map/scripts
pip install -r requirements.txt
python build_web_data.py
```

This writes `docs/data/villages_geom.geojson` (lean geometry) and
`docs/data/villages_data.csv` (all the numbers), and prints a validation
report confirming every geometry key has a matching data row.

**Why split them at all?** So you can push a corrected or updated census
CSV later without re-shipping the (much heavier) geometry file, and so the
map loads faster — the browser only needs the small geometry file up
front, then joins in the numbers.

## Step 2 — Test locally

Browsers block `fetch()` of local files opened directly (`file://`), so
serve the `docs/` folder over HTTP:

```bash
cd docs
python -m http.server 8000
```

Open **http://localhost:8000** — you should see the choropleth map, a
metric dropdown, and a "3D extrusion" toggle.

## Step 3 — Push to GitHub

```bash
cd dhaka-web-map
git init
git add .
git commit -m "Initial commit: Dhaka village census map"
git branch -M main
git remote add origin https://github.com/<your-username>/dhaka-web-map.git
git push -u origin main
```

## Step 4 — Turn on GitHub Pages

1. On GitHub: repo → **Settings → Pages**.
2. Under "Build and deployment" → Source: **Deploy from a branch**.
3. Branch: **main**, folder: **/docs**. Save.
4. Wait ~1 minute — your map is live at
   `https://<your-username>.github.io/dhaka-web-map/`.

## Switching from MapLibre to Mapbox

Both `index.html` and `app.js` have the swap points marked
`MAPBOX SWAP`. In short:
1. In `index.html`, use the Mapbox GL JS `<script>`/`<link>` tags instead
   of the MapLibre ones (both are commented in, ready to uncomment).
2. In `app.js`, change `new maplibregl.Map(...)` to `new mapboxgl.Map(...)`
   and set `mapboxgl.accessToken = "pk.your_token_here"`.
3. Change `BASEMAP_STYLE` to a Mapbox style URL, e.g.
   `"mapbox://styles/mapbox/light-v11"`.

Everything else — the `setFeatureState` join, the layers, the popups —
is identical, since Mapbox GL JS and MapLibre GL JS share the same API.

## Updating the census numbers later

Only `docs/data/villages_data.csv` needs to change. Edit it (or
regenerate it from a new source file via the build script), commit, and
push — the geometry file and all the JS/HTML stay untouched.
