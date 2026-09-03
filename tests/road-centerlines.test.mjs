import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildRoadNetwork} from '../road-centerlines.mjs';
const line = (coordinates,properties={}) => ({type:'Feature',properties,geometry:{type:'LineString',coordinates}});
const network = (...features) => buildRoadNetwork({type:'FeatureCollection',features});
const near = (a,b) => assert.ok(Math.abs(a-b)<1e-8, `${a} != ${b}`);

test('snap projects onto segment; tolerance rejects distant clicks', () => {
  const n=network(line([[0,0],[.002,0]]));
  const p=n.nearest([.001,.0001],15);
  near(p.coordinate[0],.001); near(p.coordinate[1],0);
  assert.equal(n.nearest([.001,.001],25),null);
  near(n.nearest([-.00001,0]).coordinate[0],0);
});
test('route follows bends, junctions, reverse direction and control distances', () => {
  const n=network(line([[0,0],[.001,0],[.001,.001]]),line([[.001,.001],[.002,.001]]));
  const r=n.route([[.0005,0],[.001,.0005],[.0015,.001]],1);
  assert.equal(r.coordinates.length,5);
  assert.deepEqual(r.waypointIndices,[0,2,4]);
  assert.ok(r.lengthM>220 && r.lengthM<223);
  near(n.route([[.0015,.001],[.0005,0]],1).lengthM,r.lengthM);
  near(n.route([[.0008,0],[.0002,0]],1).lengthM,66.71704814011974);
});
test('disconnected lines and bridges do not create false junctions', () => {
  const n=network(line([[0,0],[.002,0]]),line([[.001,-.001],[.001,.001]]));
  assert.equal(n.route([[0,0],[.001,.001]],1),null);
  const bridge=network(line([[0,0],[.001,0]],{ELEVTYP_T:1}),line([[.001,0],[.002,0]],{ELEVTYP_F:0}));
  assert.equal(bridge.route([[0,0],[.002,0]],1),null);
});
test('duplicates are deduplicated and MultiLineStrings supported', () => {
  const n=buildRoadNetwork({features:[{geometry:{type:'MultiLineString',coordinates:[[[0,0],[.001,0]]]}}]});
  assert.equal(n.route([[0,0],[0,0]],1).coordinates.length,1);
  assert.equal(n.route([[0,0],[.001,0]],1).coordinates.length,2);
});
test('bundled dataset is complete and routable along real source curves', () => {
  const data=JSON.parse(readFileSync(new URL('../cape_may_road_centerlines.geojson',import.meta.url)));
  assert.equal(data.features.length,748);
  const n=buildRoadNetwork(data);
  assert.ok(n.segmentCount>748);
  const crossTown=n.route([[-74.921,38.934],[-74.915,38.938]],100);
  assert.ok(crossTown && crossTown.coordinates.length>10 && crossTown.lengthM>700);
  for(const feature of data.features.filter(f=>f.geometry.coordinates.length>4).slice(0,30)){
    const coords=feature.geometry.coordinates;
    // Closed loops need an intermediate waypoint to select a nonzero route.
    const end = coords[0].every((v,i)=>v===coords.at(-1)[i]) ? coords[Math.floor(coords.length/2)] : coords.at(-1);
    const r=n.route([coords[0],end],.05);
    assert.ok(r && r.coordinates.length>=2);
    assert.ok(r.lengthM>0);
  }
});
