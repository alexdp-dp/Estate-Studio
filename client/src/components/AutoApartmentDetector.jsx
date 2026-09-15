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


function compressAxisAligned(points){
  let out=points.slice();
  if(out.length>1){
    const first=out[0],last=out[out.length-1];
    if(first[0]===last[0]&&first[1]===last[1])out.pop();
  }
  out=out.filter((p,i)=>i===0||p[0]!==out[i-1][0]||p[1]!==out[i-1][1]);
  let changed=true,guard=0;
  while(changed&&out.length>4&&guard++<20){
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

function clusterValues(values,tol){
  const sorted=[...new Set(values)].sort((a,b)=>a-b);
  const groups=[];
  for(const v of sorted){
    const g=groups[groups.length-1];
    if(g&&Math.abs(v-g.mean)<=tol){
      g.values.push(v);
      g.mean=g.values.reduce((a,b)=>a+b,0)/g.values.length;
    }else{
      groups.push({values:[v],mean:v});
    }
  }
  const map=new Map();
  groups.forEach(g=>{
    const snapped=Math.round(g.values.reduce((a,b)=>a+b,0)/g.values.length);
    g.values.forEach(v=>map.set(v,snapped));
  });
  return map;
}

function snapOrthogonalGrid(points,tol=4){
  const xs=points.map(p=>p[0]);
  const ys=points.map(p=>p[1]);
  const mx=clusterValues(xs,tol),my=clusterValues(ys,tol);
  return points.map(([x,y])=>[mx.get(x)??x,my.get(y)??y]);
}

function flattenNotches(points,depthTol,spanTol){
  let out=compressAxisAligned(points),guard=0,changed=true;
  while(changed&&out.length>4&&guard++<100){
    changed=false;
    const next=[];
    for(let i=0;i<out.length;i++){
      const a=out[(i-1+out.length)%out.length];
      const b=out[i];
      const c=out[(i+1)%out.length];
      const d=out[(i+2)%out.length];
      const e=out[(i+3)%out.length];

      const horizontalNotch = a[1]===b[1] && b[0]===c[0] && c[1]===d[1] && d[0]===e[0] && a[1]===e[1] && Math.sign(c[1]-b[1])===-Math.sign(e[1]-d[1]);
      const verticalNotch = a[0]===b[0] && b[1]===c[1] && c[0]===d[0] && d[1]===e[1] && a[0]===e[0] && Math.sign(c[0]-b[0])===-Math.sign(e[0]-d[0]);

      if(horizontalNotch){
        const depth=Math.abs(c[1]-b[1]);
        const span=Math.abs(d[0]-c[0]);
        if(depth<=depthTol && span<=spanTol){
          next.push([e[0],e[1]]);
          i+=3;
          changed=true;
          continue;
        }
      }
      if(verticalNotch){
        const depth=Math.abs(c[0]-b[0]);
        const span=Math.abs(d[1]-c[1]);
        if(depth<=depthTol && span<=spanTol){
          next.push([e[0],e[1]]);
          i+=3;
          changed=true;
          continue;
        }
      }
      next.push(b);
    }
    out=compressAxisAligned(next);
  }
  return out;
}

function pruneShortOrthogonalEdges(points,minLen){
  let out=compressAxisAligned(points),guard=0,changed=true;
  while(changed&&out.length>4&&guard++<50){
    changed=false;
    const next=[];
    for(let i=0;i<out.length;i++){
      const a=out[(i-1+out.length)%out.length];
      const b=out[i];
      const c=out[(i+1)%out.length];
      const len=Math.hypot(c[0]-b[0],c[1]-b[1]);
      if(len<minLen){
        const merged=[b[0],b[1]];
        if(a[0]===b[0]&&c[1]===b[1]){
          merged[0]=a[0]; merged[1]=c[1];
        }else if(a[1]===b[1]&&c[0]===b[0]){
          merged[0]=c[0]; merged[1]=a[1];
        }
        next.push(merged);
        changed=true;
        continue;
      }
      next.push(b);
    }
    out=compressAxisAligned(next);
  }
  return out;
}

function orthogonalPolygonize(loop,w,h){
  if(loop.length<4)return loop;
  const dim=Math.max(w,h);
  const gridTol=Math.max(2,Math.round(dim*.0025));
  const depthTol=Math.max(10,Math.round(dim*.020));
  const spanTol=Math.max(24,Math.round(dim*.055));
  const minEdge=Math.max(6,Math.round(dim*.010));

  let pts=compressAxisAligned(loop);
  pts=snapOrthogonalGrid(pts,gridTol);
  pts=flattenNotches(pts,depthTol,spanTol);
  pts=pruneShortOrthogonalEdges(pts,minEdge);
  pts=flattenNotches(pts,Math.round(depthTol*.8),Math.round(spanTol*.8));
  pts=snapOrthogonalGrid(pts,gridTol);
  pts=compressAxisAligned(pts);

  return pts.map(([x,y])=>[clamp(x,0,w),clamp(y,0,h)]);
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
  const polygon=orthogonalPolygonize(chosen,w,h);
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

function fillGuidedFreeSpace(free,w,h,apartmentSeeds,commonSeeds){
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


function assignInteriorExteriorPockets(labelMap,w,h){
  const N=w*h;
  const seen=new Uint8Array(N);
  const queue=new Int32Array(N);

  for(let i=0;i<N;i++){
    if(labelMap[i]!==-2||seen[i])continue;
    let head=0,tail=0;
    queue[tail++]=i; seen[i]=1;
    const cells=[];
    let touchesBorder=false;
    const contacts=new Map();

    while(head<tail){
      const idx=queue[head++];
      cells.push(idx);
      const y=Math.floor(idx/w),x=idx-y*w;
      if(x===0||y===0||x===w-1||y===h-1)touchesBorder=true;
      const ns=[];
      if(y>0)ns.push(idx-w);
      if(x>0)ns.push(idx-1);
      if(x<w-1)ns.push(idx+1);
      if(y<h-1)ns.push(idx+w);
      for(const n of ns){
        const lab=labelMap[n];
        if(lab===-2){
          if(!seen[n]){seen[n]=1;queue[tail++]=n}
        }else if(lab>0){
          contacts.set(lab,(contacts.get(lab)||0)+1);
        }
      }
    }

    if(touchesBorder||!contacts.size)continue;
    const ranked=[...contacts.entries()].sort((a,b)=>b[1]-a[1]);
    const [bestLabel,bestScore]=ranked[0];
    const secondScore=ranked[1]?.[1]||0;
    if(bestScore>=6 && bestScore>=secondScore*1.35){
      for(const idx of cells)labelMap[idx]=bestLabel;
    }
  }
  return labelMap;
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

function analyzeGuidedTopology(imageData,w,h,threshold,apartmentSeeds,commonSeeds){
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

  const freeLabels=fillGuidedFreeSpace(
    free,w,h,
    apartmentSeeds||[],
    commonSeeds||[]
  );

  const finalLabels=assignInteriorExteriorPockets(splitWallToMidline(freeLabels,wall,w,h),w,h);

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

    const points=contourForLabel(finalLabels,label,w,h);
    if(points.length<4)continue;

    detections.push({
      componentId:`topology-${label}`,
      seedIndex:label-1,
      points,
      confidence:.96,
      area,
      cx:(sumX/area)/w,
      cy:(sumY/area)/h
    });
  }

  detections.sort((a,b)=>a.seedIndex-b.seedIndex);

  let commonArea=0;
  for(let i=0;i<N;i++)if(freeLabels[i]===-1)commonArea++;

  let commonPoints=[];
  if(commonArea){
    const commonOnly=new Int16Array(N);
    for(let i=0;i<N;i++)if(finalLabels[i]===-1)commonOnly[i]=1;
    commonPoints=contourForLabel(commonOnly,1,w,h);
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
    width:w,
    height:h,
    topologyGuided:true
  };
}

function analyzeGuidedAuto(imageData,w,h,apartmentSeeds,commonSeeds){
  let best=null,bestScore=-1e9;
  for(const t of [75,85,95,105,115,125,135,145]){
    const r=analyzeGuidedTopology(imageData,w,h,t,apartmentSeeds,commonSeeds);
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
  const [seedMode,setSeedMode]=useState('apartments');
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
            ? analyzeGuidedAuto(loaded.imageData,loaded.w,loaded.h,seeds,commonSeeds)
            : analyzeGuidedTopology(loaded.imageData,loaded.w,loaded.h,Number(threshold)||105,seeds,commonSeeds))
        : (autoThreshold
            ? analyzeAuto(loaded.imageData,loaded.w,loaded.h,expected,new Set(),[])
            : analyzePixels(loaded.imageData,loaded.w,loaded.h,Number(threshold)||95,expected,new Set(),[]));
      setExcluded(new Set());
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
          ? analyzeGuidedAuto(raw.imageData,raw.w,raw.h,seeds,commonSeeds)
          : analyzeGuidedTopology(raw.imageData,raw.w,raw.h,Number(threshold)||105,seeds,commonSeeds))
      : (autoThreshold
          ? analyzeAuto(raw.imageData,raw.w,raw.h,expected,nextExcluded,[])
          : analyzePixels(raw.imageData,raw.w,raw.h,Number(threshold)||95,expected,nextExcluded,[]));
    setExcluded(guided?new Set():nextExcluded);setResult(r);
    const m={};
    r.detections.forEach((d,i)=>{m[i]=existing[i]?.id||'new'});
    setMapping(m);
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
    }else{
      setSeeds(v=>{
        const hit=v.findIndex(p=>Math.hypot(p.x-x,p.y-y)<.035);
        if(hit>=0)return v.filter((_,i)=>i!==hit);
        return [...v,{x,y}];
      });
    }
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
        <div><small>PNG TOPOLOGY · V4</small><h2>Detectează apartamentele</h2><p>Optimizat pentru planuri tehnice curate ca al tău: pereții sunt bariere, ușile rămân treceri, holul comun concurează cu fiecare apartament, balcoanele interioare sunt reasignate la unitatea vecină, iar contururile finale sunt rectificate ortogonal.</p></div>
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
        <span>1) pune câte un punct în fiecare apartament; 2) schimbă pe „Zonă comună” și pune cel puțin un punct în holul comun / casa scării. Poți pune mai multe puncte comune dacă holul are ramuri.</span>
        <div className="seed-mode-switch">
          <button className={seedMode==='apartments'?'active':''} onClick={()=>setSeedMode('apartments')}>Apartamente</button>
          <button className={seedMode==='common'?'active common':''} onClick={()=>setSeedMode('common')}>Zonă comună</button>
        </div>
        <button onClick={()=>{setSeeds([]);setCommonSeeds([]);setResult(null)}}>Șterge toate punctele</button>
      </div>}

      {guided&&!result&&<div className="guided-stage">
        <div className="guided-stage-head">
          <div>
            <b>{seedMode==='apartments'?'1. Marchează apartamentele':'2. Marchează zona comună'}</b>
            <span>{seedMode==='apartments'
              ? 'Dă câte un click aproximativ în fiecare apartament. Camerele lui se vor uni prin ușile interioare, iar balcoanele conectate vor fi atașate la final.'
              : 'Dă unul sau mai multe clickuri în holul comun / casa scării. Zona comună oprește un apartament să se verse în celelalte.'
            }</span>
          </div>
          <strong>{seeds.length} ap. · {commonSeeds.length} comun</strong>
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
          </svg>
        </div>
        <div className="guided-stage-actions">
          <small>
            {commonSeeds.length
              ? `Gata pentru analiză: ${seeds.length} apartamente + ${commonSeeds.length} puncte comune.`
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
        <span>• balcoanele/terasele sunt incluse dacă sunt închise de contur și accesibile din apartament;</span>
        <span>• pereții comuni sunt împărțiți aproximativ pe axa mediană;</span>
        <span>• nimic nu se salvează până nu confirmi propunerile.</span>
      </div>}

      {result&&<>
        <div className="detector-summary">
          <b>{result.detections.length} apartamente propuse</b>
          <span>{coreText}</span>
          <small>{result.topologyGuided?'PNG Topology V4':'Architectural V2'} · {result.width}×{result.height}px analiză · prag {result.threshold}{guided?` · ${seeds.length} apartamente · ${commonSeeds.length} puncte comune`:''}</small>
          <small>{guided
            ? 'Dacă o limită intră în hol, mută sau mai adaugă un punct C în acea ramură a zonei comune și regenerează.'
            : 'Poți marca o propunere drept „zonă comună” și detectorul recalculează limitele.'
          }</small>
        </div>

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
            {seeds.map((p,i)=><g key={'seed'+i}><circle cx={p.x*1000} cy={p.y*1000} r="10" className="seed-dot"/><text x={p.x*1000+14} y={p.y*1000-14} className="seed-label">{i+1}</text></g>)}
            {commonSeeds.map((p,i)=><g key={'common'+i}><circle cx={p.x*1000} cy={p.y*1000} r="11" className="common-seed-dot"/><text x={p.x*1000+14} y={p.y*1000-14} className="common-seed-label">C{i+1}</text></g>)}
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
