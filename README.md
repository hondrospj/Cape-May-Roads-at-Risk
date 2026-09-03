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

## Road profiles and block views

- **Snap to roads** defaults on for new drawings. Click/tap near a centerline, add waypoints to choose the route, then finish. Profiles follow the shortest connected centerline geometry between waypoints, including bends. Turn snapping off for freehand cross sections. Existing/default profiles are not automatically moved.
- Dragging a snapped waypoint re-traces the road profile. Off-road or disconnected moves are rejected; the previous profile remains. Snapping uses an 18-screen-pixel tolerance capped at 25 meters (minimum 2 meters).
- Saved profiles and CSV/Shapefile exports preserve the traced geometry. Older saved freehand lines remain supported.
- **Block view** zooms the current map center to level 19; all basemaps allow zoom through 21. Light/Dark overzoom their native level 16 tiles; Aerial/Relief/Streets use native tiles through 19. Overzoom does not increase source imagery or DEM resolution (5 feet).
- These are terrain profiles, **not safe-driving directions**, turn-restriction-aware routing, or surveyed pavement elevations. Review the highlighted route; centerline positional error, bridges and bare-earth DEM limitations still apply.

### Centerline provenance

`cape_may_road_centerlines.geojson`: NJ Office of GIS (NJOGIS) statewide NG911 Road Centerlines, downloaded 2026-09-03 from https://services2.arcgis.com/XVOqAjTOJ5P6ngMu/arcgis/rest/services/Tran_road/FeatureServer/0/query .

Query: `where=1=1`, WGS84 intersection envelope `-74.941,38.926,-74.861,38.955`, output WGS84, fields `OBJECTID,PRIMENAME,ELEVTYP_F,ELEVTYP_T`, ordered by OBJECTID. All 748 returned features verified against the service count (748); no transfer-limit truncation. The buffer allows tracing roads crossing the municipal/DEM boundary; elevations outside the DEM remain unavailable. Source endpoints connect only at matching coordinates and elevation levels; arbitrary line crossings do not create junctions. Bundled data removes reliance on a live GIS request at runtime.

Run geometry tests with `node --test tests/road-centerlines.test.mjs`.
