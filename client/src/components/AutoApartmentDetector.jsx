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


function technicalPlanScore(imageData){
  const d=imageData.data;
  let white=0,dark=0,colored=0,total=0;

  for(let p=0;p<d.length;p+=16){ // sample every 4th pixel
    const r=d[p],g=d[p+1],b=d[p+2],a=d[p+3];
    if(a<48)continue;
    total++;
    const max=Math.max(r,g,b),min=Math.min(r,g,b);
    const gray=.299*r+.587*g+.114*b;
    if(gray>238)white++;
    if(gray<175)dark++;
    if(max-min>22 && max<250)colored++;
  }

  if(!total)return 0;
  const whiteRatio=white/total;
  const darkRatio=dark/total;
  const coloredRatio=colored/total;

  // Technical/CAD plans have a huge white background and relatively sparse linework.
  return whiteRatio*1.25 - darkRatio*.45 + Math.min(.15,coloredRatio)*.35;
}

function buildTechnicalInk(imageData,w,h){
  const d=imageData.data,N=w*h;
  const ink=new Uint8Array(N);
  const strong=new Uint8Array(N);

  for(let i=0,p=0;i<N;i++,p+=4){
    if(d[p+3]<48)continue;
    const r=d[p],g=d[p+1],b=d[p+2];
    const max=Math.max(r,g,b),min=Math.min(r,g,b);
    const gray=.299*r+.587*g+.114*b;
    const saturation=max-min;

    // CAD plans often use light grey / blue / green wall and window lines.
    if(gray<228 || (saturation>18 && max<250))ink[i]=1;
    if(gray<178 || (saturation>42 && max<235))strong[i]=1;
  }

  const base=Math.min(w,h);
  const shortRun=Math.max(5,Math.round(base*.0055));
  const longRun=Math.max(10,Math.round(base*.011));

  // Keep directional strokes. Using two run lengths retains thin technical walls
  // but rejects a large amount of isolated room text / dimensions.
  let directional=keepLongRuns(ink,w,h,shortRun);
  const longDirectional=keepLongRuns(ink,w,h,longRun);
  for(let i=0;i<N;i++){
    if(longDirectional[i]||strong[i])directional[i]=1;
  }

  directional=morphDilate(directional,w,h);
  return directional;
}

function bridgeTechnicalGaps(src,w,h,maxGap,minSupport){
  const out=src.slice();
  const gaps=[];

  function scan(get,set,len,orientation,axis){
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
      const lenA=a[1]-a[0]+1;
      const lenB=b[1]-b[0]+1;

      if(gap>=2 && gap<=maxGap && lenA>=minSupport && lenB>=minSupport){
        const from=a[1]+1,to=b[0]-1;
        for(let k=from;k<=to;k++)set(k);
        gaps.push({orientation,axis,from,to,size:gap});
      }
    }
  }

  for(let y=0;y<h;y++){
    scan(i=>!!src[y*w+i],i=>{out[y*w+i]=1},w,'h',y);
  }

  for(let x=0;x<w;x++){
    scan(i=>!!src[i*w+x],i=>{out[i*w+x]=1},h,'v',x);
  }

  return {mask:out,gaps};
}

