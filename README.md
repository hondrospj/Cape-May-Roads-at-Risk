# Cape May Roads at Risk

Static GitHub Pages app for drawing road and cross-section profiles through the Cape May municipal DEM.

The interface follows the North Wildwood Roads at Risk reference: threshold presets, NAVD88/MLLW conversion, terrain and hillshade views, saved multi-line cross sections, flood-history and future-frequency charts, and CSV/Shapefile exports.

Municipal constants:

- Observations: USGS 01411390, Cape May Harbor
- PETSS / NOAA station: 8535901
- NAVD88 thresholds: 3.43 ft minor, 4.43 ft moderate, 5.43 ft major
- MLLW thresholds: 6.2 ft minor, 7.2 ft moderate, 8.2 ft major
- MLLW = NAVD88 + 2.77 ft

Terrain source: USGS 3DEP Bare Earth DEM Dynamic ImageServer, clipped to the Cape May boundary at 5-foot resolution.
