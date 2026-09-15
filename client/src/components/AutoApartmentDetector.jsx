import React,{useEffect,useState} from 'react';
import {api,statusLabel} from '../api';

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

function morphDilate(src,w,h){
  const out=new Uint8Array(src.length);
  for(let y=0;y<h;y++){
    for(let x=0;x<w;x++){
      let hit=0;
      for(let yy=Math.max(0,y-1);yy<=Math.min(h-1,y+1)&&!hit;yy++){
        const row=yy*w;
        for(let xx=Math.max(0,x-1);xx<=Math.min(w-1,x+1);xx++){
          if(src[row+xx]){hit=1;break}
        }
      }
      out[y*w+x]=hit;
    }
  }
  return out;
}
function morphErode(src,w,h){
  const out=new Uint8Array(src.length);
  for(let y=0;y<h;y++){
    for(let x=0;x<w;x++){
      let ok=1;
      for(let yy=y-1;yy<=y+1&&ok;yy++){
        for(let xx=x-1;xx<=x+1;xx++){
          if(xx<0||yy<0||xx>=w||yy>=h||!src[yy*w+xx]){ok=0;break}
        }
      }
      out[y*w+x]=ok;
    }
  }
  return out;
}

function keepLongRuns(src,w,h,minRun){
  const out=new Uint8Array(src.length);

  // horizontal runs
  for(let y=0;y<h;y++){
    let x=0;
    while(x<w){
      while(x<w&&!src[y*w+x])x++;
      const start=x;
      while(x<w&&src[y*w+x])x++;
      const len=x-start;
      if(len>=minRun){
        for(let xx=start;xx<x;xx++)out[y*w+xx]=1;
      }
    }
  }

  // vertical runs
  for(let x=0;x<w;x++){
    let y=0;
    while(y<h){
      while(y<h&&!src[y*w+x])y++;
      const start=y;
      while(y<h&&src[y*w+x])y++;
      const len=y-start;
      if(len>=minRun){
        for(let yy=start;yy<y;yy++)out[yy*w+x]=1;
      }
    }
  }

  return out;
}

function bridgeAxisGaps(src,w,h,maxGap,minSupport){
  const out=src.slice();

  function bridgeLine(get,set,len){
    const runs=[];
    let i=0;
    while(i<len){
      while(i<len&&!get(i))i++;
      const start=i;
      while(i<len&&get(i))i++;
      if(i>start)runs.push([start,i-1]);
    }
    for(let r=0;r<runs.length-1;r++){
      const a=runs[r],b=runs[r+1];
      const gap=b[0]-a[1]-1;
      const lenA=a[1]-a[0]+1,lenB=b[1]-b[0]+1;
      if(gap>0&&gap<=maxGap&&lenA>=minSupport&&lenB>=minSupport){
        for(let k=a[1]+1;k<b[0];k++)set(k);
      }
    }
  }

  for(let y=0;y<h;y++){
    bridgeLine(
      i=>!!out[y*w+i],
      i=>{out[y*w+i]=1},
      w
    );
  }
  for(let x=0;x<w;x++){
    bridgeLine(
      i=>!!out[i*w+x],
      i=>{out[i*w+x]=1},
      h
    );
  }
  return out;
}

function buildStructuralWallMask(dark,w,h){
  const base=Math.min(w,h);
  const minRun=Math.max(10,Math.round(base*.022));
  const maxGap=Math.max(4,Math.round(base*.010));
  const minSupport=Math.max(5,Math.round(minRun*.45));

  // Keep long architectural strokes and suppress most furniture / text details.
  let structural=keepLongRuns(dark,w,h,minRun);

  // Doors and antialiasing interrupt walls; reconnect only small axial gaps.
  structural=bridgeAxisGaps(structural,w,h,maxGap,minSupport);

  // Close tiny holes and restore a realistic wall band around the detected axes.
  structural=morphDilate(structural,w,h);
  structural=morphErode(structural,w,h);
  structural=morphDilate(structural,w,h);

  return structural;
}

function components(mask,w,h,eight=true){
  const labels=new Int32Array(mask.length);
  const queue=new Int32Array(mask.length);
  const stats=[];
  let next=0;
  const dirs=eight
    ? [[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]]
    : [[0,-1],[-1,0],[1,0],[0,1]];

  for(let i=0;i<mask.length;i++){
    if(!mask[i]||labels[i])continue;
    next++;
    let head=0,tail=0;
    queue[tail++]=i;labels[i]=next;
    let area=0,sumX=0,sumY=0,minX=w,minY=h,maxX=0,maxY=0,touchesBorder=false;

    while(head<tail){
      const idx=queue[head++],y=Math.floor(idx/w),x=idx-y*w;
      area++;sumX+=x;sumY+=y;
      minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);
      if(x===0||y===0||x===w-1||y===h-1)touchesBorder=true;

      for(const [dx,dy] of dirs){
        const xx=x+dx,yy=y+dy;
        if(xx<0||yy<0||xx>=w||yy>=h)continue;
        const ni=yy*w+xx;
        if(mask[ni]&&!labels[ni]){
          labels[ni]=next;
          queue[tail++]=ni;
        }
      }
    }

    stats.push({
      id:next,area,cx:sumX/area,cy:sumY/area,minX,minY,maxX,maxY,
      width:maxX-minX+1,height:maxY-minY+1,touchesBorder
    });
  }
  return {labels,stats};
}

function candidatePool(stats,opaqueCount){
  const minArea=Math.max(60,opaqueCount*.0018);
  return stats
    .filter(s=>{
      if(s.area<minArea)return false;
      // The white background outside a floor plan is often one huge component.
      // Real apartment interiors should not touch the analysis canvas border.
      if(s.touchesBorder)return false;
      const aspect=Math.min(s.width,s.height)/Math.max(s.width,s.height);
      // Eliminate long balcony/terrace bands and thin shafts from automatic apartment candidates.
      if(aspect<.30 && s.area<opaqueCount*.04)return false;
      return true;
    })
    .sort((a,b)=>b.area-a.area)
    .slice(0,40);
}
function suggestedCount(stats,opaqueCount,expected){
  const usable=candidatePool(stats,opaqueCount);
  if(!usable.length)return {count:0,usable};
  if(Number(expected)>0)return {count:Math.min(Number(expected),usable.length),usable};

  // Apartments on a floor tend to form a clear area cluster. Small room fragments,
  // shafts and balconies fall well below that cluster.
  const cutoff=usable[0].area*.28;
  let count=usable.filter(s=>s.area>=cutoff).length;
  count=clamp(count,1,Math.min(30,usable.length));
  return {count,usable};
}
function key(x,y){return `${x},${y}`}
function polygonArea(points){
  let a=0;
  for(let i=0,j=points.length-1;i<points.length;j=i++){
    a+=(points[j][0]*points[i][1]-points[i][0]*points[j][1]);
  }
  return a/2;
}
function pointLineDistance(p,a,b){
  const [px,py]=p,[ax,ay]=a,[bx,by]=b;
  const dx=bx-ax,dy=by-ay;
  if(dx===0&&dy===0)return Math.hypot(px-ax,py-ay);
  const t=clamp(((px-ax)*dx+(py-ay)*dy)/(dx*dx+dy*dy),0,1);
  return Math.hypot(px-(ax+t*dx),py-(ay+t*dy));
}
function rdp(points,eps){
  if(points.length<3)return points;
  let maxD=0,index=0;
  const first=points[0],last=points[points.length-1];
  for(let i=1;i<points.length-1;i++){
    const d=pointLineDistance(points[i],first,last);
    if(d>maxD){maxD=d;index=i}
  }
  if(maxD>eps){
    const left=rdp(points.slice(0,index+1),eps);
    const right=rdp(points.slice(index),eps);
    return left.slice(0,-1).concat(right);
  }
  return [first,last];
}
function simplifyClosed(loop,eps=2.2){
  if(loop.length<5)return loop;
  let pts=loop.slice();
  if(pts.length>1&&pts[0][0]===pts[pts.length-1][0]&&pts[0][1]===pts[pts.length-1][1])pts.pop();

  // rotate at a strong corner, then treat as an open polyline with duplicated start
  let corner=0,best=0;
  for(let i=0;i<pts.length;i++){
    const p=pts[(i-1+pts.length)%pts.length],c=pts[i],n=pts[(i+1)%pts.length];
    const cross=Math.abs((c[0]-p[0])*(n[1]-c[1])-(c[1]-p[1])*(n[0]-c[0]));
    if(cross>best){best=cross;corner=i}
  }
  pts=pts.slice(corner).concat(pts.slice(0,corner));
  const open=pts.concat([pts[0]]);
  let out=rdp(open,eps);
  if(out.length>1)out.pop();

  // snap near-axis segments to exact horizontal/vertical and remove duplicates
  const axisTol=3.2;
  for(let i=1;i<out.length;i++){
    const prev=out[i-1],cur=out[i];
    if(Math.abs(cur[0]-prev[0])<=axisTol)cur[0]=prev[0];
    if(Math.abs(cur[1]-prev[1])<=axisTol)cur[1]=prev[1];
  }
  out=out.filter((p,i)=>i===0||p[0]!==out[i-1][0]||p[1]!==out[i-1][1]);

  // remove collinear points
  let changed=true;
  while(changed&&out.length>4){
    changed=false;
    const next=[];
    for(let i=0;i<out.length;i++){
      const a=out[(i-1+out.length)%out.length],b=out[i],c=out[(i+1)%out.length];
      if((a[0]===b[0]&&b[0]===c[0])||(a[1]===b[1]&&b[1]===c[1])){changed=true;continue}
      next.push(b);
    }
    out=next;
  }
  return out;
}


function angleDiffPi(a,b){
  let d=Math.abs(a-b)%Math.PI;
  return Math.min(d,Math.PI-d);
}

function lineIntersection(p1,d1,p2,d2){
  const cross=d1[0]*d2[1]-d1[1]*d2[0];
  if(Math.abs(cross)<1e-6)return null;
  const rx=p2[0]-p1[0],ry=p2[1]-p1[1];
  const t=(rx*d2[1]-ry*d2[0])/cross;
  return [p1[0]+d1[0]*t,p1[1]+d1[1]*t];
}

function pruneShortEdges(points,minLen){
  let out=points.slice();
  let guard=0;
  while(out.length>4&&guard++<100){
    let shortest=Infinity,idx=-1;
    for(let i=0;i<out.length;i++){
      const a=out[i],b=out[(i+1)%out.length];
      const len=Math.hypot(b[0]-a[0],b[1]-a[1]);
      if(len<shortest){shortest=len;idx=i}
    }
    if(shortest>=minLen)break;

    // Remove the vertex at the end of the shortest edge.
    out.splice((idx+1)%out.length,1);
  }
  return out;
}