function technicalCells(imageData,w,h){
  const N=w*h;
  const base=Math.min(w,h);
  const ink=buildTechnicalInk(imageData,w,h);

  // First reconnect only normal door-sized / anti-alias gaps.
  const bridged=bridgeTechnicalGaps(
    ink,w,h,
    Math.max(8,Math.round(base*.022)),
    Math.max(3,Math.round(base*.0035))
  );

  let closed=bridged.mask;
  closed=morphDilate(closed,w,h);
  closed=morphDilate(closed,w,h);

  const free=new Uint8Array(N);
  for(let i=0;i<N;i++)free[i]=closed[i]?0:1;

  const cc=components(free,w,h,true);

  const minArea=Math.max(160,N*.00022);
  const maxArea=N*.15;

  const cells=cc.stats.filter(st=>{
    if(st.touchesBorder)return false;
    if(st.area<minArea||st.area>maxArea)return false;
    if(st.width<5||st.height<5)return false;
    return true;
  });

  const cellIds=new Set(cells.map(c=>c.id));
  const adjacency=new Map();

  function addEdge(a,b,gap){
    if(!a||!b||a===b||!cellIds.has(a)||!cellIds.has(b))return;
    const lo=Math.min(a,b),hi=Math.max(a,b),k=`${lo}:${hi}`;
    const e=adjacency.get(k)||{a:lo,b:hi,count:0,gaps:[]};
    e.count++;
    if(e.gaps.length<12)e.gaps.push(gap);
    adjacency.set(k,e);
  }

  // Every inserted bridge is a possible doorway/opening. Look on opposite sides
  // of the closed gap for the two room cells that it separated.
  const look=Math.max(6,Math.round(base*.016));

  for(const gap of bridged.gaps){
    const mid=Math.round((gap.from+gap.to)/2);

    if(gap.orientation==='h'){
      const x=clamp(mid,0,w-1),y=gap.axis;
      let up=0,down=0;
      for(let d=2;d<=look&&!up;d++){
        const yy=y-d;
        if(yy>=0)up=cc.labels[yy*w+x];
      }
      for(let d=2;d<=look&&!down;d++){
        const yy=y+d;
        if(yy<h)down=cc.labels[yy*w+x];
      }
      addEdge(up,down,gap);
    }else{
      const x=gap.axis,y=clamp(mid,0,h-1);
      let left=0,right=0;
      for(let d=2;d<=look&&!left;d++){
        const xx=x-d;
        if(xx>=0)left=cc.labels[y*w+xx];
      }
      for(let d=2;d<=look&&!right;d++){
        const xx=x+d;
        if(xx<w)right=cc.labels[y*w+xx];
      }
      addEdge(left,right,gap);
    }
  }

  // Keep repeated evidence only; one-pixel drafting noise must not become a door.
  const edges=[...adjacency.values()].filter(e=>e.count>=2);

  const degree=new Map(cells.map(c=>[c.id,0]));
  for(const e of edges){
    degree.set(e.a,(degree.get(e.a)||0)+1);
    degree.set(e.b,(degree.get(e.b)||0)+1);
  }

  return {ink,closed,cc,cells,edges,degree};
}

function chooseCommonCells(topology,w,h){
  const {cells,degree}=topology;
  if(!cells.length)return [];

  const centerX=w/2,centerY=h/2;
  const maxArea=Math.max(...cells.map(c=>c.area),1);
  const maxDegree=Math.max(...cells.map(c=>degree.get(c.id)||0),1);

  const scored=cells.map(c=>{
    const deg=(degree.get(c.id)||0)/maxDegree;
    const area=c.area/maxArea;
    const aspect=Math.max(c.width,c.height)/Math.max(1,Math.min(c.width,c.height));
    const elongated=Math.min(1,Math.max(0,(aspect-1.8)/4));
    const centerDist=Math.hypot(c.cx-centerX,c.cy-centerY)/Math.hypot(centerX,centerY);
    const central=1-clamp(centerDist,0,1);
    const score=deg*.48+area*.18+elongated*.18+central*.16;
    return {cell:c,score,deg,area,elongated,central};
  }).sort((a,b)=>b.score-a.score);

  if(!scored.length)return [];
  const best=scored[0];

  // Only call it common space if there is actual graph evidence.
  if((degree.get(best.cell.id)||0)<3)return [];

  const out=[best.cell.id];

  // A lobby can be split into 2-3 cells around a lift/stair core. Include direct
  // high-degree neighbours whose score is close to the main corridor.
  for(const item of scored.slice(1,8)){
    if(item.score<best.score*.68)continue;
    if((degree.get(item.cell.id)||0)<2)continue;

    const connected=topology.edges.some(e=>
      (e.a===best.cell.id&&e.b===item.cell.id) ||
      (e.b===best.cell.id&&e.a===item.cell.id)
    );
    if(connected)out.push(item.cell.id);
  }

  return out;
}

