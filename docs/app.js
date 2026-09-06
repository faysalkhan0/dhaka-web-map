/* app.js
 * Loads TWO separate files — villages_geom.geojson and villages_data.csv —
 * and joins them in the browser using MapLibre's setFeatureState, instead of
 * baking the census numbers into the geometry file. This means the CSV can
 * be swapped for an updated census release without ever re-shipping geometry.
 *
 * Swapping to Mapbox GL JS instead of MapLibre: see the two commented lines
 * marked "MAPBOX SWAP" below — the API is close to identical.
 */

// ---- config ----
const GEOM_URL = "data/villages_geom.geojson";
const DATA_URL = "data/villages_data.csv";

// Free MapLibre-hosted vector style, no token needed.
// MAPBOX SWAP: replace with 'mapbox://styles/mapbox/light-v11' and set
//   maplibregl.accessToken -> mapboxgl.accessToken = 'pk.your_token_here'
const BASEMAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";

const map = new maplibregl.Map({
  container: "map",
  style: BASEMAP_STYLE,
  center: [90.30, 23.80],
  zoom: 9,
  pitch: 0,
});
// MAPBOX SWAP: const map = new mapboxgl.Map({ ...same options... });

map.addControl(new maplibregl.NavigationControl(), "top-right");

// ---- tiny CSV parser (no dependency needed for this simple, quote-free file) ----
function parseCSV(text) {
  const lines = text.trim().split("\n");
  const headers = lines[0].split(",");
  return lines.slice(1).map((line) => {
    const cells = line.split(",");
    const row = {};
    headers.forEach((h, i) => (row[h] = cells[i]));
    return row;
  });
}

let currentMetric = "population";

const METRIC_CONFIG = {
  population: { label: "Population", stops: [0, 500, 2000, 5000, 15000, 40000] },
  density: { label: "Density (people/km²)", stops: [0, 1000, 5000, 15000, 30000, 60000] },
  TOTAL_MALE: { label: "Male population", stops: [0, 250, 1000, 2500, 7500, 20000] },
  csv_hh_total: { label: "Households (CSV)", stops: [0, 100, 400, 1000, 3000, 8000] },
};

const COLOR_RAMP = ["#ffffb2", "#fed976", "#feb24c", "#fd8d3c", "#f03b20", "#bd0026"];

function buildColorExpression(metric) {
  const stops = METRIC_CONFIG[metric].stops;
  const expr = ["interpolate", ["linear"], ["coalesce", ["feature-state", metric], 0]];
  stops.forEach((stop, i) => {
    expr.push(stop, COLOR_RAMP[i]);
  });
  return expr;
}

map.on("load", async () => {
  // 1. Add the LEAN geometry-only source
  map.addSource("villages", {
    type: "geojson",
    data: GEOM_URL,
    promoteId: "key", // use the `key` property as each feature's id, for setFeatureState
  });

  // 2D choropleth fill
  map.addLayer({
    id: "villages-fill",
    type: "fill",
    source: "villages",
    paint: {
      "fill-color": buildColorExpression(currentMetric),
      "fill-opacity": 0.75,
    },
  });

  // Optional 3D extrusion layer (toggled on/off, matches height to the metric)
  map.addLayer({
    id: "villages-extrude",
    type: "fill-extrusion",
    source: "villages",
    layout: { visibility: "none" },
    paint: {
      "fill-extrusion-color": buildColorExpression(currentMetric),
      "fill-extrusion-height": [
        "*",
        ["coalesce", ["feature-state", currentMetric], 0],
        0.02, // scale factor — tune per metric
      ],
      "fill-extrusion-opacity": 0.85,
    },
  });

  map.addLayer({
    id: "villages-outline",
    type: "line",
    source: "villages",
    paint: { "line-color": "#555", "line-width": 0.4 },
  });

  // 2. Fetch the SEPARATE data CSV and join it via feature-state
  const csvText = await fetch(DATA_URL).then((r) => r.text());
  const rows = parseCSV(csvText);

  rows.forEach((row) => {
    map.setFeatureState(
      { source: "villages", id: row.key },
      {
        population: +row.population || 0,
        density: +row.density || 0,
        TOTAL_MALE: +row.TOTAL_MALE || 0,
        csv_hh_total: +row.csv_hh_total || 0,
        match_method: row.match_method,
      }
    );
  });

  console.log(`Joined ${rows.length} data rows onto the geometry via setFeatureState.`);

  // ---- hover tooltip ----
  const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false });

  map.on("mousemove", "villages-fill", (e) => {
    map.getCanvas().style.cursor = "pointer";
    const f = e.features[0];
    const state = map.getFeatureState({ source: "villages", id: f.properties.key });
    popup
      .setLngLat(e.lngLat)
      .setHTML(
        `<b>${f.properties.VILLAGE_NAME}</b><br/>
         ${f.properties.UPAZILA_NAME} &middot; ${f.properties.UNION_NAME}<br/>
         Population: ${(state.population || 0).toLocaleString()}<br/>
         Density: ${(state.density || 0).toLocaleString()} /km²`
      )
      .addTo(map);
  });

  map.on("mouseleave", "villages-fill", () => {
    map.getCanvas().style.cursor = "";
    popup.remove();
  });
});

// ---- UI controls ----
document.getElementById("metric-select").addEventListener("change", (e) => {
  currentMetric = e.target.value;
  const expr = buildColorExpression(currentMetric);
  map.setPaintProperty("villages-fill", "fill-color", expr);
  map.setPaintProperty("villages-extrude", "fill-extrusion-color", expr);
  map.setPaintProperty("villages-extrude", "fill-extrusion-height", [
    "*",
    ["coalesce", ["feature-state", currentMetric], 0],
    0.02,
  ]);
});

document.getElementById("mode-toggle").addEventListener("change", (e) => {
  const is3D = e.target.checked;
  map.setLayoutProperty("villages-fill", "visibility", is3D ? "none" : "visible");
  map.setLayoutProperty("villages-extrude", "visibility", is3D ? "visible" : "none");
  map.easeTo({ pitch: is3D ? 45 : 0, duration: 500 });
});
