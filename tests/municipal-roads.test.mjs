import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {municipalRoads} from '../municipal-roads.mjs';
import {buildRoadNetwork} from '../road-centerlines.mjs';
const polygon=coordinates=>({type:'Polygon',coordinates});
const square=[[0,0],[1,0],[1,1],[0,1],[0,0]];
const collection=(...lines)=>({type:'FeatureCollection',features:lines.map(coordinates=>({type:'Feature',properties:{},geometry:{type:'LineString',coordinates}}))});

test('keeps inside roads, removes outside roads, trims crossing roads exactly',()=>{
 const {roads,contains}=municipalRoads(collection([[.1,.1],[.9,.9]],[[-2,.5],[-1,.5]],[[-1,.5],[2,.5]]),polygon([square]));
 assert.equal(roads.features.length,2);
 assert.deepEqual(roads.features[1].geometry.coordinates,[[0,.5],[1,.5]]);
 assert.equal(contains([-.00001,.5]),false);
 const n=buildRoadNetwork(roads,{contains});
 assert.equal(n.nearest([-.00001,.5],50),null,'outside click must not snap even within tolerance');
 assert.ok(n.nearest([0,.5],1));
});
test('holes and concave boundaries split roads; no outside shortcut is routed',()=>{
 const hole=[[.4,.4],[.6,.4],[.6,.6],[.4,.6],[.4,.4]];
 const {roads,contains}=municipalRoads(collection([[.1,.5],[.9,.5]]),polygon([square,hole]));
 assert.equal(roads.features.length,2);
 assert.equal(contains([.5,.5]),false);
 assert.equal(buildRoadNetwork(roads,{contains}).route([[.1,.5],[.9,.5]],1),null);
 const concave=[[0,0],[1,0],[1,1],[.7,1],[.7,.3],[.3,.3],[.3,1],[0,1],[0,0]];
 const split=municipalRoads(collection([[.1,.8],[.9,.8]]),polygon([concave]));
 assert.equal(split.roads.features.length,2);
});
test('rounding along a municipal boundary remains snappable without admitting outside roads',()=>{
 const line=[[0.1,-1.75e-10],[0.9,0]];
 const {roads,contains}=municipalRoads(collection(line,[[.1,-1e-7],[.9,-1e-7]]),polygon([square]));
 assert.equal(roads.features.length,1);
 const point=[.3,-1.3125e-10];
 assert.equal(contains(point),true);
 assert.ok(buildRoadNetwork(roads,{contains}).nearest(point,1));
 assert.equal([[.5,.5],[.5,-.1]].every(contains),false,'array callback index must not change containment tolerance');
 assert.equal(contains([.5,-1e-7]),false);
});
test('boundary-aligned roads, tangency, disconnected multipolygons and empty boundary',()=>{
 const {roads}=municipalRoads(collection([[-1,0],[2,0]],[[-1,1],[0,1],[-1,2]]),polygon([square]));
 assert.deepEqual(roads.features.map(f=>f.geometry.coordinates),[[[0,0],[1,0]]]);
 const other=square.map(([x,y])=>[x+2,y]);
 const multi=municipalRoads(collection([[.5,.5],[2.5,.5]]),{type:'MultiPolygon',coordinates:[[square],[other]]});
 assert.equal(multi.roads.features.length,2);
 assert.equal(buildRoadNetwork(multi.roads,{contains:multi.contains}).route([[.5,.5],[2.5,.5]],1),null);
 assert.throws(()=>municipalRoads(collection([[0,0],[1,1]]),null),/boundary/);
});
test('actual Cape May overlay, snap targets and routes are contained by city polygon',()=>{
 const read=name=>JSON.parse(readFileSync(new URL('../'+name,import.meta.url)));
 const raw=read('cape_may_road_centerlines.geojson'),boundary=read('cape_may_boundary.geojson');
 const {roads,contains}=municipalRoads(raw,boundary);
 assert.ok(roads.features.length>200 && roads.features.length<raw.features.length);
 for(const feature of roads.features){
   const points=feature.geometry.coordinates;
   for(let i=1;i<points.length;i++){
     for(const t of [0,.25,.5,.75,1]){
       const p=points[i-1].map((v,j)=>v+(points[i][j]-v)*t);
       assert.ok(contains(p),`outside road segment ${feature.id}: ${p}`);
     }
   }
 }
 const n=buildRoadNetwork(roads,{contains});
 let rejected=0;
 for(const feature of raw.features){
   for(const p of feature.geometry.coordinates){
     if(!contains(p)){assert.equal(n.nearest(p,1000),null);rejected++;}
   }
 }
 assert.ok(rejected>100);
 const route=n.route([[-74.921,38.934],[-74.915,38.938]],100);
 assert.ok(route && route.coordinates.length>10);
 assert.ok(route.coordinates.every(contains));
 console.log(`City-only roads: ${roads.features.length}; outside source vertices rejected: ${rejected}`);
});