function graphGroups(topology,commonIds){
  const common=new Set(commonIds);
  const nodes=topology.cells.filter(c=>!common.has(c.id));
  const nodeSet=new Set(nodes.map(n=>n.id));
  const graph=new Map(nodes.map(n=>[n.id,[]]));

  for(const e of topology.edges){
    if(!nodeSet.has(e.a)||!nodeSet.has(e.b))continue;
    graph.get(e.a).push(e.b);
    graph.get(e.b).push(e.a);
  }

  const seen=new Set(),groups=[];

  for(const n of nodes){
    if(seen.has(n.id))continue;
    const ids=[],queue=[n.id];
    seen.add(n.id);

    while(queue.length){
      const id=queue.shift();
      ids.push(id);
      for(const next of graph.get(id)||[]){
        if(!seen.has(next)){
          seen.add(next);
          queue.push(next);
        }
      }
    }

    groups.push(ids);
  }

  return groups;
}

function topologyGroupMask(topology,groupIds,w,h){
  const idSet=new Set(groupIds);
  const mask=new Uint8Array(w*h);

  for(let i=0;i<topology.cc.labels.length;i++){
    if(idSet.has(topology.cc.labels[i]))mask[i]=1;
  }

  // Re-open only door bridges that connect two cells in the SAME apartment group.
  for(const e of topology.edges){
    if(!idSet.has(e.a)||!idSet.has(e.b))continue;
    for(const gap of e.gaps){
      if(gap.orientation==='h'){
        const y=gap.axis;
        for(let x=gap.from;x<=gap.to;x++){
          for(let yy=Math.max(0,y-2);yy<=Math.min(h-1,y+2);yy++)mask[yy*w+x]=1;
        }
      }else{
        const x=gap.axis;
        for(let y=gap.from;y<=gap.to;y++){
          for(let xx=Math.max(0,x-2);xx<=Math.min(w-1,x+2);xx++)mask[y*w+xx]=1;
        }
      }
    }
  }

  // Bring the free-space contour a little towards the wall centreline.
  return morphDilate(mask,w,h);
}

function contourForBinaryMask(mask,w,h){
  const labels=new Int16Array(mask.length);
  for(let i=0;i<mask.length;i++)if(mask[i])labels[i]=1;
  return contourForLabel(labels,1,w,h);
}