function removeNearCollinear(points,tolDeg=5){
  let out=points.slice(),changed=true,guard=0;
  const tol=tolDeg*Math.PI/180;
  while(changed&&out.length>4&&guard++<20){
    changed=false;
    const next=[];
    for(let i=0;i<out.length;i++){
      const a=out[(i-1+out.length)%out.length];
      const b=out[i];
      const c=out[(i+1)%out.length];
      const a1=Math.atan2(b[1]-a[1],b[0]-a[0]);
      const a2=Math.atan2(c[1]-b[1],c[0]-b[0]);
      if(angleDiffPi(a1,a2)<tol){changed=true;continue}
      next.push(b);
    }
    out=next;
  }
  return out;
}

function architecturalPolygonize(loop,w,h){
  if(loop.length<4)return loop;

  const dim=Math.max(w,h);
  let eps=Math.max(2.8,dim*.0045);
  let pts=simplifyClosed(loop,eps);

  // Stronger simplification for noisy raster contours.
  while(pts.length>36&&eps<dim*.018){
    eps*=1.22;
    pts=simplifyClosed(loop,eps);
  }

  pts=pruneShortEdges(pts,Math.max(4,dim*.0075));
  pts=removeNearCollinear(pts,6);

  if(pts.length<4)return pts;

  const snapAngles=[0,Math.PI/4,Math.PI/2,3*Math.PI/4];
  const lines=[];

  for(let i=0;i<pts.length;i++){
    const a=pts[i],b=pts[(i+1)%pts.length];
    const dx=b[0]-a[0],dy=b[1]-a[1];
    const len=Math.hypot(dx,dy)||1;
    let angle=Math.atan2(dy,dx);
    while(angle<0)angle+=Math.PI;
    while(angle>=Math.PI)angle-=Math.PI;

    let best=snapAngles[0],bestDiff=Infinity;
    for(const candidate of snapAngles){
      const diff=angleDiffPi(angle,candidate);
      if(diff<bestDiff){bestDiff=diff;best=candidate}
    }

    // Architectural floor plans are overwhelmingly orthogonal. Preserve a clearly
    // non-standard long edge only when it is far from our normal 0/45/90/135 set.
    const snapped=bestDiff<=14*Math.PI/180 || len<dim*.10;
    const finalAngle=snapped?best:angle;

    lines.push({
      p:[(a[0]+b[0])/2,(a[1]+b[1])/2],
      d:[Math.cos(finalAngle),Math.sin(finalAngle)],
      len
    });
  }

  const out=[];
  const maxShift=dim*.055;
  for(let i=0;i<lines.length;i++){
    const prev=lines[(i-1+lines.length)%lines.length];
    const cur=lines[i];
    let p=lineIntersection(prev.p,prev.d,cur.p,cur.d);
    const original=pts[i];

    if(!p || !Number.isFinite(p[0]) || !Number.isFinite(p[1]) ||
       Math.hypot(p[0]-original[0],p[1]-original[1])>maxShift){
      p=original.slice();
    }

    p[0]=clamp(p[0],0,w);
    p[1]=clamp(p[1],0,h);
    out.push(p);
  }

  return removeNearCollinear(pruneShortEdges(out,Math.max(3,dim*.0055)),4);
}

function contourForLabel(labelMap,target,w,h){
  const edges=[];
  const byStart=new Map();
  function add(sx,sy,ex,ey,dir){
    const id=edges.length;
    edges.push({sx,sy,ex,ey,dir,used:false});
    const k=key(sx,sy);
    const arr=byStart.get(k)||[];arr.push(id);byStart.set(k,arr);
  }
  for(let y=0;y<h;y++){
    for(let x=0;x<w;x++){
      const i=y*w+x;
      if(labelMap[i]!==target)continue;
      if(y===0||labelMap[(y-1)*w+x]!==target)add(x,y,x+1,y,0);
      if(x===w-1||labelMap[y*w+x+1]!==target)add(x+1,y,x+1,y+1,1);
      if(y===h-1||labelMap[(y+1)*w+x]!==target)add(x+1,y+1,x,y+1,2);
      if(x===0||labelMap[y*w+x-1]!==target)add(x,y+1,x,y,3);
    }
  }
  const loops=[];
  for(let e0=0;e0<edges.length;e0++){
    if(edges[e0].used)continue;
    const start=edges[e0],loop=[[start.sx,start.sy]];
    start.used=true;
    let cx=start.ex,cy=start.ey,prevDir=start.dir,safety=0;
    while((cx!==start.sx||cy!==start.sy)&&safety++<edges.length+10){
      loop.push([cx,cy]);
      const candidates=(byStart.get(key(cx,cy))||[]).filter(id=>!edges[id].used);
      if(!candidates.length)break;
      let bestId=candidates[0],bestRank=99;
      for(const id of candidates){
        const d=edges[id].dir;
        const delta=(d-prevDir+4)%4;
        const rank=delta===1?0:delta===0?1:delta===3?2:3; // right, straight, left, back
        if(rank<bestRank){bestRank=rank;bestId=id}
      }
      const e=edges[bestId];e.used=true;prevDir=e.dir;cx=e.ex;cy=e.ey;
    }
    if(loop.length>=4&&cx===start.sx&&cy===start.sy)loops.push(loop);
  }
  if(!loops.length)return [];
  loops.sort((a,b)=>Math.abs(polygonArea(b))-Math.abs(polygonArea(a)));
  const chosen=loops[0];
  const polygon=architecturalPolygonize(chosen,w,h);
  return polygon.map(([x,y])=>({x:clamp(x/w,0,1),y:clamp(y/h,0,1)}));
}


function morphErodePasses(src,w,h,passes=1){
  let cur=src;
  for(let i=0;i<passes;i++)cur=morphErode(cur,w,h);
  return cur;
}

function morphDilatePasses(src,w,h,passes=1){
  let cur=src;
  for(let i=0;i<passes;i++)cur=morphDilate(cur,w,h);
  return cur;
}

function buildGuidedWallMask(dark,w,h){
  const base=Math.min(w,h);

  // The target plans use thick black apartment/common walls and thinner
  // furniture / symbols / internal detail. Keep both:
  // 1) truly thick strokes;
  // 2) long architectural strokes, even if they are thin (balconies, façade lines).
  let thick=morphErodePasses(dark,w,h,1);
  thick=morphDilatePasses(thick,w,h,2);

  const minRun=Math.max(7,Math.round(base*.010));
  let long=keepLongRuns(dark,w,h,minRun);
  long=morphDilatePasses(long,w,h,1);

  const wall=new Uint8Array(dark.length);
  for(let i=0;i<wall.length;i++)wall[i]=(thick[i]||long[i])?1:0;

  // Close anti-alias pinholes only. Door openings remain open, because the
  // guided geodesic partition needs to travel through real doors.
  return morphDilatePasses(morphErode(morphDilate(wall,w,h),w,h),w,h,1);
}

function nearestFreePoint(free,w,h,nx,ny,maxRadius=20){
  const x=clamp(Math.round(nx*(w-1)),0,w-1);
  const y=clamp(Math.round(ny*(h-1)),0,h-1);
  if(free[y*w+x])return {x,y};

  for(let r=1;r<=maxRadius;r++){
    const x0=Math.max(0,x-r),x1=Math.min(w-1,x+r);
    const y0=Math.max(0,y-r),y1=Math.min(h-1,y+r);

    for(let xx=x0;xx<=x1;xx++){
      if(free[y0*w+xx])return {x:xx,y:y0};
      if(free[y1*w+xx])return {x:xx,y:y1};
    }
    for(let yy=y0+1;yy<y1;yy++){
      if(free[yy*w+x0])return {x:x0,y:yy};
      if(free[yy*w+x1])return {x:x1,y:yy};
    }
  }
  return null;
}

function fillGuidedFreeSpace(free,w,h,apartmentSeeds,commonSeeds,balconySeeds=[]){
  const N=w*h;
  const labels=new Int16Array(N);
  const queue=new Int32Array(N);
  let head=0,tail=0;

  function seedPoint(p,label){
    const found=nearestFreePoint(free,w,h,p.x,p.y,24);
    if(!found)return false;
    const i=found.y*w+found.x;
    if(labels[i]===0){
      labels[i]=label;
      queue[tail++]=i;
    }
    return true;
  }

  // Apartment/common seeds are inserted first so they win exact-distance ties.
  apartmentSeeds.forEach((p,i)=>seedPoint(p,i+1));
  commonSeeds.forEach(p=>seedPoint(p,-1));

  // Balcony/terrace clicks are NOT new apartments. Each one is an extra seed
  // carrying the label of the nearest apartment. This solves the frequent case
  // where glazing/façade linework prevents the room seed from reaching the balcony.
  balconySeeds.forEach(p=>{
    const label=Math.max(1,Math.min(apartmentSeeds.length,Number(p.apartmentIndex)+1));
    seedPoint(p,label);
  });

  // Exterior is another competitor. This keeps terraces/balconies bounded by
  // their real outline instead of allowing apartment fill to escape into the page.
  for(let x=0;x<w;x++){
    const top=x,bottom=(h-1)*w+x;
    if(free[top]&&!labels[top]){labels[top]=-2;queue[tail++]=top}
    if(free[bottom]&&!labels[bottom]){labels[bottom]=-2;queue[tail++]=bottom}
  }
  for(let y=1;y<h-1;y++){
    const left=y*w,right=y*w+w-1;
    if(free[left]&&!labels[left]){labels[left]=-2;queue[tail++]=left}
    if(free[right]&&!labels[right]){labels[right]=-2;queue[tail++]=right}
  }

  while(head<tail){
    const i=queue[head++],label=labels[i];
    const y=Math.floor(i/w),x=i-y*w;

    if(y>0){
      const n=i-w;
      if(free[n]&&!labels[n]){labels[n]=label;queue[tail++]=n}
    }
    if(x>0){
      const n=i-1;
      if(free[n]&&!labels[n]){labels[n]=label;queue[tail++]=n}
    }
    if(x<w-1){
      const n=i+1;
      if(free[n]&&!labels[n]){labels[n]=label;queue[tail++]=n}
    }
    if(y<h-1){
      const n=i+w;
      if(free[n]&&!labels[n]){labels[n]=label;queue[tail++]=n}
    }
  }

  return labels;
}

