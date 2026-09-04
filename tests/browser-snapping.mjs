// Run against a local server for this repository; see README.
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
import {fileURLToPath} from 'node:url';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const repo=fileURLToPath(new URL('../',import.meta.url));
const baseURL=process.env.ROADRISK_TEST_URL || 'http://127.0.0.1:8765/';
const browser=await chromium.launch({headless:true,channel:'chrome'});
try{
const page=await browser.newPage({viewport:{width:1440,height:1000}});
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error') console.log('CONSOLE',m.text().slice(0,180));});
await page.route(baseURL,route=>{
 const html=fs.readFileSync(repo+'/index.html','utf8').replace('    loadSavedLines();','    window.__rr={state,map,basemaps,drawSection,setDrawMode,finishPendingLine,saveCurrentLine,useSavedLine,exportLineRecords,setBasemap};\n    loadSavedLines();');
 return route.fulfill({contentType:'text/html',body:html});
});
await page.goto(baseURL);
await page.waitForFunction(()=>window.__rr?.state.raster && window.__rr.state.roadNetwork,{},{timeout:90000});
console.log('LOADED',await page.evaluate(()=>({profile:__rr.state.profile.length,segments:__rr.state.roadNetwork.segmentCount})));
const boundaryChecks=await page.evaluate(async()=>{
 const {state,map,setDrawMode}=__rr;
 const {municipalRoads}=await import('./municipal-roads.mjs');
 const boundary=await (await fetch('cape_may_boundary.geojson')).json();
 const raw=await (await fetch('cape_may_road_centerlines.geojson')).json();
 const {contains}=municipalRoads(raw,boundary);
 // Preserve actual rendered coordinates; Leaflet's default six-decimal
 // export rounding can move an exact boundary intersection centimeters out.
 const visible=state.roadLayer.toGeoJSON(false);
 const guide=state.roadLayer.getLayers()[0];
 if(guide.options.color!=='#f59e0b' || guide.options.dashArray!=='4 5') throw new Error('snap guides must be dashed orange');
 if(state.line.options.color!=='#22d3ee') throw new Error('default profile must stay blue');
 if(visible.features.some(f=>f.geometry.coordinates.some(p=>!contains(p)))) throw new Error('outside road still highlighted');
 const outside=raw.features.flatMap(f=>f.geometry.coordinates).find(p=>!contains(p));
 if(state.roadNetwork.nearest(outside,1000)) throw new Error('outside snapping target remains');
 setDrawMode(true);
 map.fire('click',{latlng:L.latLng(outside[1],outside[0])});
 if(state.pendingPoints.length) throw new Error('outside click accepted');
 map.fire('mousemove',{latlng:L.latLng(outside[1],outside[0])});
 if(state.snapPreview) throw new Error('outside snap preview shown');
 setDrawMode(false);
 return {displayedRoads:visible.features.length,outsideClickRejected:true};
});
console.log('PASS municipal boundary',boundaryChecks);
if(process.env.ROADRISK_SCREENSHOT) await page.screenshot({path:process.env.ROADRISK_SCREENSHOT});
assert.equal(await page.locator('#blockViewBtn').count(),0);
const drag=await page.evaluate(()=>{
 const {state,map}=__rr;const m=state.markers[0];
 map.setView(m.getLatLng(),17,{animate:false});map.panBy([300,0],{animate:false});
 const near=state.roadNetwork.nearest([m.getLatLng().lng,m.getLatLng().lat],100);
 const start=map.latLngToContainerPoint(m.getLatLng());
 const end=map.latLngToContainerPoint(L.latLng(near.coordinate[1]+.00012,near.coordinate[0]));
 return {start,end};
});
await page.mouse.move(drag.start.x,drag.start.y);await page.mouse.down();
await page.mouse.move(drag.end.x,drag.end.y,{steps:12});await page.mouse.up();
await page.waitForTimeout(300);
assert.ok(await page.evaluate(()=>{
 const m=__rr.state.markers[0].getLatLng();return __rr.state.roadNetwork.nearest([m.lng,m.lat],100).distanceM<.01;
}),'real mouse drag of default endpoint must snap');
console.log('PASS real mouse drag of default endpoint');
const taps=await page.evaluate(async()=>{
 const {state,map}=__rr;
 const data=await (await fetch('cape_may_road_centerlines.geojson')).json();
 const coords=data.features.find(f=>f.properties.PRIMENAME==='Beach Avenue' && f.geometry.coordinates.length>5 && f.geometry.coordinates[0][0]<-74.911).geometry.coordinates;
 const a=coords[1],b=coords.at(-2);
 map.setView([(a[1]+b[1])/2,(a[0]+b[0])/2],19,{animate:false});map.panBy([300,0],{animate:false});
 return [a,b].map(c=>map.latLngToContainerPoint(L.latLng(c[1]+.00002,c[0])));
});
await page.locator('#drawBtn').click();
await page.mouse.move(taps[0].x,taps[0].y);
assert.ok(await page.evaluate(()=>!!__rr.state.snapPreview),'snap preview must show for real mouse');
assert.equal(await page.evaluate(()=>__rr.state.snapPreview.options.fillColor),'#f59e0b');
await page.mouse.click(taps[0].x,taps[0].y);
await page.mouse.click(taps[1].x,taps[1].y);
await page.locator('#finishDrawBtn').click();
assert.ok(await page.evaluate(()=>__rr.state.activeRoadSnapped&&__rr.state.markers.length===2&&__rr.state.line.getLatLngs().length>2));
console.log('PASS real clicks, snap preview, curved-road finish');
const result=await page.evaluate(async()=>{
 const {state,map,setDrawMode,finishPendingLine,saveCurrentLine,useSavedLine,exportLineRecords,setBasemap}=__rr;
 for(const name of Object.keys(__rr.basemaps)){setBasemap(name);map.setZoom(21,{animate:false}); if(map.getZoom()!==21) throw new Error('zoom '+name);}
 setBasemap('osm');map.setView([38.9365,-74.920],19,{animate:false});
 const data=await (await fetch('cape_may_road_centerlines.geojson')).json();
 const f=data.features.find(f=>f.properties.PRIMENAME==='Beach Avenue' && f.geometry.coordinates.length>5 && f.geometry.coordinates[0][0]<-74.911);
 if(!f) throw new Error('fixture missing');
 const coords=f.geometry.coordinates;
 setDrawMode(true);
 for(const p of [coords[1],coords.at(-2)]) map.fire('click',{latlng:L.latLng(p[1]+.000004,p[0])});
 if(state.pendingPoints.length!==2) throw new Error('snap rejected');
 const pendingCount=state.pendingRoadRoute.path.length;
 finishPendingLine();
 if(!state.activeRoadSnapped || state.line.getLatLngs().length<3) throw new Error('no curved path');
 const pathBefore=JSON.stringify(state.line.getLatLngs());
 const m=state.markers[0];m.fire('dragstart');m.setLatLng([39,-75]);m.fire('dragend');
 if(JSON.stringify(state.line.getLatLngs())!==pathBefore)throw new Error('invalid drag altered path');
 m.fire('dragstart');m.setLatLng([coords[2][1],coords[2][0]]);m.fire('dragend');
 if(JSON.stringify(state.line.getLatLngs())===pathBefore)throw new Error('valid drag did not reroute');
 const savedPath=JSON.stringify(state.line.getLatLngs());
 saveCurrentLine();const id=state.savedLines[0].id;
 useSavedLine(id);
 if(JSON.stringify(state.line.getLatLngs())!==savedPath || state.markers.length!==2)throw new Error('save/load lost route');
 const exported=exportLineRecords().find(r=>r.id.startsWith('drawn-'));
 if(exported.points.length!==state.line.getLatLngs().length)throw new Error('export straightened route');
 document.getElementById('snapRoads').checked=false;
 setDrawMode(true);map.fire('click',{latlng:L.latLng(38.938,-74.916)});map.fire('click',{latlng:L.latLng(38.939,-74.915)});finishPendingLine();
 if(state.activeRoadSnapped || state.line.getLatLngs().length!==2)throw new Error('freehand failed');
 if(state.comparisonSections.at(-1).controlPoints.length!==2)throw new Error('comparison control points');
 useSavedLine(id);map.fitBounds(state.line.getBounds().pad(.6),{maxZoom:19,animate:false});
 return {pendingCount,savedVertices:state.line.getLatLngs().length,profile:state.profile.length,markers:state.markers.length};
});
console.log('PASS',result);
await page.setViewportSize({width:390,height:844});await page.waitForTimeout(600);
console.log('MOBILE',await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,control:document.querySelector('.mapControl').getBoundingClientRect().toJSON()})));
await page.locator('#snapRoads').check();
await page.evaluate(()=>{__rr.map.setZoom(19,{animate:false});});
await page.waitForTimeout(500);
assert.equal(await page.evaluate(()=>__rr.map.getZoom()),19);
for(const width of [280,768,1180,1181,1280,1920]){
 await page.setViewportSize({width,height:900});await page.waitForTimeout(100);
 const layout=await page.evaluate(()=>{
   const c=document.querySelector('.mapControl').getBoundingClientRect(),r=document.querySelector('.rightStack').getBoundingClientRect();
   return {overflow:document.documentElement.scrollWidth>innerWidth,overlap:innerWidth>1180 && c.bottom>r.top};
 });
 assert.equal(layout.overflow,false,'overflow at '+width);assert.equal(layout.overlap,false,'overlap at '+width);
}
await page.route('**/cape_may_road_centerlines.geojson',route=>route.fulfill({status:503,body:'unavailable'}));
await page.reload();
await page.waitForFunction(()=>window.__rr && document.querySelector('#roadStatus').textContent.includes('unavailable'));
await page.evaluate(()=>__rr.setDrawMode(true));
assert.equal(await page.evaluate(()=>__rr.state.drawMode),false);
await page.locator('#snapRoads').uncheck();
await page.evaluate(()=>__rr.setDrawMode(true));
assert.equal(await page.evaluate(()=>__rr.state.drawMode),true);
console.log('PASS responsive 280–1920px; missing centerlines safely require explicit freehand');
await page.unroute('**/cape_may_road_centerlines.geojson');
await page.route('**/cape_may_boundary.geojson',route=>route.fulfill({status:503,body:'unavailable'}));
await page.reload();
await page.waitForFunction(()=>window.__rr && document.querySelector('#roadStatus').textContent.includes('unavailable'));
assert.equal(await page.evaluate(()=>__rr.state.roadNetwork),null);
assert.equal(await page.evaluate(()=>__rr.state.roadLayer),null);
console.log('PASS missing boundary fails closed: no unfiltered road layer or network');
assert.deepEqual(errors,[]);
}finally{
 await browser.close();
}