function analyzeTechnicalPlan(imageData,w,h,expected=0){
  const topology=technicalCells(imageData,w,h);
  const commonIds=chooseCommonCells(topology,w,h);
  const cellById=new Map(topology.cells.map(c=>[c.id,c]));

  let groups=graphGroups(topology,commonIds)
    .map(ids=>{
      const cells=ids.map(id=>cellById.get(id)).filter(Boolean);
      const area=cells.reduce((s,c)=>s+c.area,0);
      const cx=cells.reduce((s,c)=>s+c.cx*c.area,0)/Math.max(1,area);
      const cy=cells.reduce((s,c)=>s+c.cy*c.area,0)/Math.max(1,area);
      return {ids,cells,area,cx,cy};
    });

  const areas=groups.map(g=>g.area).sort((a,b)=>a-b);
  const median=areas.length?areas[Math.floor(areas.length/2)]:1;

  // Remove obvious tiny drafting islands / dimensions, but keep a possible studio.
  groups=groups.filter(g=>{
    if(g.area<Math.max(350,median*.28))return false;
    if(g.cells.length===1){
      const c=g.cells[0];
      const aspect=Math.min(c.width,c.height)/Math.max(c.width,c.height);
      if(aspect<.16 && g.area<median*.85)return false;
    }
    return true;
  });

  groups.sort((a,b)=>b.area-a.area);

  if(Number(expected)>0 && groups.length>Number(expected)){
    groups=groups.slice(0,Number(expected));
  }else if(!Number(expected) && groups.length>30){
    groups=groups.slice(0,30);
  }

  const detections=groups.map(g=>{
    const mask=topologyGroupMask(topology,g.ids,w,h);
    const points=contourForBinaryMask(mask,w,h);
    const roomCount=g.cells.length;
    const confidence=clamp(.62+Math.min(.20,roomCount*.025)+Math.min(.08,(g.area/Math.max(1,median))*.03),.58,.90);

    return {
      componentId:g.ids[0],
      roomIds:g.ids,
      roomCount,
      points,
      confidence,
      area:g.area,
      cx:g.cx/w,
      cy:g.cy/h
    };
  }).filter(d=>d.points.length>=4);

  detections.sort((a,b)=>{
    const rowA=Math.round(a.cy*8),rowB=Math.round(b.cy*8);
    return rowA===rowB?a.cx-b.cx:a.cy-b.cy;
  });

  let likelyCore=null;
  if(commonIds.length){
    const commonMask=new Uint8Array(w*h);
    const commonSet=new Set(commonIds);
    for(let i=0;i<topology.cc.labels.length;i++){
      if(commonSet.has(topology.cc.labels[i]))commonMask[i]=1;
    }
    const corePoints=contourForBinaryMask(morphDilate(commonMask,w,h),w,h);
    const commonCells=commonIds.map(id=>cellById.get(id)).filter(Boolean);
    likelyCore={
      id:commonIds[0],
      area:commonCells.reduce((s,c)=>s+c.area,0),
      points:corePoints,
      technical:true
    };
  }

  return {
    detections,
    initialCandidates:[],
    excludedIds:new Set(),
    likelyCore,
    threshold:'topology',
    expected:Number(expected)||0,
    width:w,
    height:h,
    technical:true,
    roomCount:topology.cells.length,
    doorEdges:topology.edges.length,
    commonCount:commonIds.length
  };
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

async function loadPlan(url,maxDim=1400){
  const r=await fetch(url,{mode:'cors'});
  if(!r.ok)throw new Error(`Nu pot încărca planul (${r.status}).`);
  const blob=await r.blob();
  const bmp=await createImageBitmap(blob);
  const byDim=Math.min(1,maxDim/Math.max(bmp.width,bmp.height));
  const byPixels=Math.min(1,Math.sqrt(1800000/Math.max(1,bmp.width*bmp.height)));
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
  const [guided,setGuided]=useState(false);
  const [seeds,setSeeds]=useState([]);
  const [planMode,setPlanMode]=useState('auto');
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
      const technicalAuto=technicalPlanScore(loaded.imageData)>.80;
      const useTechnical=!guided && (planMode==='technical' || (planMode==='auto'&&technicalAuto));

      const r=useTechnical
        ? analyzeTechnicalPlan(loaded.imageData,loaded.w,loaded.h,expected)
        : autoThreshold
          ? analyzeAuto(loaded.imageData,loaded.w,loaded.h,expected,new Set(),guided?seeds:[])
          : analyzePixels(loaded.imageData,loaded.w,loaded.h,Number(threshold)||95,expected,new Set(),guided?seeds:[]);
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
    const technicalAuto=technicalPlanScore(raw.imageData)>.80;
    const useTechnical=!guided && (planMode==='technical' || (planMode==='auto'&&technicalAuto));

    const r=useTechnical
      ? analyzeTechnicalPlan(raw.imageData,raw.w,raw.h,expected)
      : autoThreshold
        ? analyzeAuto(raw.imageData,raw.w,raw.h,expected,nextExcluded,guided?seeds:[])
        : analyzePixels(raw.imageData,raw.w,raw.h,Number(threshold)||95,expected,nextExcluded,guided?seeds:[]);
    setExcluded(nextExcluded);setResult(r);
    const m={};
    r.detections.forEach((d,i)=>{m[i]=existing[i]?.id||'new'});
    setMapping(m);
  }

  function markCommon(componentId){
    if(result?.technical){
      setMessage('În modul Topology V5 zona comună este calculată din graful camerelor. Reglajul manual al core-ului îl adăugăm separat.');
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

    setSeeds(v=>{
      const hit=v.findIndex(p=>Math.hypot(p.x-x,p.y-y)<.035);
      if(hit>=0)return v.filter((_,i)=>i!==hit);
      return [...v,{x,y}];
    });
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
        <div><small>AUTO-DETECT · TOPOLOGY V5</small><h2>Detectează apartamentele</h2><p>În modul tehnic, detectorul nu mai caută doar „pete” mari. Închide virtual golurile de ușă, separă camerele, construiește un graf de conexiuni și încearcă să scoată holul comun înainte să grupeze camerele în apartamente.</p></div>
      </div>

      <div className="detector-settings detector-settings-v2">
        <label>Tip plan
          <select value={planMode} onChange={e=>{setPlanMode(e.target.value);setResult(null);setMessage('')}}>
            <option value="auto">Auto</option>
            <option value="technical">Plan tehnic / CAD</option>
            <option value="rendered">Plan randat / color</option>
          </select>
        </label>
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
            setResult(null);
            setExcluded(new Set());
            setMessage('');
          }}/>
          Mod asistat
        </label>
        {!guided&&<button className="primary" disabled={busy} onClick={run}>{busy?'Analizez…':'Analizează planul'}</button>}
      </div>

      {guided&&<div className="guided-help">
        <b>Mod asistat:</b> planul apare imediat mai jos. Click o dată în fiecare apartament. Click din nou lângă un punct ca să-l ștergi.
        <button onClick={()=>{setSeeds([]);setResult(null)}}>Șterge punctele</button>
      </div>}

      {guided&&!result&&<div className="guided-stage">
        <div className="guided-stage-head">
          <div>
            <b>1. Marchează apartamentele</b>
            <span>Dă câte un click aproximativ în centrul fiecărui apartament. Nu trebuie să nimerești perfect și nu trebuie să trasezi conturul.</span>
          </div>
          <strong>{seeds.length} puncte</strong>
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
          </svg>
        </div>
        <div className="guided-stage-actions">
          <small>După ce ai câte un punct în fiecare apartament, apasă „Generează din {seeds.length} puncte”.</small>
          <button disabled={!seeds.length||busy} className="primary" onClick={run}>
            {busy?'Analizez…':`Generează din ${seeds.length} puncte`}
          </button>
        </div>
      </div>}

      {!result&&!guided&&<div className="detector-intro">
        <b>Ce face detectorul</b>
        <span>• Auto recunoaște planurile tehnice cu mult fundal alb și linework subțire;</span>
        <span>• în Plan tehnic / CAD folosește și linii gri/colorate, nu doar pereți negri;</span>
        <span>• închide virtual golurile de dimensiune apropiată de uși și separă camerele;</span>
        <span>• reconstruiește conexiunile dintre camere din acele goluri;</span>
        <span>• caută holul/lobby-ul comun după gradul de conectivitate, formă și poziție;</span>
        <span>• după eliminarea holului comun, camerele interconectate sunt grupate ca apartamente;</span>
        <span>• balcoanele rămân în același grup dacă au conexiune de ușă către apartament;</span>
        <span>• pentru planuri randate păstrează detectorul Architectural V2;</span>
        <span>• caută întâi trasee lungi de perete, nu orice pixel întunecat;</span>
        <span>• mobilierul, textele și detaliile mici sunt filtrate înainte de segmentare;</span>
        <span>• golurile mici din pereți (uși / antialiasing) sunt reconectate controlat;</span>
        <span>• limitele dintre apartamente sunt împinse spre axa mediană a pereților comuni;</span>
        <span>• conturul final este reconstruit din segmente arhitecturale 0° / 45° / 90° / 135° și muchii lungi reale;</span>
        <span>• în Mod asistat dai doar câte un click în fiecare apartament; detectorul construiește singur contururile;</span>
        <span>• nimic nu se salvează până nu confirmi propunerile.</span>
      </div>}

      {result&&<>
        <div className="detector-summary">
          <b>{result.detections.length} apartamente propuse</b>
          <span>{coreText}</span>
          <small>
            {result.technical
              ? `Topology V5 · ${result.roomCount||0} camere/celule · ${result.doorEdges||0} conexiuni · ${result.commonCount||0} zone comune`
              : `Architectural V2 · ${result.width}×${result.height}px analiză · prag ${result.threshold}${guided?` · ${seeds.length} puncte-ghid`:''}`
            }
          </small>
          <small>Poți marca o propunere drept „zonă comună” și detectorul recalculează limitele.</small>
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
            <button onClick={()=>markCommon(d.componentId)}>Nu e apartament</button>
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