function splitWallToMidline(freeLabels,wall,w,h){
  const N=w*h;
  const out=new Int16Array(freeLabels);
  const queue=new Int32Array(N);
  let head=0,tail=0;

  // Multi-source BFS from every labelled free-space pixel, but expansion is
  // allowed ONLY inside wall pixels. Adjacent regions therefore meet around the
  // middle of the wall thickness.
  for(let i=0;i<N;i++){
    if(freeLabels[i]!==0)queue[tail++]=i;
  }

  while(head<tail){
    const i=queue[head++],label=out[i];
    const y=Math.floor(i/w),x=i-y*w;

    if(y>0){
      const n=i-w;
      if(wall[n]&&out[n]===0){out[n]=label;queue[tail++]=n}
    }
    if(x>0){
      const n=i-1;
      if(wall[n]&&out[n]===0){out[n]=label;queue[tail++]=n}
    }
    if(x<w-1){
      const n=i+1;
      if(wall[n]&&out[n]===0){out[n]=label;queue[tail++]=n}
    }
    if(y<h-1){
      const n=i+w;
      if(wall[n]&&out[n]===0){out[n]=label;queue[tail++]=n}
    }
  }

  return out;
}


function floodExterior(free,w,h){
  const N=w*h;
  const seen=new Uint8Array(N);
  const queue=new Int32Array(N);
  let head=0,tail=0;

  function add(i){
    if(i<0||i>=N||seen[i]||!free[i])return;
    seen[i]=1;queue[tail++]=i;
  }

  for(let x=0;x<w;x++){
    add(x);
    add((h-1)*w+x);
  }
  for(let y=1;y<h-1;y++){
    add(y*w);
    add(y*w+w-1);
  }

  while(head<tail){
    const i=queue[head++];
    const y=Math.floor(i/w),x=i-y*w;
    if(y>0)add(i-w);
    if(x>0)add(i-1);
    if(x<w-1)add(i+1);
    if(y<h-1)add(i+w);
  }

  return seen;
}

function rescueBalconyAndTerracePockets(freeLabels,opaque,wall,w,h){
  const base=Math.min(w,h);

  // A separate "enclosure" mask may close façade/railing pinholes.
  // It is NOT used for room propagation, so closing a door here is harmless:
  // its only job is to decide whether a region is truly outside or an enclosed
  // balcony/terrace pocket that belongs to an apartment.
  const bridged=bridgeAxisGaps(
    wall,w,h,
    Math.max(5,Math.round(base*.018)),
    Math.max(3,Math.round(base*.0045))
  );

  let enclosure=morphDilatePasses(bridged,w,h,1);
  const enclosureFree=new Uint8Array(w*h);
  for(let i=0;i<enclosureFree.length;i++){
    enclosureFree[i]=opaque[i]&&!enclosure[i]?1:0;
  }

  const outside=floodExterior(enclosureFree,w,h);

  // Candidate = current exterior label that becomes enclosed when façade/railing
  // gaps are closed. This is the typical balcony/terrace failure mode.
  const candidate=new Uint8Array(w*h);
  for(let i=0;i<candidate.length;i++){
    if(freeLabels[i]===-2 && enclosureFree[i] && !outside[i])candidate[i]=1;
  }

  const cc=components(candidate,w,h,true);
  const out=new Int16Array(freeLabels);
  let rescued=0,rescuedArea=0;

  const minArea=Math.max(55,w*h*.00008);
  const maxArea=w*h*.085;

  for(const st of cc.stats){
    if(st.area<minArea||st.area>maxArea)continue;

    const contacts=new Map();
    let commonContacts=0;

    // Look around the component perimeter for neighbouring apartment labels.
    const pad=3;
    const x0=Math.max(0,st.minX-pad),x1=Math.min(w-1,st.maxX+pad);
    const y0=Math.max(0,st.minY-pad),y1=Math.min(h-1,st.maxY+pad);

    for(let y=y0;y<=y1;y++){
      for(let x=x0;x<=x1;x++){
        const i=y*w+x;
        if(cc.labels[i]!==st.id)continue;

        for(let yy=Math.max(0,y-2);yy<=Math.min(h-1,y+2);yy++){
          for(let xx=Math.max(0,x-2);xx<=Math.min(w-1,x+2);xx++){
            const label=freeLabels[yy*w+xx];
            if(label>0)contacts.set(label,(contacts.get(label)||0)+1);
            else if(label===-1)commonContacts++;
          }
        }
      }
    }

    if(!contacts.size)continue;

    const ranked=[...contacts.entries()].sort((a,b)=>b[1]-a[1]);
    const [bestLabel,bestCount]=ranked[0];
    const secondCount=ranked[1]?.[1]||0;

    // A balcony should have one dominant private neighbour and should not be
    // primarily attached to the common hall.
    if(bestCount<8)continue;
    if(secondCount>bestCount*.72)continue;
    if(commonContacts>bestCount*.90)continue;

    for(let i=0;i<cc.labels.length;i++){
      if(cc.labels[i]===st.id)out[i]=bestLabel;
    }

    rescued++;
    rescuedArea+=st.area;
  }

  return {labels:out,rescued,rescuedArea};
}

function majorityRegularizeLabels(labelMap,w,h,passes=2){
  let cur=new Int16Array(labelMap);

  for(let pass=0;pass<passes;pass++){
    const out=new Int16Array(cur);

    for(let y=1;y<h-1;y++){
      for(let x=1;x<w-1;x++){
        const i=y*w+x;
        const current=cur[i];

        // Keep exterior/common stable unless there is overwhelming evidence.
        const counts=new Map();
        for(let yy=y-1;yy<=y+1;yy++){
          for(let xx=x-1;xx<=x+1;xx++){
            const v=cur[yy*w+xx];
            counts.set(v,(counts.get(v)||0)+1);
          }
        }

        let best=current,bestCount=counts.get(current)||0;
        for(const [label,count] of counts){
          if(count>bestCount){best=label;bestCount=count}
        }

        if(best!==current && bestCount>=7){
          out[i]=best;
        }
      }
    }

    cur=out;
  }

  return cur;
}

function collapseShortLabelRuns(src,w,h,maxRun,horizontal=true){
  const out=new Int16Array(src);

  const lineCount=horizontal?h:w;
  const lineLength=horizontal?w:h;

  for(let line=0;line<lineCount;line++){
    let pos=0;
    while(pos<lineLength){
      const index=(p)=>horizontal?line*w+p:p*w+line;
      const label=out[index(pos)];
      const start=pos;
      while(pos<lineLength && out[index(pos)]===label)pos++;
      const end=pos-1;
      const len=end-start+1;

      if(len>maxRun || start===0 || end===lineLength-1)continue;

      const before=out[index(start-1)];
      const after=out[index(end+1)];

      // Remove tiny door/notch/furniture excursions only when the same region
      // exists on both sides of the run. Because this changes the SHARED label
      // map, both neighboring polygons receive the same boundary afterwards.
      if(before===after && before!==label){
        for(let p=start;p<=end;p++)out[index(p)]=before;
      }
    }
  }

  return out;
}

function rectifySharedLabels(labelMap,w,h,level=2){
  const lvl=clamp(Number(level)||2,1,3);
  let cur=majorityRegularizeLabels(labelMap,w,h,lvl+1);
  const maxRun=lvl===1?1:lvl===2?2:3;

  for(let pass=0;pass<lvl+1;pass++){
    cur=collapseShortLabelRuns(cur,w,h,maxRun,true);
    cur=collapseShortLabelRuns(cur,w,h,maxRun,false);
    cur=majorityRegularizeLabels(cur,w,h,1);
  }

  return cur;
}

function blockifySharedLabels(labelMap,w,h,blockSize,rectifyLevel=2){
  const b=Math.max(2,Math.round(blockSize));
  const gw=Math.max(1,Math.ceil(w/b));
  const gh=Math.max(1,Math.ceil(h/b));
  const grid=new Int16Array(gw*gh);

  for(let gy=0;gy<gh;gy++){
    const y0=gy*b,y1=Math.min(h,(gy+1)*b);
    for(let gx=0;gx<gw;gx++){
      const x0=gx*b,x1=Math.min(w,(gx+1)*b);
      const counts=new Map();

      for(let y=y0;y<y1;y++){
        for(let x=x0;x<x1;x++){
          const v=labelMap[y*w+x];
          counts.set(v,(counts.get(v)||0)+1);
        }
      }

      let best=0,bestCount=-1;
      for(const [label,count] of counts){
        if(count>bestCount){
          best=label;bestCount=count;
        }else if(count===bestCount){
          if(label>0 && best<=0)best=label;
        }
      }
      grid[gy*gw+gx]=best;
    }
  }

  return {
    labels:rectifySharedLabels(grid,gw,gh,rectifyLevel),
    w:gw,
    h:gh,
    block:b
  };
}

function removeOrthogonalSpikes(points,maxDepth=2){
  let out=points.slice();
  let changed=true,guard=0;

  while(changed&&out.length>=6&&guard++<40){
    changed=false;

    for(let i=0;i<out.length;i++){
      const a=out[i];
      const b=out[(i+1)%out.length];
      const c=out[(i+2)%out.length];
      const d=out[(i+3)%out.length];
      const e=out[(i+4)%out.length];

      // Vertical main edge with a short rectangular excursion.
      if(a[0]===b[0] && b[1]===c[1] && c[0]===d[0] && d[1]===e[1] && a[0]===e[0]){
        const depth=Math.abs(c[0]-a[0]);
        if(depth<=maxDepth){
          const remove=[(i+1)%out.length,(i+2)%out.length,(i+3)%out.length].sort((x,y)=>y-x);
          for(const ri of remove)out.splice(ri,1);
          changed=true;break;
        }
      }

      // Horizontal main edge with a short rectangular excursion.
      if(a[1]===b[1] && b[0]===c[0] && c[1]===d[1] && d[0]===e[0] && a[1]===e[1]){
        const depth=Math.abs(c[1]-a[1]);
        if(depth<=maxDepth){
          const remove=[(i+1)%out.length,(i+2)%out.length,(i+3)%out.length].sort((x,y)=>y-x);
          for(const ri of remove)out.splice(ri,1);
          changed=true;break;
        }
      }
    }
  }

  return out;
}

function compressOrthogonalPoints(points){
  let out=points.slice();

  // remove duplicates
  out=out.filter((p,i)=>i===0||p[0]!==out[i-1][0]||p[1]!==out[i-1][1]);

  let changed=true,guard=0;
  while(changed&&out.length>4&&guard++<30){
    changed=false;
    const next=[];

    for(let i=0;i<out.length;i++){
      const a=out[(i-1+out.length)%out.length];
      const b=out[i];
      const c=out[(i+1)%out.length];

      if((a[0]===b[0]&&b[0]===c[0])||(a[1]===b[1]&&b[1]===c[1])){
        changed=true;
        continue;
      }
      next.push(b);
    }

    out=next;
  }

  return out;
}

