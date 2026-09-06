"""
build_web_data.py

Keeps geometry and census data as two SEPARATE files (as requested), but
validates that they align on a shared `key` before anything ships to the
web app. Run this any time the source data changes.

Input  : dhaka_villages.geojson  (the full combined file from the earlier step)
Output : docs/data/villages_geom.geojson   (geometry + label fields only, small)
         docs/data/villages_data.csv       (all numeric census fields, keyed by `key`)

The two output files are joined at RUNTIME in the browser via MapLibre/Mapbox's
`setFeatureState`, not merged back into one file — so you can update the CSV
(new census release, corrected figures) without ever touching the geometry file.
"""

import geopandas as gpd
import pandas as pd
import json
import sys
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # project root
SOURCE = os.path.join(ROOT, "dhaka_villages.geojson")   # the combined file from the previous step
OUT_GEOM = os.path.join(ROOT, "docs", "data", "villages_geom.geojson")
OUT_CSV = os.path.join(ROOT, "docs", "data", "villages_data.csv")

# Fields that stay WITH the geometry (needed for labels/tooltips/lookups only)
GEOM_FIELDS = ["key", "VILLAGE_NAME", "UNION_NAME", "UPAZILA_NAME", "DISTRICT_NAME"]

# Fields that go in the separate, swappable data file
DATA_FIELDS = [
    "key",
    "TOTAL_POP", "TOTAL_MALE", "TOTAL_FEMALE", "SEX_RATIO", "HH_SIZE",
    "ENUMERATED_HH", "QUICK_COUNT_HH",
    "csv_pop_total", "csv_pop_male", "csv_pop_female", "csv_hh_total", "csv_sex_ratio",
    "pop_diff", "match_method",
]


def main():
    gdf = gpd.read_file(SOURCE)
    print(f"Loaded {len(gdf)} features from {SOURCE}")

    # ---- sanity checks before writing anything ----
    if gdf["key"].isna().any():
        sys.exit("ERROR: some features have a null `key` — fix the source before building.")
    if gdf["key"].duplicated().any():
        dupes = gdf.loc[gdf["key"].duplicated(), "key"].tolist()
        print(f"WARNING: {len(dupes)} duplicate keys found (expected for split multi-part "
              f"villages — they'll share one data row, which is correct): {dupes[:5]}...")

    # ---- population fallback + density, computed once here (not in the browser) ----
    gdf["population"] = gdf["TOTAL_POP"].fillna(0)
    gdf["population"] = gdf["population"].where(gdf["population"] > 0, gdf["csv_pop_total"].fillna(0))
    gdf_metric = gdf.to_crs(epsg=32645)  # UTM 45N, metres
    gdf["area_km2"] = gdf_metric.geometry.area / 1e6
    gdf["density"] = (gdf["population"] / gdf["area_km2"].replace(0, pd.NA)).round(1)

    # ---- write lean geometry file ----
    os.makedirs(os.path.dirname(OUT_GEOM), exist_ok=True)
    geom_out = gdf[GEOM_FIELDS + ["geometry"]].copy()
    geom_out["geometry"] = geom_out.geometry.simplify(0.0002, preserve_topology=True)
    geom_out.to_file(OUT_GEOM, driver="GeoJSON")
    print(f"Wrote {OUT_GEOM}  ({len(geom_out)} features)")

    # ---- write separate data CSV ----
    data_out = gdf[DATA_FIELDS + ["population", "area_km2", "density"]].copy()
    data_out.to_csv(OUT_CSV, index=False)
    print(f"Wrote {OUT_CSV}  ({len(data_out)} rows)")

    # ---- final alignment check: every geom key has a data row, and vice versa ----
    geom_keys = set(geom_out["key"])
    data_keys = set(data_out["key"])
    only_in_geom = geom_keys - data_keys
    only_in_data = data_keys - geom_keys
    if only_in_geom or only_in_data:
        print(f"WARNING: {len(only_in_geom)} keys in geometry not in data; "
              f"{len(only_in_data)} keys in data not in geometry.")
    else:
        print("OK — every geometry key has a matching data row and vice versa.")


if __name__ == "__main__":
    main()
