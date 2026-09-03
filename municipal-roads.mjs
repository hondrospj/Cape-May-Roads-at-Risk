// Clip WGS84 road lines to the same polygon used for the city's red outline.
// Splitting at every boundary crossing prevents routes from leaving and
// re-entering the city, even when both original road endpoints are inside.
export function municipalRoads(collection, boundary){
  const polygons=[];
  function collect(value){
    if(value?.type==='FeatureCollection') value.features.forEach(collect);
    else if(value?.type==='Feature') collect(value.geometry);
    else if(value?.type==='Polygon') polygons.push(value.coordinates);
    else if(value?.type==='MultiPolygon') polygons.push(...value.coordinates);
  }
  collect(boundary);
  if(!polygons.length) throw new Error('Municipal boundary is missing');
  const epsilon=1e-10;
  const same=(a,b)=>Math.abs(a[0]-b[0])<epsilon && Math.abs(a[1]-b[1])<epsilon;
  const cross=(a,b)=>a[0]*b[1]-a[1]*b[0];
  const subtract=(a,b)=>[a[0]-b[0],a[1]-b[1]];
  function ringEdges(ring){
    return ring.map((a,i)=>[a,ring[(i+1)%ring.length]]).filter(([a,b])=>!same(a,b));
  }
  const polygonEdges=polygons.map(rings=>rings.map(ringEdges));
  const allEdges=polygonEdges.flat(2);
  function onEdge(p,a,b){
    const ab=subtract(b,a),ap=subtract(p,a);
    return Math.abs(cross(ab,ap))<=epsilon*Math.hypot(...ab)
      && p[0]>=Math.min(a[0],b[0])-epsilon && p[0]<=Math.max(a[0],b[0])+epsilon
      && p[1]>=Math.min(a[1],b[1])-epsilon && p[1]<=Math.max(a[1],b[1])+epsilon;
  }
  function inRing(p,edges){
    let inside=false;
    for(const [a,b] of edges){
      if((a[1]>p[1])!==(b[1]>p[1]) && p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0]) inside=!inside;
    }
    return inside;
  }
  function contains(p){
    if(!Array.isArray(p) || !p.every(Number.isFinite)) return false;
    return polygonEdges.some(rings=>{
      if(rings.some(edges=>edges.some(([a,b])=>onEdge(p,a,b)))) return true;
      return inRing(p,rings[0]) && !rings.slice(1).some(edges=>inRing(p,edges));
    });
  }
  function cuts(a,b){
    const ab=subtract(b,a),lengthSquared=ab[0]**2+ab[1]**2;
    const ts=[0,1];
    for(const [c,d] of allEdges){
      if(Math.max(a[0],b[0])+epsilon<Math.min(c[0],d[0]) || Math.min(a[0],b[0])-epsilon>Math.max(c[0],d[0])
        || Math.max(a[1],b[1])+epsilon<Math.min(c[1],d[1]) || Math.min(a[1],b[1])-epsilon>Math.max(c[1],d[1])) continue;
      const cd=subtract(d,c),ac=subtract(c,a),denom=cross(ab,cd);
      if(Math.abs(denom)>1e-20){
        const t=cross(ac,cd)/denom,u=cross(ac,ab)/denom;
        if(t>=0 && t<=1 && u>=-epsilon && u<=1+epsilon) ts.push(t);
      }else if(Math.abs(cross(ab,ac))<=epsilon*Math.sqrt(lengthSquared)){
        for(const p of [c,d]){
          const ap=subtract(p,a),t=(ap[0]*ab[0]+ap[1]*ab[1])/lengthSquared;
          if(t>0 && t<1) ts.push(t);
        }
      }
    }
    return ts.sort((x,y)=>x-y).filter((t,i,list)=>!i || t-list[i-1]>1e-12);
  }
  const features=[];
  for(const [featureIndex,feature] of collection.features.entries()){
    const g=feature.geometry;
    const parts=g?.type==='LineString'?[g.coordinates]:g?.type==='MultiLineString'?g.coordinates:[];
    for(const [partIndex,points] of parts.entries()){
      let piece=[],pieceIndex=0;
      function finish(){
        if(piece.length>=2){
          features.push({type:'Feature',id:`${featureIndex}:${partIndex}:${pieceIndex++}`,
            properties:{...feature.properties,
              CLIPPED_F:!same(piece[0],points[0]),CLIPPED_T:!same(piece.at(-1),points.at(-1))},
            geometry:{type:'LineString',coordinates:piece}});
        }
        piece=[];
      }
      for(let i=1;i<points.length;i++){
        const a=points[i-1],b=points[i];
        if(same(a,b)) continue;
        const at=t=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
        const ts=cuts(a,b);
        for(let j=1;j<ts.length;j++){
          const start=at(ts[j-1]),end=at(ts[j]);
          if(!contains(at((ts[j-1]+ts[j])/2))){finish();continue;}
          if(piece.length && !same(piece.at(-1),start)) finish();
          if(!piece.length) piece.push(start);
          if(!same(piece.at(-1),end)) piece.push(end);
        }
      }
      finish();
    }
  }
  return {roads:{type:'FeatureCollection',features},contains};
}