function orthogonalContourForLabel(labelMap,target,w,h){
  const edges=[];
  const byStart=new Map();

  function add(sx,sy,ex,ey,dir){
    const id=edges.length;
    edges.push({sx,sy,ex,ey,dir,used:false});
    const k=key(sx,sy);
    const arr=byStart.get(k)||[];
    arr.push(id);
    byStart.set(k,arr);
  }

  for(let y=0;y<h;y++){
    for(let x=0;x<w;x++){
      const i=y*w+x;
      if(labelMap[i]!==target)continue;

      if(y===0||labelMap[(y-1)*w+x]!==target)add(x,y,x+1,y,0);
      if(x===w-1||labelMap[y*w+x+1]!==target)add(x+1,y,x+1,y+1,1);
      if(y===h-1||labelMap[(y+1)*w+x]!==target)add(x+1,y+1,x,y+1,2);
      if(x===0||labelMap[y*w+x-1]!==target)add(x,y+1,x,y,3);
    }
  }

  const loops=[];
  for(let e0=0;e0<edges.length;e0++){
    if(edges[e0].used)continue;

    const start=edges[e0],loop=[[start.sx,start.sy]];
    start.used=true;

    let cx=start.ex,cy=start.ey,prevDir=start.dir,safety=0;

    while((cx!==start.sx||cy!==start.sy)&&safety++<edges.length+10){
      loop.push([cx,cy]);
      const candidates=(byStart.get(key(cx,cy))||[]).filter(id=>!edges[id].used);
      if(!candidates.length)break;

      let bestId=candidates[0],bestRank=99;
      for(const id of candidates){
        const d=edges[id].dir;
        const delta=(d-prevDir+4)%4;
        const rank=delta===1?0:delta===0?1:delta===3?2:3;
        if(rank<bestRank){bestRank=rank;bestId=id}
      }

      const e=edges[bestId];
      e.used=true;
      prevDir=e.dir;
      cx=e.ex;cy=e.ey;
    }

    if(loop.length>=4&&cx===start.sx&&cy===start.sy)loops.push(loop);
  }

  if(!loops.length)return [];
  loops.sort((a,b)=>Math.abs(polygonArea(b))-Math.abs(polygonArea(a)));

  // IMPORTANT: do not run RDP / angle snapping here.
  // The shared label grid already provides exact 0/90 geometry. Altering each
  // apartment independently is exactly what previously created overlaps/gaps.
  // The shared grid has already been rectified globally.
  // Only remove collinear points here: no per-apartment geometry mutation,
  // otherwise two neighbors could stop being perfectly tangent.
  const poly=compressOrthogonalPoints(loops[0]);

  return poly.map(([x,y])=>({
    x:clamp(x/w,0,1),
    y:clamp(y/h,0,1)
  }));
}


function median(values){
  if(!values?.length)return 0;
  const a=values.slice().sort((x,y)=>x-y);
  const m=Math.floor(a.length/2);
  return a.length%2?a[m]:(a[m-1]+a[m])/2;
}

function wallInkAt(data,w,h,x,y){
  x=Math.round(x);y=Math.round(y);
  if(x<0||y<0||x>=w||y>=h)return 0;
  const i=(y*w+x)*4;
  if(data[i+3]<40)return 0;
  const r=data[i],g=data[i+1],b=data[i+2];
  const luma=.299*r+.587*g+.114*b;
  // Distance from white catches black walls but also thin coloured balcony/parapet lines.
  const chromaInk=255-Math.min(r,g,b);
  return Math.max(255-luma,chromaInk*.78);
}

function wallRunsAcrossNormal(imageData,w,h,orientation,along,baseCoord,searchRadius){
  const data=imageData.data;
  const hits=[];
  const threshold=82;
  let active=false,start=0;

  for(let d=-searchRadius;d<=searchRadius;d++){
    const x=orientation==='h'?along:baseCoord+d;
    const y=orientation==='h'?baseCoord+d:along;
    const ink=wallInkAt(data,w,h,x,y);
    const on=ink>=threshold;
    if(on&&!active){active=true;start=d}
    if((!on||d===searchRadius)&&active){
      const end=on&&d===searchRadius?d:d-1;
      const thickness=end-start+1;
      const center=baseCoord+(start+end)/2;
      if(thickness>=1&&thickness<=Math.max(24,searchRadius*1.35)){
        hits.push({center,start:baseCoord+start,end:baseCoord+end,thickness});
      }
      active=false;
    }
  }

  // Double-line wall / thin parapet fallback: treat two close parallel strokes as one wall band.
  const paired=hits.slice();
  for(let i=0;i<hits.length;i++){
    for(let j=i+1;j<hits.length;j++){
      const outerStart=Math.min(hits[i].start,hits[j].start);
      const outerEnd=Math.max(hits[i].end,hits[j].end);
      const outerWidth=outerEnd-outerStart+1;
      if(outerWidth<=Math.max(30,searchRadius*1.55)){
        paired.push({
          center:(outerStart+outerEnd)/2,
          start:outerStart,
          end:outerEnd,
          thickness:Math.max(hits[i].thickness,hits[j].thickness),
          paired:true
        });
      }
    }
  }
  return paired;
}

function fitWallAxisForSegment(imageData,w,h,a,b){
  const x1=a.x*w,y1=a.y*h,x2=b.x*w,y2=b.y*h;
  const dx=x2-x1,dy=y2-y1;
  const orientation=Math.abs(dx)>=Math.abs(dy)?'h':'v';
  const alongStart=orientation==='h'?Math.min(x1,x2):Math.min(y1,y2);
  const alongEnd=orientation==='h'?Math.max(x1,x2):Math.max(y1,y2);
  const originalCoord=orientation==='h'?(y1+y2)/2:(x1+x2)/2;
  const length=alongEnd-alongStart;
  const dim=Math.min(w,h);
  const searchRadius=Math.max(9,Math.min(42,Math.round(dim*.022)));
  const sampleCount=clamp(Math.round(length/18),9,52);
  const trim=length>40?Math.min(length*.08,18):0;
  const candidates=[];

  for(let si=0;si<sampleCount;si++){
    const t=sampleCount===1?.5:si/(sampleCount-1);
    const along=alongStart+trim+(length-2*trim)*t;
    const runs=wallRunsAcrossNormal(imageData,w,h,orientation,along,originalCoord,searchRadius);
    for(const run of runs){
      const dist=Math.abs(run.center-originalCoord);
      if(dist<=searchRadius){
        candidates.push({...run,sample:si,dist});
      }
    }
  }

  if(!candidates.length){
    return {orientation,coord:originalCoord,originalCoord,confidence:0,support:0,length,reason:'no-wall'};
  }

  // Cluster candidate wall centres ACROSS the entire side. Isolated furniture/door arcs
  // do not receive enough longitudinal support to win this vote.
  const tol=Math.max(2.2,dim*.0022);
  const sorted=candidates.slice().sort((u,v)=>u.center-v.center);
  const clusters=[];
  for(const c of sorted){
    let best=null,bestDist=Infinity;
    for(const cl of clusters){
      const d=Math.abs(c.center-cl.mean);
      if(d<=tol&&d<bestDist){best=cl;bestDist=d}
    }
    if(!best){
      best={items:[],mean:c.center};clusters.push(best);
    }
    best.items.push(c);
    best.mean=best.items.reduce((sum,x)=>sum+x.center,0)/best.items.length;
  }

  let winner=null,winnerScore=-Infinity;
  for(const cl of clusters){
    const uniqueSamples=new Set(cl.items.map(x=>x.sample)).size;
    const support=uniqueSamples/sampleCount;
    const centres=cl.items.map(x=>x.center);
    const coord=median(centres);
    const thickness=median(cl.items.map(x=>x.thickness));
    const dist=Math.abs(coord-originalCoord);
    const thicknessBonus=Math.min(1,thickness/Math.max(2,dim*.006));
    const score=support*100 + thicknessBonus*10 - dist*1.35;
    if(score>winnerScore){
      winnerScore=score;
      winner={coord,support,thickness,dist,uniqueSamples};
    }
  }

  const minSupport=length<dim*.055?.28:.34;
  const valid=winner&&winner.support>=minSupport&&winner.dist<=searchRadius;
  const confidence=valid
    ? clamp(winner.support*.82 + Math.min(1,winner.thickness/Math.max(2,dim*.008))*.18,0,1)
    : 0;

  return {
    orientation,
    coord:valid?winner.coord:originalCoord,
    originalCoord,
    confidence,
    support:winner?.support||0,
    thickness:winner?.thickness||0,
    length,
    reason:valid?'wall-axis':'low-support'
  };
}

function sameAxis(a,b,tol=1.5){
  return Math.abs(a-b)<=tol;
}

function flattenDoorNotchesWithWallEvidence(points,imageData,w,h){
  // Only flatten a small orthogonal excursion when the PNG itself supports a
  // single wall axis across the complete gap. This is the door-jamb rule.
  let pts=points.map(p=>({x:p.x,y:p.y}));
  const dim=Math.min(w,h);
  const maxDepth=Math.max(9,dim*.026);
  const maxSpan=Math.max(28,dim*.105);
  let changed=true,guard=0;

  while(changed&&pts.length>=8&&guard++<30){
    changed=false;
    for(let i=0;i<pts.length;i++){
      const at=k=>pts[(i+k)%pts.length];
      const a=at(0),b=at(1),c=at(2),d=at(3),e=at(4);
      const ax=a.x*w,ay=a.y*h,bx=b.x*w,by=b.y*h,cx=c.x*w,cy=c.y*h,dx=d.x*w,dy=d.y*h,ex=e.x*w,ey=e.y*h;

      const hNotch=sameAxis(ay,by)&&sameAxis(bx,cx)&&sameAxis(cy,dy)&&sameAxis(dx,ex)&&sameAxis(ay,ey);
      const vNotch=sameAxis(ax,bx)&&sameAxis(by,cy)&&sameAxis(cx,dx)&&sameAxis(dy,ey)&&sameAxis(ax,ex);
      if(!hNotch&&!vNotch)continue;

      const depth=hNotch?Math.abs(cy-ay):Math.abs(cx-ax);
      const span=hNotch?Math.abs(ex-ax):Math.abs(ey-ay);
      if(depth>maxDepth||span>maxSpan)continue;

      const fit=fitWallAxisForSegment(imageData,w,h,a,e);
      if(fit.confidence<.48||fit.support<.43)continue;

      // Remove the three vertices that walk around the jamb/notch.
      const remove=[];
      for(let k=1;k<=3;k++)remove.push((i+k)%pts.length);
      remove.sort((x,y)=>y-x).forEach(idx=>pts.splice(idx,1));
      changed=true;
      break;
    }
  }
  return pts;
}

