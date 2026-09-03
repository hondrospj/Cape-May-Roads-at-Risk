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

## Road profiles and zoom

- **Snap to roads** defaults on for drawing AND dragging any numbered point, including the initial/default or older saved freehand profiles. Click/tap near a blue centerline, add waypoints to choose the route, then finish. Profiles follow the shortest connected centerline geometry between waypoints, including bends. Turn snapping off for freehand drawing/dragging. Existing profiles are never moved merely by toggling the checkbox.
- Dragging a freehand endpoint snaps that endpoint independently; once all control points can connect, the whole profile follows the roads. Until then, status explicitly says the remaining line is freehand. A previously road-traced profile rejects disconnected or off-road moves and keeps the previous profile. Snapping uses a 22-screen-pixel tolerance capped at 50 meters (minimum 5 meters). The mouse/drag preview shows the target road and snap location. Blue roads stay visible at town zoom.
- Saved profiles and CSV/Shapefile exports preserve the traced geometry. Older saved freehand lines remain supported.
- Highlighting, snap targets and newly traced road routes are restricted to the actual Cape May City polygon in `cape_may_boundary.geojson`, not a rectangular extent. Cross-boundary roads are trimmed at every polygon intersection. Clicks and drags outside the city cannot snap, even within the normal snap tolerance. Routes cannot use roads outside the city as shortcuts. If the boundary cannot load, road snapping remains unavailable (no unfiltered fallback). Existing saved/freehand profiles are not deleted or silently rewritten.
- Use ordinary map +/−, scroll or pinch controls; all basemaps allow zoom through 21. Light/Dark overzoom their native level 16 tiles; Aerial/Relief/Streets use native tiles through 19. Overzoom does not increase source imagery or DEM resolution (5 feet).
- These are terrain profiles, **not safe-driving directions**, turn-restriction-aware routing, or surveyed pavement elevations. Review the highlighted route; centerline positional error, bridges and bare-earth DEM limitations still apply.

### Centerline provenance

`cape_may_road_centerlines.geojson`: NJ Office of GIS (NJOGIS) statewide NG911 Road Centerlines, downloaded 2026-09-03 from https://services2.arcgis.com/XVOqAjTOJ5P6ngMu/arcgis/rest/services/Tran_road/FeatureServer/0/query .

Source query: `where=1=1`, WGS84 intersection envelope `-74.941,38.926,-74.861,38.955`, output WGS84, fields `OBJECTID,PRIMENAME,ELEVTYP_F,ELEVTYP_T`, ordered by OBJECTID. All 748 source features verified against the service count (748); no transfer-limit truncation. This source file is retained for provenance, but is never used unfiltered for display or snapping. `municipal-roads.mjs` clips it to the municipal polygon before building both the overlay and routing graph (501 retained line pieces for the current data). Source endpoints connect only at matching coordinates and elevation levels; artificial clipping endpoints and arbitrary crossings do not create junctions. Bundled data removes reliance on a live GIS request at runtime.

Run geometry and city-boundary tests with `node --test tests/road-centerlines.test.mjs tests/municipal-roads.test.mjs`.

Browser regression: serve this repository at `http://127.0.0.1:8765/` (for example, `python3 -m http.server 8765 --bind 127.0.0.1`), then run `node tests/browser-snapping.mjs` with Playwright and Chrome installed. `PLAYWRIGHT_MODULE` may point to an existing Playwright module; `ROADRISK_TEST_URL` overrides the local URL. This tests actual mouse dragging of the default endpoint, actual drawing clicks and snap previews, curved paths, save/export, invalid moves, freehand mode, normal zoom, 280–1920px layouts, and explicit fallback when centerline data fails. External map/CDN access is required; the intentional 503 in the final failure test is expected.