function polygonSignedAreaNorm(points){
  let area=0;
  for(let i=0,j=points.length-1;i<points.length;j=i++){
    area+=points[j].x*points[i].y-points[i].x*points[j].y;
  }
  return area/2;
}

function reconcileSharedEdgeCoordinates(edges,w,h){
  const dim=Math.min(w,h);
  const coordTol=Math.max(1.5,dim*.0018);

  // Shared edges in Topology V4 already use the same source grid. Therefore we only
  // merge edges whose ORIGINAL axes coincide. We do not merge merely-close parallel walls.
  const parent=edges.map((_,i)=>i);
  const find=i=>parent[i]===i?i:(parent[i]=find(parent[i]));
  const join=(a,b)=>{a=find(a);b=find(b);if(a!==b)parent[b]=a};

  for(let i=0;i<edges.length;i++){
    const a=edges[i];
    for(let j=i+1;j<edges.length;j++){
      const b=edges[j];
      if(a.orientation!==b.orientation)continue;
      if(Math.abs(a.originalCoord-b.originalCoord)>coordTol)continue;
      const overlap=Math.max(0,Math.min(a.spanMax,b.spanMax)-Math.max(a.spanMin,b.spanMin));
      const minLen=Math.max(1,Math.min(a.spanMax-a.spanMin,b.spanMax-b.spanMin));
      if(overlap/minLen<.28)continue;
      join(i,j);
    }
  }

  const groups=new Map();
  edges.forEach((e,i)=>{
    const root=find(i);
    const arr=groups.get(root)||[];arr.push(e);groups.set(root,arr);
  });

  for(const group of groups.values()){
    const trusted=group.filter(e=>e.confidence>=.34);
    if(!trusted.length)continue;
    const weighted=[];
    trusted.forEach(e=>{
      const n=clamp(Math.round(e.confidence*10),1,10);
      for(let k=0;k<n;k++)weighted.push(e.coord);
    });
    const canonical=median(weighted);
    group.forEach(e=>{
      // A weak edge receives the canonical axis only when another polygon that shares
      // the exact original boundary found the wall confidently.
      e.coord=canonical;
      e.sharedResolved=group.length>1;
    });
  }
}

function alignDetectionsToWallCenters(detections,imageData,w,h){
  const originalDetections=detections.map(d=>({...d,points:d.points.map(p=>({...p}))}));
  const working=originalDetections.map(d=>({
    ...d,
    points:flattenDoorNotchesWithWallEvidence(d.points,imageData,w,h)
  }));

  const edges=[];
  working.forEach((d,di)=>{
    const pts=d.points;
    for(let ei=0;ei<pts.length;ei++){
      const a=pts[ei],b=pts[(ei+1)%pts.length];
      const fit=fitWallAxisForSegment(imageData,w,h,a,b);
      const orientation=fit.orientation;
      const spanA=orientation==='h'?a.x*w:a.y*h;
      const spanB=orientation==='h'?b.x*w:b.y*h;
      edges.push({
        di,ei,orientation,
        originalCoord:fit.originalCoord,
        coord:fit.coord,
        confidence:fit.confidence,
        support:fit.support,
        spanMin:Math.min(spanA,spanB),
        spanMax:Math.max(spanA,spanB),
        sharedResolved:false
      });
    }
  });

  reconcileSharedEdgeCoordinates(edges,w,h);
  const byPoly=new Map();
  edges.forEach(e=>{
    const arr=byPoly.get(e.di)||[];arr[e.ei]=e;byPoly.set(e.di,arr);
  });

  let alignedEdges=0,unresolvedEdges=0,sharedEdges=0,totalConfidence=0;
  const aligned=working.map((d,di)=>{
    const pts=d.points;
    const pe=byPoly.get(di)||[];
    const next=[];
    const issues=[];

    for(let i=0;i<pts.length;i++){
      const prev=pe[(i-1+pts.length)%pts.length];
      const cur=pe[i];
      const original=pts[i];
      let x=original.x*w,y=original.y*h;

      if(prev&&cur&&prev.orientation!==cur.orientation){
        const hEdge=prev.orientation==='h'?prev:cur;
        const vEdge=prev.orientation==='v'?prev:cur;
        x=vEdge.coord;y=hEdge.coord;
      }
      next.push({x:clamp(x/w,0,1),y:clamp(y/h,0,1)});
    }

    // Collinear-point removal does not move any boundary and is safe per polygon.
    const compact=[];
    for(let i=0;i<next.length;i++){
      const a=next[(i-1+next.length)%next.length],b=next[i],c=next[(i+1)%next.length];
      const collinear=(Math.abs(a.x-b.x)<1e-6&&Math.abs(b.x-c.x)<1e-6)||(Math.abs(a.y-b.y)<1e-6&&Math.abs(b.y-c.y)<1e-6);
      if(!collinear)compact.push(b);
    }

    // Sanity guard: never replace a detected apartment with a wildly distorted polygon.
    const oldArea=Math.abs(polygonSignedAreaNorm(d.points));
    const newArea=Math.abs(polygonSignedAreaNorm(compact));
    const areaRatio=oldArea?newArea/oldArea:1;
    const sane=compact.length>=4&&areaRatio>.72&&areaRatio<1.28;
    const finalPoints=sane?compact:d.points;

    for(const e of pe){
      if(!e)continue;
      totalConfidence+=e.confidence;
      if(e.sharedResolved)sharedEdges++;
      if(e.confidence>=.34||e.sharedResolved)alignedEdges++;
      else{
        unresolvedEdges++;
        const a=finalPoints[Math.min(e.ei,finalPoints.length-1)];
        const b=finalPoints[(Math.min(e.ei,finalPoints.length-1)+1)%finalPoints.length];
        if(a&&b)issues.push({a,b});
      }
    }

    return {
      ...d,
      points:finalPoints,
      wallAligned:sane,
      alignmentIssues:issues
    };
  });

  return {
    detections:aligned,
    stats:{
      alignedEdges,
      unresolvedEdges,
      sharedEdges,
      meanConfidence:edges.length?totalConfidence/edges.length:0
    }
  };
}

function topologyGuidedScore(result,seedCount){
  if(!result?.detections?.length)return -1e9;

  const exact=result.detections.length===seedCount?1200:0;
  const ratios=result.detections.map(d=>d.area/Math.max(1,result.opaqueCount));
  const minRatio=Math.min(...ratios);
  const maxRatio=Math.max(...ratios);
  const plausibleMin=minRatio>.004?120:-100;
  const plausibleMax=maxRatio<.38?80:-120;
  const common=result.commonArea/result.opaqueCount>.006?90:0;
  const wallRatio=result.wallPixels/Math.max(1,result.opaqueCount);
  const wallPlausible=wallRatio>.015&&wallRatio<.34?80:-80;

  return exact+result.detections.length*25+plausibleMin+plausibleMax+common+wallPlausible;
}

function analyzeGuidedTopology(imageData,w,h,threshold,apartmentSeeds,commonSeeds,balconySeeds=[],rectifyLevel=2){
  const d=imageData.data,N=w*h;
  const opaque=new Uint8Array(N),dark=new Uint8Array(N);
  let opaqueCount=0;

  for(let i=0,p=0;i<N;i++,p+=4){
    if(d[p+3]<=48)continue;
    opaque[i]=1;opaqueCount++;

    const gray=.299*d[p]+.587*d[p+1]+.114*d[p+2];
    if(gray<threshold)dark[i]=1;
  }

  const wall=buildGuidedWallMask(dark,w,h);
  const free=new Uint8Array(N);
  let wallPixels=0;
  for(let i=0;i<N;i++){
    if(wall[i])wallPixels++;
    free[i]=opaque[i]&&!wall[i]?1:0;
  }

  const rawFreeLabels=fillGuidedFreeSpace(
    free,w,h,
    apartmentSeeds||[],
    commonSeeds||[],
    balconySeeds||[]
  );

  // Rescue balconies/terraces that were won by the exterior seed through thin
  // façade/railing gaps, then split wall thickness between neighbouring regions.
  const balconyRescue=rescueBalconyAndTerracePockets(
    rawFreeLabels,
    opaque,
    wall,
    w,h
  );

  const finalLabels=splitWallToMidline(
    balconyRescue.labels,
    wall,
    w,h
  );

  // Produce EVERY apartment polygon from the SAME coarse shared label grid.
  // This guarantees that two neighbouring apartments use exactly the same
  // boundary coordinates instead of independently simplified contours.
  const rectification=clamp(Number(rectifyLevel)||2,1,3);
  const blockFactor=rectification===1?.0032:rectification===2?.0055:.0080;
  const blockSize=Math.max(3,Math.round(Math.min(w,h)*blockFactor));
  const shared=blockifySharedLabels(finalLabels,w,h,blockSize,rectification);

  const detections=[];
  for(let label=1;label<=(apartmentSeeds||[]).length;label++){
    let area=0,sumX=0,sumY=0;
    for(let i=0;i<N;i++){
      if(finalLabels[i]!==label)continue;
      area++;
      const y=Math.floor(i/w),x=i-y*w;
      sumX+=x;sumY+=y;
    }
    if(area<Math.max(90,N*.00035))continue;

    const points=orthogonalContourForLabel(
      shared.labels,
      label,
      shared.w,
      shared.h
    );
    if(points.length<4)continue;

    detections.push({
      componentId:`topology-${label}`,
      seedIndex:label-1,
      points,
      confidence:.98,
      area,
      cx:(sumX/area)/w,
      cy:(sumY/area)/h
    });
  }

  detections.sort((a,b)=>a.seedIndex-b.seedIndex);

  let commonArea=0;
  for(let i=0;i<N;i++)if(balconyRescue.labels[i]===-1)commonArea++;

  let commonPoints=[];
  if(commonArea){
    commonPoints=orthogonalContourForLabel(
      shared.labels,
      -1,
      shared.w,
      shared.h
    );
  }

  return {
    detections,
    initialCandidates:[],
    excludedIds:new Set(),
    likelyCore:commonPoints.length>3
      ? {id:'guided-common',area:commonArea,points:commonPoints}
      : null,
    threshold,
    expected:(apartmentSeeds||[]).length,
    opaqueCount,
    wallPixels,
    commonArea,
    balconyRescued:balconyRescue.rescued,
    balconyRescuedArea:balconyRescue.rescuedArea,
    balconySeedCount:(balconySeeds||[]).length,
    sharedGridBlock:blockSize,
    rectificationLevel:rectification,
    width:w,
    height:h,
    topologyGuided:true,
    orthogonalShared:true
  };
}

function analyzeGuidedAuto(imageData,w,h,apartmentSeeds,commonSeeds,balconySeeds=[],rectifyLevel=2){
  let best=null,bestScore=-1e9;
  for(const t of [75,85,95,105,115,125,135,145]){
    const r=analyzeGuidedTopology(imageData,w,h,t,apartmentSeeds,commonSeeds,balconySeeds,rectifyLevel);
    const score=topologyGuidedScore(r,apartmentSeeds.length);
    if(score>bestScore){best=r;bestScore=score}
  }
  return best;
}

function analyzePixels(imageData,w,h,threshold,expected,excludedIds=new Set(),seedPoints=[]){
  const d=imageData.data,N=w*h;
  const opaque=new Uint8Array(N),dark=new Uint8Array(N);
  let opaqueCount=0;

  for(let i=0,p=0;i<N;i++,p+=4){
    const a=d[p+3];
    if(a>48){
      opaque[i]=1;opaqueCount++;
      const gray=.299*d[p]+.587*d[p+1]+.114*d[p+2];
      if(gray<threshold)dark[i]=1;
    }
  }

  // Architectural V2:
  // isolate long wall-like strokes first, then reconnect small door / antialias gaps.
  // This avoids treating furniture, text and decoration as apartment boundaries.
  const wall=buildStructuralWallMask(dark,w,h);

  const free=new Uint8Array(N);
  for(let i=0;i<N;i++)free[i]=opaque[i]&&!wall[i]?1:0;
  const cc=components(free,w,h,true);
  const {count,usable}=suggestedCount(cc.stats,opaqueCount,expected);

  let initial;
  if(seedPoints?.length){
    const ids=[];
    for(const p of seedPoints){
      const x=clamp(Math.round(p.x*(w-1)),0,w-1);
      const y=clamp(Math.round(p.y*(h-1)),0,h-1);
      let id=cc.labels[y*w+x];
      // If the click landed exactly on a wall, look nearby for the closest free-space component.
      if(!id){
        outer: for(let r=1;r<=8;r++){
          for(let yy=Math.max(0,y-r);yy<=Math.min(h-1,y+r);yy++){
            for(let xx=Math.max(0,x-r);xx<=Math.min(w-1,x+r);xx++){
              const test=cc.labels[yy*w+xx];
              if(test){id=test;break outer}
            }
          }
        }
      }
      if(id&&!ids.includes(id))ids.push(id);
    }
    initial=ids.map(id=>cc.stats.find(x=>x.id===id)).filter(Boolean);
  }else{
    initial=usable.slice(0,count);
  }

  const chosen=initial.filter(c=>!excludedIds.has(c.id));

  // Transparent holes fully enclosed by the drawing are strong common-core/stair candidates.
  const transparent=new Uint8Array(N);
  for(let i=0;i<N;i++)transparent[i]=opaque[i]?0:1;
  const bg=components(transparent,w,h,true);
  const holes=bg.stats
    .filter(s=>!s.touchesBorder&&s.area>=Math.max(80,N*.0008))
    .sort((a,b)=>b.area-a.area);
  const likelyCore=holes[0]||null;

  const chosenMap=new Map(chosen.map((c,i)=>[c.id,i+1]));
  const excludedMap=new Set(initial.filter(c=>excludedIds.has(c.id)).map(c=>c.id));

  // Multi-source Voronoi inside the opaque plan:
  // apartment free-space competes with common/outside wall edges.
  // This places shared boundaries close to the middle of thick black walls.
  const finalLabels=new Int16Array(N);
  const queue=new Int32Array(N);
  let head=0,tail=0;

  for(let i=0;i<N;i++){
    const c=cc.labels[i];
    if(chosenMap.has(c)){
      finalLabels[i]=chosenMap.get(c);queue[tail++]=i;
    }else if(excludedMap.has(c)){
      finalLabels[i]=-1;queue[tail++]=i;
    }
  }

  // Seed common/outside side of walls only, not open terraces/floors.
  for(let y=0;y<h;y++){
    for(let x=0;x<w;x++){
      const i=y*w+x;
      if(!opaque[i]||!wall[i]||finalLabels[i])continue;
      let nextToTransparent=false;
      if(x===0||!opaque[i-1])nextToTransparent=true;
      else if(x===w-1||!opaque[i+1])nextToTransparent=true;
      else if(y===0||!opaque[i-w])nextToTransparent=true;
      else if(y===h-1||!opaque[i+w])nextToTransparent=true;
      if(nextToTransparent){finalLabels[i]=-1;queue[tail++]=i}
    }
  }

  while(head<tail){
    const idx=queue[head++],label=finalLabels[idx];
    const y=Math.floor(idx/w),x=idx-y*w;
    const ns=[idx-w,idx-1,idx+1,idx+w];
    if(y>0){const n=ns[0];if(opaque[n]&&!finalLabels[n]){finalLabels[n]=label;queue[tail++]=n}}
    if(x>0){const n=ns[1];if(opaque[n]&&!finalLabels[n]){finalLabels[n]=label;queue[tail++]=n}}
    if(x<w-1){const n=ns[2];if(opaque[n]&&!finalLabels[n]){finalLabels[n]=label;queue[tail++]=n}}
    if(y<h-1){const n=ns[3];if(opaque[n]&&!finalLabels[n]){finalLabels[n]=label;queue[tail++]=n}}
  }

  const areas=chosen.map(c=>c.area).sort((a,b)=>a-b);
  const median=areas.length?areas[Math.floor(areas.length/2)]:1;
  const detections=chosen.map((c,i)=>{
    const label=i+1;
    const points=contourForLabel(finalLabels,label,w,h);
    const ratio=c.area/Math.max(1,median);
    const confidence=clamp(.76+.12*Math.min(1,ratio),.70,.94);
    return {componentId:c.id,points,confidence,area:c.area,cx:c.cx/w,cy:c.cy/h};
  }).filter(x=>x.points.length>=4);

  detections.sort((a,b)=>{
    const rowA=Math.round(a.cy*8),rowB=Math.round(b.cy*8);
    return rowA===rowB?a.cx-b.cx:a.cy-b.cy;
  });

  let corePoints=[];
  if(likelyCore){
    corePoints=contourForLabel(bg.labels,likelyCore.id,w,h);
  }

  return {
    detections,
    initialCandidates:initial,
    excludedIds,
    likelyCore:likelyCore?{...likelyCore,points:corePoints}:null,
    threshold,
    expected:Number(expected)||0,
    opaqueCount,
    width:w,height:h
  };
}


function analysisScore(result,expected){
  const n=result.detections.length;
  if(!n)return -1e9;
  if(Number(expected)>0)return -Math.abs(n-Number(expected))*100 + n;
  // Prefer plausible residential-floor counts and a stable set of sizeable regions.
  const plausible=n>=2&&n<=30 ? 80 : -80;
  const confid=result.detections.reduce((a,b)=>a+b.confidence,0)/n;
  return plausible+n*2+confid*20;
}
function analyzeAuto(imageData,w,h,expected,excludedIds=new Set(),seedPoints=[]){
  if(seedPoints?.length){
    // Guided mode needs only a reasonable wall threshold; test a few and keep the one
    // that resolves the most unique clicked units.
    let best=null,bestScore=-1e9;
    for(const t of [85,90,95,100,105,110,115]){
      const r=analyzePixels(imageData,w,h,t,seedPoints.length,excludedIds,seedPoints);
      const score=(r.detections.length===seedPoints.length?1000:0)+r.detections.length*20;
      if(score>bestScore){best=r;bestScore=score}
    }
    return best;
  }
  let best=null,bestScore=-1e9;
  for(let t=80;t<=125;t+=5){
    const r=analyzePixels(imageData,w,h,t,expected,excludedIds,[]);
    const score=analysisScore(r,expected);
    if(score>bestScore){best=r;bestScore=score}
  }
  return best;
}

async function loadPlan(url,maxDim=1650){
  const r=await fetch(url,{mode:'cors'});
  if(!r.ok)throw new Error(`Nu pot încărca planul (${r.status}).`);
  const blob=await r.blob();
  const bmp=await createImageBitmap(blob);
  const byDim=Math.min(1,maxDim/Math.max(bmp.width,bmp.height));
  const byPixels=Math.min(1,Math.sqrt(2400000/Math.max(1,bmp.width*bmp.height)));
  const scale=Math.min(byDim,byPixels);
  const w=Math.max(1,Math.round(bmp.width*scale)),h=Math.max(1,Math.round(bmp.height*scale));
  const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  ctx.clearRect(0,0,w,h);ctx.drawImage(bmp,0,0,w,h);
  return {imageData:ctx.getImageData(0,0,w,h),w,h};
}

const colors=[
  '#22b573','#4f7cff','#f28d63','#9b6ad6','#e4b743','#00a7b5','#e66f9d','#7eb54b',
  '#d66d3a','#607dcb','#7f62a3','#57a86b','#ca6f8a','#b3a33c','#3f94b8','#d58043'
];

export default function AutoApartmentDetector({floor,onClose,onCommitted}){
  const [expected,setExpected]=useState('');
  const [threshold,setThreshold]=useState(95);
  const [autoThreshold,setAutoThreshold]=useState(true);
  const [guided,setGuided]=useState(true);
  const [seeds,setSeeds]=useState([]);
  const [commonSeeds,setCommonSeeds]=useState([]);
  const [balconySeeds,setBalconySeeds]=useState([]);
  const [seedMode,setSeedMode]=useState('apartments');
  const [rectifyLevel,setRectifyLevel]=useState(2);
  const [alignmentBase,setAlignmentBase]=useState(null);
  const [aspect,setAspect]=useState(1);
  const [busy,setBusy]=useState(false);
  const [raw,setRaw]=useState(null);
  const [result,setResult]=useState(null);
  const [excluded,setExcluded]=useState(new Set());
  const [overwrite,setOverwrite]=useState(false);
  const [message,setMessage]=useState('');
  const [mapping,setMapping]=useState({});

  const existing=floor?.apartments||[];

  useEffect(()=>{
    if(!guided || raw || !floor?.plan_path)return;
    let cancelled=false;
    (async()=>{
      try{
        const loaded=await loadPlan(floor.plan_path);
        if(cancelled)return;
        setRaw(loaded);
        setAspect(loaded.w/Math.max(1,loaded.h));
      }catch(e){
        if(!cancelled)setMessage(`Nu pot încărca planul pentru modul asistat: ${e.message}`);
      }
    })();
    return()=>{cancelled=true};
  },[guided,raw,floor?.plan_path]);

  async function run(){
    if(!floor?.plan_path)return;
    setBusy(true);setMessage('');
    try{
      const loaded=raw||await loadPlan(floor.plan_path);
      if(!raw)setRaw(loaded);
      if(guided&&(!seeds.length||!commonSeeds.length)){
        throw new Error('În Mod asistat pune cel puțin un punct în fiecare apartament și cel puțin un punct în holul / zona comună.');
      }

      const r=guided
        ? (autoThreshold
            ? analyzeGuidedAuto(loaded.imageData,loaded.w,loaded.h,seeds,commonSeeds,balconySeeds,rectifyLevel)
            : analyzeGuidedTopology(loaded.imageData,loaded.w,loaded.h,Number(threshold)||105,seeds,commonSeeds,balconySeeds,rectifyLevel))
        : (autoThreshold
            ? analyzeAuto(loaded.imageData,loaded.w,loaded.h,expected,new Set(),[])
            : analyzePixels(loaded.imageData,loaded.w,loaded.h,Number(threshold)||95,expected,new Set(),[]));
      setExcluded(new Set());
      setAlignmentBase(null);
      setResult(r);
      if(r?.threshold)setThreshold(r.threshold);
      const m={};
      r.detections.forEach((d,i)=>{m[i]=existing[i]?.id||'new'});
      setMapping(m);
    }catch(e){
      setMessage(`Eroare detectare: ${e.message}`);
    }finally{setBusy(false)}
  }

  function recompute(nextExcluded){
    if(!raw)return;
    const r=guided
      ? (autoThreshold
          ? analyzeGuidedAuto(raw.imageData,raw.w,raw.h,seeds,commonSeeds,balconySeeds,rectifyLevel)
          : analyzeGuidedTopology(raw.imageData,raw.w,raw.h,Number(threshold)||105,seeds,commonSeeds,balconySeeds,rectifyLevel))
      : (autoThreshold
          ? analyzeAuto(raw.imageData,raw.w,raw.h,expected,nextExcluded,[])
          : analyzePixels(raw.imageData,raw.w,raw.h,Number(threshold)||95,expected,nextExcluded,[]));
    setExcluded(guided?new Set():nextExcluded);setAlignmentBase(null);setResult(r);
    const m={};
    r.detections.forEach((d,i)=>{m[i]=existing[i]?.id||'new'});
    setMapping(m);
  }

  function rectifyPolygons(level=rectifyLevel){
    if(!raw||!guided)return;
    const lvl=clamp(Number(level)||2,1,3);
    setRectifyLevel(lvl);
    setBusy(true);setMessage('');
    try{
      const r=autoThreshold
        ? analyzeGuidedAuto(raw.imageData,raw.w,raw.h,seeds,commonSeeds,balconySeeds,lvl)
        : analyzeGuidedTopology(raw.imageData,raw.w,raw.h,Number(threshold)||105,seeds,commonSeeds,balconySeeds,lvl);
      setAlignmentBase(null);
      setResult(r);
      const m={};
      r.detections.forEach((d,i)=>{m[i]=existing[i]?.id||'new'});
      setMapping(m);
      setMessage(`✓ Poligoane rectificate · nivel ${lvl===1?'curat':lvl===2?'agresiv':'foarte agresiv'} · limite comune păstrate.`);
    }catch(e){
      setMessage(`Rectificarea a eșuat: ${e.message}`);
    }finally{
      setBusy(false);
    }
  }

  function alignToWallCenters(){
    if(!result?.detections?.length||!raw)return;
    setBusy(true);setMessage('');
    try{
      const base=alignmentBase||{
        ...result,
        detections:result.detections.map(d=>({...d,points:d.points.map(p=>({...p}))}))
      };
      if(!alignmentBase)setAlignmentBase(base);

      const aligned=alignDetectionsToWallCenters(result.detections,raw.imageData,raw.w,raw.h);
      setResult({
        ...result,
        detections:aligned.detections,
        wallAligned:true,
        wallAlignment:aligned.stats
      });
      setMessage(`✓ Aliniere pe axul pereților: ${aligned.stats.alignedEdges} laturi aliniate · ${aligned.stats.sharedEdges} limite comune sincronizate · ${aligned.stats.unresolvedEdges} laturi păstrate pentru verificare.`);
    }catch(e){
      setMessage(`Alinierea pe pereți a eșuat: ${e.message}`);
    }finally{
      setBusy(false);
    }
  }

  function restoreDetectedGeometry(){
    if(!alignmentBase)return;
    setResult(alignmentBase);
    setAlignmentBase(null);
    setMessage('✓ Am revenit la geometria detectată înainte de alinierea pe pereți.');
  }

  function markCommon(componentId){
    if(guided){
      setMessage('În Mod asistat zona comună este cea marcată cu punctele C. Mută / adaugă acele puncte dacă holul comun nu este corect.');
      return;
    }
    const next=new Set(excluded);
    if(next.has(componentId))next.delete(componentId);else next.add(componentId);
    recompute(next);
  }

  function addSeed(e){
    if(!guided)return;
    const r=e.currentTarget.getBoundingClientRect();
    const x=clamp((e.clientX-r.left)/r.width,0,1);
    const y=clamp((e.clientY-r.top)/r.height,0,1);

    if(seedMode==='common'){
      setCommonSeeds(v=>{
        const hit=v.findIndex(p=>Math.hypot(p.x-x,p.y-y)<.035);
        if(hit>=0)return v.filter((_,i)=>i!==hit);
        return [...v,{x,y}];
      });
    }else if(seedMode==='balconies'){
      if(!seeds.length){
        setMessage('Pune întâi punctele apartamentelor, apoi marchează balcoanele/terasele.');
        return;
      }

      // Nearest apartment seed is a very strong association on these plans:
      // a balcony sits directly outside the apartment that owns it.
      let apartmentIndex=0,best=Infinity;
      seeds.forEach((p,i)=>{
        const d=Math.hypot(p.x-x,p.y-y);
        if(d<best){best=d;apartmentIndex=i}
      });

      setBalconySeeds(v=>{
        const hit=v.findIndex(p=>Math.hypot(p.x-x,p.y-y)<.035);
        if(hit>=0)return v.filter((_,i)=>i!==hit);
        return [...v,{x,y,apartmentIndex}];
      });
    }else{
      setSeeds(v=>{
        const hit=v.findIndex(p=>Math.hypot(p.x-x,p.y-y)<.035);
        if(hit>=0)return v.filter((_,i)=>i!==hit);
        return [...v,{x,y}];
      });
    }
    setAlignmentBase(null);
    setResult(null);
  }

  async function commit(){
    if(!result?.detections?.length)return;
    const used=result.detections.map((d,i)=>mapping[i]).filter(v=>v&&v!=='new');
    if(new Set(used).size!==used.length){
      return setMessage('Același apartament existent este selectat pentru două poligoane. Schimbă maparea.');
    }

    setBusy(true);setMessage('');
    try{
      const payload={
        overwrite_existing:overwrite,
        detections:result.detections.map((d,i)=>({
          points:d.points,
          confidence:d.confidence,
          target_apartment_id:mapping[i]==='new'?null:mapping[i],
          suggested_code:`A${String(i+1).padStart(2,'0')}`
        }))
      };
      const saved=await api(`/admin/floors/${floor.id}/auto-apartments`,{method:'POST',body:payload});
      setMessage(`✓ ${saved.saved} poligoane salvate · ${saved.created} apartamente create${saved.skipped?` · ${saved.skipped} sărite`:''}`);
      await onCommitted?.();
    }catch(e){
      setMessage(`Nu am putut salva: ${e.message}`);
    }finally{setBusy(false)}
  }

  const coreText=result?.likelyCore
    ? `Zonă comună / scară probabilă detectată (${Math.round(result.likelyCore.area)} px analiză)`
    : 'Nu am identificat automat un nucleu comun închis.';

  return <div className="modal auto-detector-modal">
    <div className="modal-card auto-detector-card">
      <button className="x" onClick={onClose}>×</button>
      <div className="auto-head">
        <div><small>PNG TOPOLOGY · V4.2</small><h2>Detectează apartamentele</h2><p>Maparea Topology rămâne neschimbată. După detecție ai un pas separat „Aliniază pe centrul pereților”: măsoară PNG-ul original pe toată lungimea fiecărei laturi, continuă axul peste golurile de uși și sincronizează limitele comune.</p></div>
      </div>

      <div className="detector-settings detector-settings-v2">
        <label>Număr apartamente estimat
          <input type="number" min="1" max="50" placeholder="Auto" value={expected} onChange={e=>setExpected(e.target.value)}/>
        </label>
        <label className="detector-check">
          <input type="checkbox" checked={autoThreshold} onChange={e=>setAutoThreshold(e.target.checked)}/>
          Sensibilitate automată
        </label>
        {!autoThreshold&&<label>Sensibilitate pereți
          <input type="range" min="65" max="130" value={threshold} onChange={e=>setThreshold(e.target.value)}/>
          <small>{threshold}</small>
        </label>}
        <label className="detector-check">
          <input type="checkbox" checked={guided} onChange={e=>{
            const next=e.target.checked;
            setGuided(next);
            setSeeds([]);
            setCommonSeeds([]);
            setBalconySeeds([]);
            setSeedMode('apartments');
            setResult(null);
            setExcluded(new Set());
            setMessage('');
          }}/>
          Mod asistat
        </label>
        {!guided&&<button className="primary" disabled={busy} onClick={run}>{busy?'Analizez…':'Analizează planul'}</button>}
      </div>

      {guided&&<div className="guided-help topology-guided-help">
        <b>Mod asistat Topology:</b>
        <span>1) pune câte un punct în fiecare apartament; 2) marchează holul comun; 3) opțional, dacă un balcon/terasă nu intră automat în poligon, selectează „Balcoane / terase” și dă un click în el. Va fi atașat automat apartamentului cel mai apropiat.</span>
        <div className="seed-mode-switch">
          <button className={seedMode==='apartments'?'active':''} onClick={()=>setSeedMode('apartments')}>Apartamente</button>
          <button className={seedMode==='common'?'active common':''} onClick={()=>setSeedMode('common')}>Zonă comună</button>
          <button className={seedMode==='balconies'?'active balcony':''} onClick={()=>setSeedMode('balconies')}>Balcoane / terase</button>
        </div>
        <button onClick={()=>{setSeeds([]);setCommonSeeds([]);setBalconySeeds([]);setResult(null)}}>Șterge toate punctele</button>
      </div>}

      {guided&&!result&&<div className="guided-stage">
        <div className="guided-stage-head">
          <div>
            <b>{seedMode==='apartments'
              ? '1. Marchează apartamentele'
              : seedMode==='common'
                ? '2. Marchează zona comună'
                : '3. Marchează balcoanele / terasele'
            }</b>
            <span>{seedMode==='apartments'
              ? 'Dă câte un click aproximativ în fiecare apartament. Camerele lui se vor uni prin ușile interioare.'
              : seedMode==='common'
                ? 'Dă unul sau mai multe clickuri în holul comun / casa scării. Zona comună oprește un apartament să se verse în celelalte.'
                : 'Click în centrul fiecărui balcon/terasă lipsă. Punctul este legat automat de apartamentul cel mai apropiat.'
            }</span>
          </div>
          <strong>{seeds.length} ap. · {commonSeeds.length} comun · {balconySeeds.length} balcon</strong>
        </div>
        <div className="detector-preview guided" style={{aspectRatio:aspect||1}} onClick={addSeed}>
          <img
            src={floor.plan_path}
            alt={`Plan ${floor.name}`}
            onLoad={e=>setAspect(e.currentTarget.naturalWidth/Math.max(1,e.currentTarget.naturalHeight))}
          />
          <svg viewBox="0 0 1000 1000" preserveAspectRatio="none">
            {seeds.map((p,i)=><g key={'seedpre'+i}>
              <circle cx={p.x*1000} cy={p.y*1000} r="11" className="seed-dot"/>
              <text x={p.x*1000+16} y={p.y*1000-16} className="seed-label">{i+1}</text>
            </g>)}
            {commonSeeds.map((p,i)=><g key={'commonpre'+i}>
              <circle cx={p.x*1000} cy={p.y*1000} r="12" className="common-seed-dot"/>
              <text x={p.x*1000+16} y={p.y*1000-16} className="common-seed-label">C{i+1}</text>
            </g>)}
            {balconySeeds.map((p,i)=><g key={'balconypre'+i}>
              <circle cx={p.x*1000} cy={p.y*1000} r="11" className="balcony-seed-dot"/>
              <text x={p.x*1000+16} y={p.y*1000-16} className="balcony-seed-label">B{i+1}→{p.apartmentIndex+1}</text>
            </g>)}
          </svg>
        </div>
        <div className="guided-stage-actions">
          <small>
            {commonSeeds.length
              ? `Gata pentru analiză: ${seeds.length} apartamente + ${commonSeeds.length} puncte comune + ${balconySeeds.length} balcoane/terase marcate.`
              : 'Mai trebuie cel puțin un punct în zona comună.'
            }
          </small>
          <button disabled={!seeds.length||!commonSeeds.length||busy} className="primary" onClick={run}>
            {busy?'Analizez topologia…':`Generează ${seeds.length} apartamente`}
          </button>
        </div>
      </div>}

      {!result&&!guided&&<div className="detector-intro">
        <b>Ce face detectorul</b>
        <span>• Mod asistat Topology este varianta recomandată pentru planurile tehnice alb-negru;</span>
        <span>• pereții rămân bariere, iar golurile reale de ușă rămân deschise;</span>
        <span>• fiecare seed de apartament se propagă prin toate camerele conectate prin uși;</span>
        <span>• seed-ul de hol comun blochează propagarea spre vecini;</span>
        <span>• exteriorul planșei este tratat ca o a treia zonă concurentă, ca să nu „curgă” poligoanele în afara clădirii;</span>
        <span>• balcoanele/terasele pierdute către exterior sunt recuperate dacă au un singur apartament vecin dominant;</span>
        <span>• toate poligoanele provin din aceeași grilă comună, deci vecinii sunt tangențiali și nu se suprapun;</span>
        <span>• fiecare muchie finală este strict orizontală sau verticală: fără diagonale și fără contur după arcul ușii;</span>
        <span>• spike-urile/notch-urile foarte scurte sunt eliminate înainte de afișarea poligonului;</span>
        <span>• pereții comuni sunt împărțiți aproximativ pe axa mediană;</span>
        <span>• nimic nu se salvează până nu confirmi propunerile.</span>
      </div>}

      {result&&<>
        <div className="detector-summary">
          <b>{result.detections.length} apartamente propuse</b>
          <span>{coreText}</span>
          <small>{result.topologyGuided?'PNG Topology V4.2':'Architectural V2'} · {result.width}×{result.height}px analiză · prag {result.threshold}{guided?` · ${seeds.length} apartamente · ${commonSeeds.length} puncte comune · ${balconySeeds.length} balcoane marcate`:''}{result.topologyGuided?` · ${result.balconyRescued||0} recuperate automat · rectificare ${result.rectificationLevel||rectifyLevel}/3`:''}{result.wallAlignment?` · ax pereți ${result.wallAlignment.alignedEdges} ok / ${result.wallAlignment.unresolvedEdges} verificare`:''}</small>
          <small>{guided
            ? 'Dacă o limită intră în hol, mută sau mai adaugă un punct C în acea ramură a zonei comune și regenerează.'
            : 'Poți marca o propunere drept „zonă comună” și detectorul recalculează limitele.'
          }</small>
        </div>

        {guided&&<div className="wall-align-panel">
          <div className="wall-align-copy">
            <b>Aliniază pe centrul pereților</b>
            <span>Nu redetectează apartamentele. Folosește PNG-ul original, măsoară aceeași latură în mai multe puncte, ignoră detaliile locale și continuă axul peste golurile de uși.</span>
            {result.wallAlignment&&<small>
              {result.wallAlignment.alignedEdges} laturi aliniate · {result.wallAlignment.sharedEdges} limite comune · {result.wallAlignment.unresolvedEdges} laturi nemutate (nesigure)
            </small>}
          </div>
          <div className="wall-align-actions">
            {alignmentBase&&<button disabled={busy} onClick={restoreDetectedGeometry}>Revino la contur detectat</button>}
            <button className="primary" disabled={busy||!raw} onClick={alignToWallCenters}>
              {busy?'Aliniez…':'Aliniază pe centrul pereților'}
            </button>
          </div>
        </div>}

        {guided&&<div className="rectify-panel">
          <div className="rectify-copy">
            <b>Rectificare poligoane</b>
            <span>Curăță golurile de uși, nișele și spike-urile pe grila comună. Vecinii rămân tangențiali.</span>
          </div>
          <div className="rectify-levels">
            <button className={rectifyLevel===1?'active':''} onClick={()=>setRectifyLevel(1)}>Curat</button>
            <button className={rectifyLevel===2?'active':''} onClick={()=>setRectifyLevel(2)}>Agresiv</button>
            <button className={rectifyLevel===3?'active':''} onClick={()=>setRectifyLevel(3)}>Foarte agresiv</button>
          </div>
          <button className="primary" disabled={busy} onClick={()=>rectifyPolygons(rectifyLevel)}>
            {busy?'Rectific…':'Rectifică poligoanele'}
          </button>
        </div>}

        <div className={'detector-preview '+(guided?'guided':'')} style={{aspectRatio:aspect||1}} onClick={addSeed}>
          <img src={floor.plan_path} alt={`Plan ${floor.name}`} onLoad={e=>setAspect(e.currentTarget.naturalWidth/Math.max(1,e.currentTarget.naturalHeight))}/>
          <svg viewBox="0 0 1000 1000" preserveAspectRatio="none">
            {result.likelyCore?.points?.length>3&&<polygon
              className="common-core"
              points={result.likelyCore.points.map(p=>`${p.x*1000},${p.y*1000}`).join(' ')}
            />}
            {result.detections.map((d,i)=><polygon
              key={`${d.componentId}-${i}`}
              points={d.points.map(p=>`${p.x*1000},${p.y*1000}`).join(' ')}
              style={{fill:colors[i%colors.length]+'66',stroke:colors[i%colors.length]}}
            />)}
            {result.detections.flatMap((d,di)=>(d.alignmentIssues||[]).map((seg,si)=><line
              key={`align-issue-${di}-${si}`}
              x1={seg.a.x*1000} y1={seg.a.y*1000}
              x2={seg.b.x*1000} y2={seg.b.y*1000}
              className="wall-align-issue"
            />))}
            {seeds.map((p,i)=><g key={'seed'+i}><circle cx={p.x*1000} cy={p.y*1000} r="10" className="seed-dot"/><text x={p.x*1000+14} y={p.y*1000-14} className="seed-label">{i+1}</text></g>)}
            {commonSeeds.map((p,i)=><g key={'common'+i}><circle cx={p.x*1000} cy={p.y*1000} r="11" className="common-seed-dot"/><text x={p.x*1000+14} y={p.y*1000-14} className="common-seed-label">C{i+1}</text></g>)}
            {balconySeeds.map((p,i)=><g key={'balcony'+i}><circle cx={p.x*1000} cy={p.y*1000} r="10" className="balcony-seed-dot"/><text x={p.x*1000+14} y={p.y*1000-14} className="balcony-seed-label">B{i+1}→{p.apartmentIndex+1}</text></g>)}
          </svg>
        </div>

        <div className="detector-grid">
          {result.detections.map((d,i)=><div className="detected-unit" key={d.componentId}>
            <span className="detected-color" style={{background:colors[i%colors.length]}}/>
            <div><b>Propunere {i+1}</b><small>confidence {Math.round(d.confidence*100)}% · {d.points.length} puncte</small></div>
            <select value={mapping[i]||'new'} onChange={e=>setMapping(v=>({...v,[i]:e.target.value}))}>
              <option value="new">Creează apartament nou</option>
              {existing.map(a=><option key={a.id} value={a.id}>{a.code} · {statusLabel[a.status]}</option>)}
            </select>
            {!guided&&<button onClick={()=>markCommon(d.componentId)}>Nu e apartament</button>}
          </div>)}
        </div>

        {excluded.size>0&&<div className="excluded-list">
          <b>{excluded.size} zone marcate comune</b>
          <span>Detectorul le folosește ca separatoare și recalculează mijlocul pereților.</span>
        </div>}

        <label className="overwrite-check">
          <input type="checkbox" checked={overwrite} onChange={e=>setOverwrite(e.target.checked)}/>
          Permite suprascrierea poligoanelor existente pentru apartamentele selectate
        </label>

        <div className="detector-actions">
          <button onClick={onClose}>Renunță</button>
          <button className="primary" disabled={busy||!result.detections.length} onClick={commit}>
            {busy?'Salvez…':`Acceptă și salvează ${result.detections.length} poligoane`}
          </button>
        </div>
      </>}

      {message&&<div className={message.startsWith('✓')?'success-box':'error-box'}>{message}</div>}
    </div>
  </div>
}
